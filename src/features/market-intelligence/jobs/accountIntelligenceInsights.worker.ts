import { createHash } from 'node:crypto';
import { Worker, Queue, type Job } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { requestContext } from '../../../lib/async-context.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import {
  computeAccountScore,
  decideNextBestAction,
  ACCOUNT_SCORE_VERSION,
  type AccountScoreDecisionMakerInput,
  type AccountScoreSignalInput,
} from '../domain/accountInsights.js';

/**
 * D.1/D.5 do audit da Fase 0 (`.agents/runs/ldr-fase-0-auditoria.md`): até aqui nada persistia
 * `AccountScore` nem `AccountRecommendation` — a fundação/API/UI do LDR existiam, mas a etapa de
 * GERAÇÃO de inteligência não. Este worker fecha isso: varre contas do tenant e recalcula score +
 * Next Best Action a partir de dado real já persistido (lookalikeScore, AccountSignal ativo,
 * DecisionMaker ativo) — nunca fabrica; contas sem `AccountIntelligenceSnapshot` (nunca
 * refrescadas) são puladas dentro de `computeAndPersistForAccount`, não excluídas na descoberta
 * (ver comentário em `scanAndGenerateAccountInsights` sobre por que a descoberta não filtra por
 * relação com `AccountIntelligenceSnapshot`).
 *
 * Descoberta cross-tenant SEM bypassar `Company`: `Company` foi cogitado para
 * `BYPASS_RLS_ALLOWED_MODELS` (`src/lib/prisma.ts`) e revertido —
 * `tests/integration/rls-bypass-allowlist.test.ts` prova, a nível de banco, que a migration
 * 20260825120000 (ITEM-02) excluiu Company de propósito (dado comercial sensível). Em vez disso,
 * este worker bypassa só `Organization` (já permitido) para listar as organizações existentes, e
 * escopa `Company` por tenant real (`requestContext.run({ tenantId })`) uma organização de cada
 * vez — nunca lê `Company` sob bypass.
 */

export const ACCOUNT_INSIGHTS_QUEUE_NAME = 'account-intelligence-insights';
const SCAN_INTERVAL_MS = 15 * 60 * 1000;
const MAX_ACCOUNTS_PER_TICK = 200;
const MAX_ACCOUNTS_PER_ORGANIZATION_PER_TICK = 50;

function hashInput(value: unknown): string {
  const canonical = JSON.stringify(value, Object.keys(value as object).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

interface AccountForInsights {
  id: string;
  organizationId: string;
  lookalikeScore: number | null;
}

async function computeAndPersistForAccount(account: AccountForInsights, now: Date): Promise<void> {
  await requestContext.run({ tenantId: account.organizationId }, async () => {
    const [latestSnapshot, activeSignals, decisionMakers] = await Promise.all([
      prisma.accountIntelligenceSnapshot.findFirst({
        where: { companyId: account.id, organizationId: account.organizationId },
        orderBy: [{ version: 'desc' }, { generatedAt: 'desc' }],
        select: { id: true },
      }),
      prisma.accountSignal.findMany({
        where: { companyId: account.id, organizationId: account.organizationId, status: 'Active' },
        select: { type: true, detectedAt: true },
      }),
      prisma.decisionMaker.findMany({
        where: { companyId: account.id, organizationId: account.organizationId },
        select: { status: true, confidence: true },
      }),
    ]);

    // Sem snapshot, não há o que pontuar/recomendar de verdade — este worker só varre contas com
    // `intelligenceSnapshots: { some: {} }` (ver scanAndGenerateAccountInsights), mas a conta pode
    // ter sido excluída/perdido o snapshot entre a descoberta e este ponto.
    if (!latestSnapshot) return;

    const signalInputs: AccountScoreSignalInput[] = activeSignals.map((signal) => ({
      type: signal.type,
      detectedAt: signal.detectedAt,
    }));
    const decisionMakerInputs: AccountScoreDecisionMakerInput[] = decisionMakers.map((dm) => ({
      status: dm.status,
      confidence: dm.confidence,
    }));

    const score = computeAccountScore(
      {
        lookalikeScore: account.lookalikeScore,
        activeSignals: signalInputs,
        decisionMakers: decisionMakerInputs,
      },
      now,
    );
    const scoreInputHash = hashInput({
      lookalikeScore: account.lookalikeScore,
      signals: signalInputs.map((s) => `${s.type}:${s.detectedAt.toISOString()}`).sort(),
      decisionMakers: decisionMakerInputs.map((dm) => `${dm.status}:${dm.confidence}`).sort(),
    });

    const existingScore = await prisma.accountScore.findFirst({
      where: {
        companyId: account.id,
        organizationId: account.organizationId,
        scoreVersion: ACCOUNT_SCORE_VERSION,
        inputHash: scoreInputHash,
      },
      select: { id: true },
      orderBy: { calculatedAt: 'desc' },
    });

    const persistedScore =
      existingScore ??
      (await prisma.accountScore.create({
        data: {
          organizationId: account.organizationId,
          companyId: account.id,
          snapshotId: latestSnapshot.id,
          total: score.total,
          fit: score.fit,
          timing: score.timing,
          intent: score.intent,
          relationship: score.relationship,
          positiveReasons: score.positiveReasons,
          negativeReasons: score.negativeReasons,
          calculation: score.calculation,
          scoreVersion: ACCOUNT_SCORE_VERSION,
          inputHash: scoreInputHash,
        },
        select: { id: true },
      }));

    const activeDecisionMakerCount = decisionMakerInputs.filter(
      (dm) => dm.status === 'Active',
    ).length;
    const decision = decideNextBestAction({
      fit: score.fit,
      hasLookalikeScore: account.lookalikeScore !== null,
      activeSignalCount: signalInputs.length,
      activeDecisionMakerCount,
    });
    const recommendationInputHash = hashInput({
      scoreInputHash,
      actionType: decision.actionType,
    });

    const existingRecommendation = await prisma.accountRecommendation.findFirst({
      where: {
        companyId: account.id,
        organizationId: account.organizationId,
        actionType: decision.actionType,
        inputHash: recommendationInputHash,
      },
      select: { id: true },
    });
    if (existingRecommendation) return;

    // Uma nova recomendação com ação diferente supera as pendentes anteriores — evita acumular
    // recomendações contraditórias (ex.: RESEARCH_MORE e CREATE_BITRIX_TASK) ambas "Pending" ao
    // mesmo tempo para a mesma conta.
    await prisma.accountRecommendation.updateMany({
      where: {
        companyId: account.id,
        organizationId: account.organizationId,
        status: 'Pending',
        actionType: { not: decision.actionType },
      },
      data: {
        status: 'Superseded',
        statusReason: `Superada por nova recomendação: ${decision.actionType}.`,
      },
    });

    await prisma.accountRecommendation.create({
      data: {
        organizationId: account.organizationId,
        companyId: account.id,
        snapshotId: latestSnapshot.id,
        accountScoreId: persistedScore.id,
        actionType: decision.actionType,
        title: decision.title,
        rationale: decision.rationale,
        priority: decision.priority,
        expectedImpact: decision.expectedImpact,
        recommendationVersion: ACCOUNT_SCORE_VERSION,
        inputHash: recommendationInputHash,
        generatedBy: 'system:account-intelligence-insights-worker.v1',
      },
    });
  });
}

export async function scanAndGenerateAccountInsights(
  now: Date = new Date(),
): Promise<{ processed: number; errors: number }> {
  const organizationIds = await requestContext.run({ bypassRls: true }, async () => {
    const organizations = await prisma.organization.findMany({ select: { id: true } });
    return organizations.map((organization) => organization.id);
  });

  const accounts: AccountForInsights[] = [];
  for (const organizationId of organizationIds) {
    if (accounts.length >= MAX_ACCOUNTS_PER_TICK) break;
    // Company nunca é lida sob bypass (ver comentário do módulo) — cada organização é escopada
    // por tenant real antes de listar suas próprias contas.
    const companies = await requestContext.run({ tenantId: organizationId }, () =>
      prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true, lookalikeScore: true },
        take: Math.min(MAX_ACCOUNTS_PER_ORGANIZATION_PER_TICK, MAX_ACCOUNTS_PER_TICK - accounts.length),
      }),
    );
    for (const company of companies) {
      accounts.push({ id: company.id, organizationId, lookalikeScore: company.lookalikeScore });
    }
  }

  let processed = 0;
  let errors = 0;

  for (const account of accounts) {
    try {
      await computeAndPersistForAccount(account, now);
      processed += 1;
    } catch (err) {
      errors += 1;
      logger.error(
        { err, organizationId: account.organizationId, companyId: account.id },
        'Falha ao calcular insights de Account Intelligence para a conta.',
      );
    }
  }

  return { processed, errors };
}

export function createAccountIntelligenceInsightsWorker(): Worker {
  const worker = new Worker(
    ACCOUNT_INSIGHTS_QUEUE_NAME,
    async (_job: Job) => {
      const result = await scanAndGenerateAccountInsights();
      logger.info(result, 'Account intelligence insights scan finalizado.');
    },
    { connection: connection as any, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Account intelligence insights worker job falhou');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: ACCOUNT_INSIGHTS_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

  worker.on('error', (err) => {
    logger.warn({ err }, 'Account intelligence insights worker error suppressed (Redis offline)');
  });

  return worker;
}

export async function scheduleAccountIntelligenceInsightsJob(): Promise<void> {
  const queue = new Queue(ACCOUNT_INSIGHTS_QUEUE_NAME, { connection: connection as any });
  await queue.upsertJobScheduler(
    'account-intelligence-insights-tick',
    { every: SCAN_INTERVAL_MS },
    { name: 'scan-account-intelligence-insights', data: {} },
  );
  logger.info({ everyMs: SCAN_INTERVAL_MS }, 'Account intelligence insights scan job scheduled');
}
