import { initTracing } from './src/lib/tracing.js';
initTracing();

import { registerProcessGuards } from './src/lib/process-guards.js';
registerProcessGuards();

import http from 'http';
import type { Worker as BullWorker } from 'bullmq';
import { env } from './src/config/env.js';
import { logger } from './src/lib/logger.js';
import { prisma } from './src/lib/prisma.js';
import { shutdownLangfuse } from './src/lib/langfuse.js';
import { withTimeout } from './src/lib/http.js';
import client from 'prom-client';
import {
    connection,
    rateLimiterConnection,
    cacheConnection,
    queuesEnabled,
    pingRedis,
} from './src/lib/queue/redis.js';
import { registerWorkerForRuntimeMetrics, setWorkerProcessUp } from './src/lib/queue/metrics.js';

import { createLeadsWorker } from './src/lib/queue/index.js';
import {
    isPlatformOperatorTokenConfigured,
    isValidPlatformOperatorToken,
} from './src/shared/middlewares/requirePlatformOperator.js';
import { createAgentWorker } from './src/lib/queue/agent.worker.js';
import { createEnrichmentWorker } from './src/lib/queue/enrichment.queue.js';
import { createSearchWorker } from './src/lib/queue/search.queue.js';
import { dailyReportWorker } from './src/lib/queue/dailyReport.worker.js';
import { initMeiliIndexes } from './src/lib/search/index.js';
import { createColdCallWorker, scheduleColdCallCampaigns } from './src/lib/queue/coldCall.worker.js';
import { createWhatsAppSignalWorker } from './src/lib/queue/whatsappSignal.worker.js';
import { createWhatsAppCommandWorker } from './src/lib/queue/whatsappCommand.worker.js';
import { shutdownWhatsAppSessions } from './src/features/integrations/whatsapp/whatsapp.service.js';
import { enabledOrganizations } from './src/features/integrations/birth-voice/coldCall.service.js';
import { createSwarmSchedulerWorker, scheduleSwarmScheduler } from './src/lib/queue/swarmScheduler.worker.js';
import { enabledOrganizations as swarmSchedulerEnabledOrganizations } from './src/features/intelligence/services/swarmScheduler.service.js';
import { createBitrixSyncWorker, scheduleBitrixSync } from './src/lib/queue/bitrixSync.worker.js';
import { createFollowUpWorker, scheduleFollowUpJobs } from './src/features/crm/jobs/followUp.worker.js';
import { createExecutiveSummaryWorker, scheduleExecutiveSummaryJob } from './src/features/crm/jobs/dailyExecutiveSummary.worker.js';
import { createDeduplicationWorker, scheduleDeduplicationJob } from './src/features/crm/jobs/deduplication.worker.js';
import { createWinLossAnalysisWorker, scheduleWinLossAnalysisJob } from './src/features/intelligence/services/winLossAnalysis.worker.js';
import { createWeeklyPdfReportWorker, scheduleWeeklyPdfReportJob } from './src/features/crm/jobs/weeklyPdfReport.worker.js';
import { createAutoAnonymizeWorker, scheduleAutoAnonymizeJob } from './src/features/crm/jobs/autoAnonymizeDisqualified.worker.js';
import { createColdLeadsScannerWorker, scheduleColdLeadsScannerJob } from './src/features/automations/application/cold-leads-scanner.service.js';
import { createStagnationScannerWorker, scheduleStagnationScannerJob } from './src/features/automations/application/stagnation-scanner.service.js';
import { createCadenceRunWorker, scheduleCadenceRunJob } from './src/features/cadence/jobs/cadenceRun.worker.js';
import { createAgentMemoryCleanupWorker, scheduleAgentMemoryCleanupJob } from './src/features/intelligence/jobs/agentMemoryCleanup.worker.js';
import { createBitrixExtractionPurgeWorker, scheduleBitrixExtractionPurgeJob } from './src/features/integrations/bitrix/jobs/bitrixExtractionPurge.worker.js';
import { createNewsMonitorWorker, scheduleGlobalNewsScan } from './src/lib/queue/newsMonitor.worker.js';
import { createAccountIntelligenceInsightsWorker, scheduleAccountIntelligenceInsightsJob } from './src/features/market-intelligence/jobs/accountIntelligenceInsights.worker.js';
import { createForecastSnapshotWorker, scheduleForecastSnapshotJob } from './src/features/commercial-intelligence/jobs/forecastSnapshotWeekly.worker.js';
import { createCopilotoTranscriptionWorker } from './src/features/copiloto-ia/jobs/transcribeConversation.worker.js';

const WORKER_PORT = parseInt(process.env.WORKER_HEALTH_PORT || '3006', 10);
const SHUTDOWN_TIMEOUT_MS = 25_000;
// RUN-002e (Sprint 02/Onda 14): o retryStrategy do ioredis (src/lib/queue/redis.ts) reconecta
// indefinidamente enquanto queuesEnabled=true — correto para resiliência a blips durante o
// runtime, mas isso também significa que `pingRedis` nunca rejeita sozinho. Sem um teto aqui, um
// Redis indisponível no boot deixava o processo pendurado para sempre (nem crash visível, nem
// "pronto") em vez de falhar do jeito que o orquestrador (Render/k8s) espera de um healthcheck de
// inicialização.
const STARTUP_REDIS_TIMEOUT_MS = 10_000;
type CloseableWorker = BullWorker<any, any, string> | null;

async function startWorkerProcess() {
    if (!queuesEnabled) {
        throw new Error('Worker dedicado requer ENABLE_QUEUES=true e REDIS_URL configurada.');
    }

    await withTimeout(pingRedis(connection), STARTUP_REDIS_TIMEOUT_MS);
    await prisma.$queryRaw`SELECT 1`;

    const leadsWorker = createLeadsWorker();
    const agentWorker = createAgentWorker();
    const enrichmentWorker = createEnrichmentWorker();
    const whatsappSignalWorker = createWhatsAppSignalWorker();
    const whatsappCommandWorker = createWhatsAppCommandWorker();
    const bitrixSyncWorker = createBitrixSyncWorker();
    const followUpWorker = createFollowUpWorker();
    const execSummaryWorker = createExecutiveSummaryWorker();
    const deduplicationWorker = createDeduplicationWorker();
    const winLossWorker = createWinLossAnalysisWorker();
    const pdfWorker = createWeeklyPdfReportWorker();
    const autoAnonymizeWorker = createAutoAnonymizeWorker();
    const coldLeadsScannerWorker = createColdLeadsScannerWorker();
    const stagnationScannerWorker = createStagnationScannerWorker();
    const cadenceRunWorker = createCadenceRunWorker();
    const agentMemoryCleanupWorker = createAgentMemoryCleanupWorker();
    const bitrixExtractionPurgeWorker = createBitrixExtractionPurgeWorker();
    const newsMonitorWorker = createNewsMonitorWorker();
    const accountIntelligenceInsightsWorker = createAccountIntelligenceInsightsWorker();
    const forecastSnapshotWorker = createForecastSnapshotWorker();
    const copilotoTranscriptionWorker = createCopilotoTranscriptionWorker();

    await Promise.all([
        scheduleBitrixSync(),
        scheduleFollowUpJobs(),
        scheduleExecutiveSummaryJob(),
        scheduleDeduplicationJob(),
        scheduleWinLossAnalysisJob(),
        scheduleWeeklyPdfReportJob(),
        scheduleAutoAnonymizeJob(),
        scheduleColdLeadsScannerJob(),
        scheduleStagnationScannerJob(),
        scheduleCadenceRunJob(),
        scheduleAgentMemoryCleanupJob(),
        scheduleBitrixExtractionPurgeJob(),
        scheduleGlobalNewsScan(),
        scheduleAccountIntelligenceInsightsJob(),
        scheduleForecastSnapshotJob(),
    ]);

    const searchWorker = env.ENABLE_SEARCH ? createSearchWorker() : null;
    if (env.ENABLE_SEARCH) {
        initMeiliIndexes().catch((err) => logger.warn({ err }, 'Meilisearch offline'));
    }

    let coldCallWorker: CloseableWorker = null;
    let swarmSchedulerWorker: CloseableWorker = null;

    const coldCallOrgs = await enabledOrganizations();
    if (coldCallOrgs.length > 0) {
        coldCallWorker = createColdCallWorker();
        await scheduleColdCallCampaigns();
    }

    const swarmOrgs = await swarmSchedulerEnabledOrganizations();
    if (swarmOrgs.length > 0) {
        swarmSchedulerWorker = createSwarmSchedulerWorker();
        await scheduleSwarmScheduler();
    }

    const registeredWorkers: Array<{ name: string; worker: CloseableWorker }> = [
        { name: 'leads-enrichment', worker: leadsWorker },
        { name: 'intelligence-agents', worker: agentWorker },
        { name: 'enrichment-queue', worker: enrichmentWorker },
        { name: 'search-indexing', worker: searchWorker },
        { name: 'whatsapp-conversation-signal', worker: whatsappSignalWorker },
        { name: 'whatsapp-command', worker: whatsappCommandWorker },
        { name: 'bitrix-sync', worker: bitrixSyncWorker },
        { name: 'whatsapp-followup-queue', worker: followUpWorker },
        { name: 'daily-executive-summary-queue', worker: execSummaryWorker },
        { name: 'deduplication-queue', worker: deduplicationWorker },
        { name: 'win-loss-analysis-queue', worker: winLossWorker },
        { name: 'weekly-pdf-report-queue', worker: pdfWorker },
        { name: 'auto-anonymize-disqualified-queue', worker: autoAnonymizeWorker },
        { name: 'sdr-cold-call', worker: coldCallWorker },
        { name: 'swarm-scheduler', worker: swarmSchedulerWorker },
        { name: 'cold-leads-scanner-queue', worker: coldLeadsScannerWorker },
        { name: 'stagnation-scanner-queue', worker: stagnationScannerWorker },
        { name: 'cadence-run-scanner', worker: cadenceRunWorker },
        { name: 'daily-report', worker: dailyReportWorker },
        { name: 'agent-memory-cleanup', worker: agentMemoryCleanupWorker },
        { name: 'bitrix-extraction-purge', worker: bitrixExtractionPurgeWorker },
        { name: 'news-monitor', worker: newsMonitorWorker },
        { name: 'account-intelligence-insights', worker: accountIntelligenceInsightsWorker },
        { name: 'forecast-snapshot-weekly-queue', worker: forecastSnapshotWorker },
        { name: 'copiloto-ia-transcription-queue', worker: copilotoTranscriptionWorker },
    ];

    for (const { name, worker } of registeredWorkers) {
        registerWorkerForRuntimeMetrics(name, worker);
    }

    const activeCount = registeredWorkers.filter((entry) => entry.worker !== null).length;
    setWorkerProcessUp(true);
    logger.info({
        activeWorkers: activeCount,
        totalRegistered: registeredWorkers.length,
        registered: registeredWorkers.map((entry) => entry.name),
    }, 'worker.ts: processors registrados');

    if (env.EXPOSE_METRICS) client.collectDefaultMetrics();

    const healthServer = http.createServer(async (req, res) => {
        if (req.url === '/health/live' || req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
            return;
        }

        if (req.url === '/health/ready' || req.url === '/readyz') {
            try {
                // Mesmo motivo do boot acima: sem timeout, um Redis fora do ar faz este endpoint
                // travar em vez de responder 503 — o orquestrador precisa de uma resposta rápida
                // para decidir remover a réplica de rotação.
                await withTimeout(pingRedis(connection), 3_000);
                await prisma.$queryRaw`SELECT 1`;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ok',
                    queuesEnabled: true,
                    activeWorkers: activeCount,
                    totalRegistered: registeredWorkers.length,
                    timestamp: new Date().toISOString(),
                }));
            } catch (err) {
                logger.error({ err }, 'worker.ts readiness failed');
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Redis or database unavailable' }));
            }
            return;
        }

        // SEC-002 (Sprint 01/Onda 13) exigia o token de operador de plataforma em `/metrics` só no
        // processo HTTP principal (`src/bootstrap/observability.ts`) — este `/metrics` do worker é
        // um servidor `http` cru à parte (não monta o app Express), então a mesma trava nunca foi
        // aplicada aqui e reabria a mesma classe de exposição sem auth num segundo processo.
        const requestPath = (req.url ?? '/').split('?', 1)[0];
        if (requestPath === '/metrics' && env.EXPOSE_METRICS) {
            if (!isPlatformOperatorTokenConfigured()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Recurso de operador de plataforma não habilitado — configure PLATFORM_OPERATOR_TOKEN.',
                }));
                return;
            }

            const requestUrl = new URL(req.url ?? '/metrics', 'http://internal');
            const headerToken = req.headers['x-platform-operator-token'];
            const queryToken = requestUrl.searchParams.get('operator_token');
            const candidate =
                (typeof headerToken === 'string' && headerToken) ||
                (typeof queryToken === 'string' && queryToken) ||
                null;

            if (!isValidPlatformOperatorToken(candidate)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Acesso negado.' }));
                return;
            }

            try {
                res.writeHead(200, { 'Content-Type': client.register.contentType });
                res.end(await client.register.metrics());
            } catch (err) {
                res.writeHead(500);
                res.end(String(err));
            }
            return;
        }

        res.writeHead(404);
        res.end();
    });

    healthServer.listen(WORKER_PORT, '0.0.0.0', () => {
        logger.info({ port: WORKER_PORT }, 'worker.ts health server listening');
    });

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        setWorkerProcessUp(false);
        logger.info({ signal }, 'worker.ts: graceful shutdown started');

        const timeout = new Promise<void>((resolve) => {
            setTimeout(() => {
                logger.error({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'worker.ts: shutdown timeout reached');
                resolve();
            }, SHUTDOWN_TIMEOUT_MS);
        });

        const drain = (async () => {
            await new Promise<void>((resolve) => healthServer.close(() => resolve()));
            await Promise.allSettled(
                registeredWorkers
                    .filter((entry): entry is { name: string; worker: NonNullable<CloseableWorker> } => entry.worker !== null)
                    .map(({ worker }) => worker.close()),
            );
            await shutdownWhatsAppSessions();
            await shutdownLangfuse().catch((err) => logger.error({ err }, 'Erro ao encerrar Langfuse'));
            await prisma.$disconnect().catch((err) => logger.error({ err }, 'Erro ao desconectar Prisma'));
            await Promise.allSettled([
                connection.quit().catch(() => connection.disconnect()),
                rateLimiterConnection.quit().catch(() => rateLimiterConnection.disconnect()),
                cacheConnection.quit().catch(() => cacheConnection.disconnect()),
            ]);
        })();

        await Promise.race([drain, timeout]);
        logger.info({ signal }, 'worker.ts: graceful shutdown completed');
        process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

startWorkerProcess().catch((err) => {
    setWorkerProcessUp(false);
    logger.fatal({ err }, 'worker.ts: fatal bootstrap failure');
    process.exit(1);
});
