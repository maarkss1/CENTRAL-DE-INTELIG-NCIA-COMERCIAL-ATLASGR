import { prisma } from '../../../lib/prisma.js';
import { requestContext } from '../../../lib/async-context.js';
import { acquireDistributedLock } from '../../../lib/queue/distributedLock.js';
import { logger } from '../../../lib/logger.js';
import { fromPrismaLeadStatus, toPrismaLeadStatus } from '../../../lib/enumMap.js';
import type { LeadStatus } from '../../../lib/zod.js';
import { automationEngine } from '../automation.engine.js';

/**
 * Gatilho de estagnação: expande o motor de automação (Onda 7) além dos 3 gatilhos "em tempo real"
 * originais (`automation.engine.ts`). "Lead mudou de status" só dispara na transição — não existe
 * jeito de configurar "avise quando um negócio ficar parado" com um motor puramente orientado a
 * evento. Este scanner fecha essa lacuna sem precisar de um novo valor no enum
 * `AutomationTrigger`/`AutomationAction` do Postgres (fora do escopo deste agente — ver
 * `prisma/schema.prisma`, exclusivo do Agente 01): reavalia periodicamente as automações já
 * configuradas com trigger "Lead mudou de status" cujas `conditions` incluem um operador numérico
 * (`{ gte: N }`, ver `matchesConditions` em `automation.engine.ts`) sobre `daysSinceLastInteraction`
 * — o mesmo sinal de estagnação já usado pelo enxame autônomo (`swarmScheduler.service.ts`,
 * `lead.lastInteraction`).
 *
 * Cobre os dois exemplos da missão da Onda 7 com o mesmo mecanismo genérico:
 * - "Proposta enviada sem resposta": `conditions = { status: 'Proposta Enviada', daysSinceLastInteraction: { gte: 3 } }`
 * - "Negócio parado há X dias": `conditions = { daysSinceLastInteraction: { gte: 5 } }` (sem filtro de status = qualquer etapa aberta)
 *
 * Reevento real (não uma automação hardcoded à parte): o disparo passa pelo `automationEngine.handle`
 * de sempre, então herda o mesmo histórico de execução (`AuditLog`/`automationHistoryService`),
 * `correlationId`, isolamento de tenant e o mesmo catálogo de ações (`Notificar equipe`, `Criar
 * atividade`, `Ligar via SDR de Voz`) — nenhuma duplicação de lógica de execução.
 *
 * Diferente de `cold-leads-scanner.service.ts` (gate por `enabledOrganizations()`, específico do
 * piloto automático de IA), este scanner roda para QUALQUER organização com uma automação configurada
 * deste tipo — a automação é a autorização explícita (um humano criou a regra), não o toggle do
 * enxame autônomo.
 */

/** Teto de leads reavaliados por automação em cada execução — controla custo e tempo de scan. */
const SCAN_LIMIT_PER_AUTOMATION = 200;
const LOCK_KEY = 'stagnation-scanner:lock';
/** Menor que o intervalo do cron (24h), mesmo raciocínio do cold-leads-scanner. */
const LOCK_TTL_SECONDS = 60 * 30;

interface StagnationCondition {
  /** Rótulo humano do `LeadStatus` (ex.: "Proposta Enviada") — ausente = qualquer etapa aberta. */
  status?: string;
  /** Limiar mínimo de dias sem interação, no formato de operador do motor (`{ gte: N }`). */
  daysSinceLastInteraction: { gte: number };
}

const CLOSED_STATUSES: LeadStatus[] = [
  'Negócios Ganhos',
  'Negócios Perdidos',
  'Lead Desqualificado',
];

/** Extrai `{ status?, daysSinceLastInteraction: { gte } }` de `automation.conditions`, ou `null` se
 *  esta automação não é uma regra de estagnação (não tem o operador numérico esperado). */
function parseStagnationCondition(conditions: unknown): StagnationCondition | null {
  if (conditions == null || typeof conditions !== 'object' || Array.isArray(conditions))
    return null;
  const c = conditions as Record<string, unknown>;

  const threshold = c.daysSinceLastInteraction;
  if (threshold == null || typeof threshold !== 'object' || Array.isArray(threshold)) return null;

  const gte = (threshold as Record<string, unknown>).gte;
  if (typeof gte !== 'number' || gte <= 0) return null;

  const status = typeof c.status === 'string' && c.status.trim() ? c.status.trim() : undefined;
  return { status, daysSinceLastInteraction: { gte } };
}

function daysSince(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Um lead já foi notificado por esta automação para a MESMA sequência de estagnação (identificada
 * por `streakKey` — o instante da última interação real, ou `'never'` se nunca houve uma) quando já
 * existe um registro de sucesso no histórico com esse marcador. Isso evita reavisar todo dia
 * enquanto o lead continua parado: uma nova interação muda `lastInteraction`, o que muda `streakKey`,
 * o que libera a automação para disparar de novo numa futura estagnação.
 *
 * Reaproveita o AuditLog já usado por `automationHistoryService.record` (mesmo padrão de histórico
 * de execução da missão original — nenhum modelo novo).
 */
async function alreadyNotifiedForStreak(
  organizationId: string,
  automationId: string,
  leadId: string,
  streakKey: string,
): Promise<boolean> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      tenantId: organizationId,
      entity: 'Automation',
      entityId: automationId,
      action: 'AUTOMATION_EXECUTION',
      AND: [
        { details: { contains: `"entityId":"${leadId}"` } },
        { details: { contains: `"streakKey":"${streakKey}"` } },
        { details: { contains: '"status":"success"' } },
      ],
    },
    select: { id: true },
  });
  return existing != null;
}

interface StagnationScanResult {
  runId: string;
  automationsEvaluated: number;
  leadsScanned: number;
  fired: number;
  failures: number;
}

/** Uma execução da varredura. Exportado para permitir teste direto sem esperar o cron. */
export async function runStagnationScan(): Promise<StagnationScanResult> {
  const startedAt = Date.now();
  const lock = await acquireDistributedLock(LOCK_KEY, LOCK_TTL_SECONDS);
  const { runId } = lock;

  if (!lock.acquired) {
    logger.info({ runId }, 'Stagnation scan pulada: outra instância já está executando.');
    return { runId, automationsEvaluated: 0, leadsScanned: 0, fired: 0, failures: 0 };
  }

  logger.info({ runId }, 'Stagnation scan iniciada.');
  let automationsEvaluated = 0;
  let leadsScanned = 0;
  let fired = 0;
  let failures = 0;

  try {
    // Achado real de finalização (2026-09-04): `Organization` TAMBÉM está sob
    // `FORCE ROW LEVEL SECURITY` (mesma migration 20260722020322_enable_rls que cobre Company/
    // Contact/Lead/Activity) — "não é tenant-scoped" (não tem organizationId, ELA é o tenant) não
    // significa "sem RLS". Confirmado empiricamente contra o Postgres real deste worktree: sem
    // nenhum contexto, `prisma.organization.findMany()` devolve 0 linhas mesmo havendo
    // organizações reais no banco (a policy USING exige `app.current_tenant_id` OU
    // `app.bypass_rls='on'`, nenhum dos dois setado sem `requestContext.run`) — este scan nunca
    // processava NENHUMA organização em produção, sempre "completando com sucesso" 0 automações
    // avaliadas, sem nenhum erro. `Organization` está no allowlist de bypass documentado
    // (BYPASS_RLS_ALLOWED_MODELS, src/lib/prisma.ts) exatamente para esta descoberta inicial —
    // mesmo padrão já usado corretamente por `accountIntelligenceInsights.worker.ts`/
    // `agentMemoryCleanup.worker.ts`/`bitrixExtractionPurge.worker.ts`/`newsMonitor.worker.ts`.
    const organizations = await requestContext.run({ bypassRls: true }, () =>
      prisma.organization.findMany({ select: { id: true } }),
    );

    for (const { id: organizationId } of organizations) {
      const now = new Date();
      const scanFailures = await requestContext.run({ tenantId: organizationId }, async () => {
        const candidates = await prisma.automation.findMany({
          where: { organizationId, enabled: true, trigger: 'Lead_Estagnado' },
        });

        let orgFailures = 0;
        for (const automation of candidates) {
          const stagnation = parseStagnationCondition(automation.conditions);
          if (!stagnation) continue;
          automationsEvaluated++;

          try {
            const cutoff = new Date(
              now.getTime() - stagnation.daysSinceLastInteraction.gte * 24 * 60 * 60 * 1000,
            );
            const statusFilter = stagnation.status
              ? toPrismaLeadStatus(stagnation.status as LeadStatus)
              : undefined;

            const leads = await prisma.lead.findMany({
              where: {
                organizationId,
                deletedAt: null,
                ...(statusFilter
                  ? { status: statusFilter as never }
                  : {
                      status: {
                        notIn: CLOSED_STATUSES.map((s) => toPrismaLeadStatus(s)) as never[],
                      },
                    }),
                OR: [
                  { lastInteraction: { lte: cutoff } },
                  { lastInteraction: null, createdAt: { lte: cutoff } },
                ],
              },
              select: {
                id: true,
                status: true,
                owner: true,
                temperature: true,
                score: true,
                lastInteraction: true,
                createdAt: true,
              },
              orderBy: { lastInteraction: 'asc' },
              take: SCAN_LIMIT_PER_AUTOMATION,
            });
            leadsScanned += leads.length;

            for (const lead of leads) {
              const referenceDate = lead.lastInteraction ?? lead.createdAt;
              const streakKey = lead.lastInteraction ? lead.lastInteraction.toISOString() : 'never';

              if (
                await alreadyNotifiedForStreak(organizationId, automation.id, lead.id, streakKey)
              ) {
                continue;
              }

              const executed = await automationEngine.handle({
                organizationId,
                trigger: 'Lead estagnado',
                entity: 'Lead',
                entityId: lead.id,
                data: {
                  status: fromPrismaLeadStatus(lead.status),
                  owner: lead.owner,
                  temperature: lead.temperature,
                  score: lead.score,
                  daysSinceLastInteraction: daysSince(referenceDate, now),
                  streakKey,
                },
              });
              fired += executed;
            }
          } catch (err) {
            orgFailures++;
            logger.error(
              { err, runId, organizationId, automationId: automation.id },
              'Falha ao reavaliar automação de estagnação',
            );
          }
        }
        return orgFailures;
      });
      failures += scanFailures;
    }

    logger.info(
      {
        runId,
        automationsEvaluated,
        leadsScanned,
        fired,
        failures,
        durationMs: Date.now() - startedAt,
      },
      'Stagnation scan concluída.',
    );
    return { runId, automationsEvaluated, leadsScanned, fired, failures };
  } catch (error) {
    logger.error({ err: error, runId }, 'Stagnation scan falhou.');
    return { runId, automationsEvaluated, leadsScanned, fired, failures: failures + 1 };
  } finally {
    await lock.release();
  }
}

import { Worker, Queue } from 'bullmq';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';

export const STAGNATION_SCANNER_QUEUE_NAME = 'stagnation-scanner-queue';

export function createStagnationScannerWorker() {
  const worker = new Worker(
    STAGNATION_SCANNER_QUEUE_NAME,
    async (job) => {
      logger.info('Iniciando job de stagnation-scanner');
      await runStagnationScan();
    },
    {
      connection: connection as any,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'StagnationScanner worker job falhou');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: STAGNATION_SCANNER_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

  worker.on('error', (err) => {
    logger.warn({ err }, 'StagnationScanner worker error suppressed (Redis offline)');
  });

  return worker;
}

export async function scheduleStagnationScannerJob() {
  const queue = new Queue(STAGNATION_SCANNER_QUEUE_NAME, {
    connection: connection as any,
  });

  // Roda todo dia as 03:17
  await queue.upsertJobScheduler(
    'daily-stagnation-scan',
    { pattern: '17 3 * * *' },
    {
      name: 'daily-stagnation-scan',
      data: {},
    },
  );

  logger.info('StagnationScanner job scheduled (cron: 17 3 * * *)');
}
