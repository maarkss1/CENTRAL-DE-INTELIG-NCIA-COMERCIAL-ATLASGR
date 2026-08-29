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
import { classifyBuyingRole } from '../domain/accountDecisionMakers.js';
import {
  matchEconomicGroupByCnpjRoot,
  matchEconomicGroupCamada2e3,
  } from '../domain/accountEconomicGroup.js';

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
  cnpj: string | null;
  qsa?: any;
  website?: string | null;
}

/**
 * D.3: classifica cada `Contact` da conta que ainda não tem `DecisionMaker` — nunca reclassifica
 * um já existente (o registro pode ter sido corrigido/verificado por um humano depois de criado;
 * um worker automático nunca sobrescreve isso). `classifyBuyingRole` devolve `null` quando não há
 * cargo/senioridade suficiente; esse contato simplesmente não vira `DecisionMaker` nesta rodada,
 * em vez de gerar um registro sem base real.
 */
async function generateDecisionMakersForAccount(account: AccountForInsights): Promise<void> {
  const existingContactIds = await prisma.decisionMaker.findMany({
    where: { companyId: account.id, organizationId: account.organizationId },
    select: { contactId: true },
  });
  const alreadyClassified = new Set(existingContactIds.map((row) => row.contactId));

  const contacts = await prisma.contact.findMany({
    where: { companyId: account.id, organizationId: account.organizationId, status: 'Ativo' },
    select: { id: true, role: true, seniority: true, department: true },
  });

  for (const contact of contacts) {
    if (alreadyClassified.has(contact.id)) continue;
    const classification = classifyBuyingRole({
      role: contact.role,
      seniority: contact.seniority,
      department: contact.department,
    });
    if (!classification) continue;

    await prisma.decisionMaker.create({
      data: {
        organizationId: account.organizationId,
        companyId: account.id,
        contactId: contact.id,
        buyingRole: classification.buyingRole,
        roleEvidenceType: 'INFERENCE',
        source: 'system:account-intelligence-insights-worker.v1',
        confidence: classification.confidence,
        // Unverified (default do schema): inferência automática não vira "Active" sozinha — Active
        // exige verifiedAt (constraint DecisionMaker_active_requires_verification), reservado para
        // quando um humano revisar. Só então esse decisor passa a contar no Account Score.
      },
    });
  }
}

/**
 * D.4 (Camada 1 do grupo econômico): matriz/filial por raiz de CNPJ, determinístico. Roda uma vez
 * por organização (não por conta) — todas as contas do lote desta organização entram no mesmo
 * agrupamento, então uma dupla só é processada uma vez por tick, não uma vez por lado do par.
 */
async function generateEconomicRelationshipsForOrganization(
  organizationId: string,
  companies: any[],
  now: Date,
): Promise<void> {
  const matches = matchEconomicGroupByCnpjRoot(companies);
  const camada2e3Matches = matchEconomicGroupCamada2e3(companies);
  
  const allMatches = [
    ...matches.map(m => ({ ...m, relationType: 'MATRIZ_FILIAL', confidence: 1, reason: m.cnpjRoot, status: 'Verified' })),
    ...camada2e3Matches.map(m => ({ ...m, status: 'Inferred' }))
  ];

  if (allMatches.length === 0) return;

  await requestContext.run({ tenantId: organizationId }, async () => {
    for (const match of allMatches) {
      const dedupeKey = match.relationType === 'MATRIZ_FILIAL' 
        ? `cnpj-root:${match.reason}:${match.sourceCompanyId}:${match.targetCompanyId}`
        : `camada23:${match.relationType}:${match.sourceCompanyId}:${match.targetCompanyId}`;
      
      const existing = await prisma.economicRelationship.findFirst({
        where: { organizationId, dedupeKey },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.economicRelationship.create({
        data: {
          organizationId,
          sourceCompanyId: match.sourceCompanyId,
          targetCompanyId: match.targetCompanyId,
          relationType: match.relationType,
          status: match.status as 'Verified' | 'Inferred',
          source: 'system:account-intelligence-insights-worker.v1',
          confidence: match.confidence,
          dedupeKey,
                    createdAt: now,
          verifiedAt: match.status === 'Verified' ? now : null,
        },
      });
    }
  });
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

    // D.3: classifica decisores a partir dos Contacts reais da conta antes de recalcular o score —
    // não afeta a dimensão `relationship` nesta mesma rodada (decisor recém-criado nasce
    // Unverified, só um humano promove pra Active), mas mantém a lista de decisores sempre
    // atualizada para quem consultar `listDecisionMakers` logo em seguida.
    await generateDecisionMakersForAccount(account);

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
  let errors = 0;

  for (const organizationId of organizationIds) {
    if (accounts.length >= MAX_ACCOUNTS_PER_TICK) break;
    // Company nunca é lida sob bypass (ver comentário do módulo) — cada organização é escopada
    // por tenant real antes de listar suas próprias contas.
    const companies = await requestContext.run({ tenantId: organizationId }, () =>
      prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true, lookalikeScore: true, cnpj: true, qsa: true, website: true },
        take: Math.min(
          MAX_ACCOUNTS_PER_ORGANIZATION_PER_TICK,
          MAX_ACCOUNTS_PER_TICK - accounts.length,
        ),
      }),
    );
    for (const company of companies) {
      accounts.push({
        id: company.id,
        organizationId,
        lookalikeScore: company.lookalikeScore,
        cnpj: company.cnpj,
      });
    }

    // D.4: agrupamento de CNPJ roda uma vez por organização, com todas as contas do lote desta
    // organização — não por conta, para não processar cada dupla duas vezes.
    try {
      await generateEconomicRelationshipsForOrganization(organizationId, companies, now);
    } catch (err) {
      errors += 1;
      logger.error(
        { err, organizationId },
        'Falha ao gerar relações de grupo econômico (D.4) para a organização.',
      );
    }
  }

  let processed = 0;

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


