// Onda 43: o model ForecastSnapshot existe desde a migration 20260827020000_forecast_snapshot
// (ver PrismaForecastSnapshotStore.ts) mas nenhum cron/worker jamais o populava em produção — a
// tabela era uma estrutura viva sem processo real que a alimentasse (handoff
// onda-39/04-para-16-cron-forecast-snapshot-semanal.md). Este worker fecha esse gap: uma vez por
// semana, para cada organização com pipeline ativo, calcula o ExecutiveOverview do mês corrente e
// grava um snapshot append-only (nunca sobrescreve — permite comparar previsto-vs-realizado
// depois, ver forecastAccuracy.ts).
import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { requestContext } from '../../../lib/async-context.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import {
  CommercialIntelligenceUseCases,
  currentPeriod,
} from '../application/CommercialIntelligenceUseCases.js';
import { PrismaCommercialIntelligenceRepository } from '../infra/PrismaCommercialIntelligenceRepository.js';
import { PrismaForecastSnapshotStore } from '../infra/PrismaForecastSnapshotStore.js';
import { buildForecastSnapshot } from '../application/forecastSnapshot.js';

export const FORECAST_SNAPSHOT_QUEUE_NAME = 'forecast-snapshot-weekly-queue';

export interface ForecastSnapshotOrgResult {
  organizationId: string;
  status: 'saved' | 'failed';
}

export type ForecastSnapshotJobResult =
  | { status: 'no_organizations_with_leads' }
  | { status: 'completed'; results: ForecastSnapshotOrgResult[] };

/**
 * Corpo do job, exportado à parte do worker BullMQ (mesmo padrão de `runWeeklySalesReportJob` em
 * weeklyPdfReport.worker.ts) para permitir teste direto sem depender do agendador nem de um
 * Postgres real com RLS.
 */
export async function runForecastSnapshotWeeklyJob(
  now: Date = new Date(),
): Promise<ForecastSnapshotJobResult> {
  logger.info('Iniciando job de snapshot semanal de forecast (todas as organizações com leads)');

  const repository = new PrismaCommercialIntelligenceRepository();
  const useCases = new CommercialIntelligenceUseCases(repository);
  const store = new PrismaForecastSnapshotStore();
  const period = currentPeriod(now);

  // Mesmo motivo/mesma correção já documentada em weeklyPdfReport.worker.ts: sem bypass aqui,
  // `Lead` sob FORCE ROW LEVEL SECURITY nunca devolve nenhuma linha (nenhum tenant/bypass
  // conhecido na policy), e o job "descobriria" zero organizações mesmo com dado real no banco.
  // Descoberta cross-tenant via bypass; todo cálculo/gravação do snapshot em si, uma vez
  // conhecido o tenant, roda com RLS real de tenant (`requestContext.run({ tenantId })`).
  const orgRows = await requestContext.run({ bypassRls: true }, () =>
    prisma.lead.findMany({
      distinct: ['organizationId'],
      select: { organizationId: true },
    }),
  );
  const orgIds = [
    ...new Set(orgRows.map((row) => row.organizationId).filter((id): id is string => id != null)),
  ];

  if (orgIds.length === 0) {
    return { status: 'no_organizations_with_leads' };
  }

  const results: ForecastSnapshotOrgResult[] = [];

  for (const organizationId of orgIds) {
    try {
      await requestContext.run({ tenantId: organizationId }, async () => {
        const overview = await useCases.executiveOverview(organizationId, { month: period }, now);
        const record = buildForecastSnapshot(organizationId, overview, now);
        await store.save(record);
      });
      results.push({ organizationId, status: 'saved' });
    } catch (err) {
      logger.error(
        { err, organizationId, period },
        'Falha ao calcular/gravar snapshot de forecast desta organização',
      );
      results.push({ organizationId, status: 'failed' });
    }
  }

  logger.info({ period, results }, 'Snapshot semanal de forecast processado (por organização)');
  return { status: 'completed', results };
}

export function createForecastSnapshotWorker() {
  const worker = new Worker(
    FORECAST_SNAPSHOT_QUEUE_NAME,
    async () => runForecastSnapshotWeeklyJob(),
    { connection: connection as any, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Forecast snapshot worker job falhou');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: FORECAST_SNAPSHOT_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

  worker.on('error', (err) => {
    logger.warn(
      { message: err.message },
      'ForecastSnapshot worker error suppressed (Redis offline)',
    );
  });

  return worker;
}

export async function scheduleForecastSnapshotJob() {
  const queue = new Queue(FORECAST_SNAPSHOT_QUEUE_NAME, {
    connection: connection as any,
  });

  // Roda toda segunda-feira 06:00 (0 6 * * 1) — antes do expediente comercial começar, com dado
  // do fim da semana anterior já consolidado.
  // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
  // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
  await queue.upsertJobScheduler(
    'forecast-snapshot-weekly',
    { pattern: '0 6 * * 1' },
    {
      name: 'forecast-snapshot-weekly',
      data: {},
    },
  );

  logger.info('Forecast snapshot weekly job scheduled (cron: 0 6 * * 1)');
}
