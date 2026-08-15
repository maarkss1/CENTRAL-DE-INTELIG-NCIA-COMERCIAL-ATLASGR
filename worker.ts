import { initTracing } from './src/lib/tracing.js';
initTracing();

// Mesmo motivo do server.ts: registrar o guard de processo antes de qualquer import que possa
// tocar Redis/BullMQ. Sem Redis configurado, comandos internos do BullMQ rejeitam fora de
// qualquer await nosso — sem o guard, essa unhandledRejection derruba o processo ~2s depois de
// subir. Ver src/lib/process-guards.ts.
import { registerProcessGuards } from './src/lib/process-guards.js';
registerProcessGuards();

import http from 'http';
import { env } from './src/config/env.js';
import { logger } from './src/lib/logger.js';
import { prisma } from './src/lib/prisma.js';
import { shutdownLangfuse } from './src/lib/langfuse.js';
import client from 'prom-client';
import { connection, rateLimiterConnection, cacheConnection, queuesEnabled } from './src/lib/queue/redis.js';

import { createLeadsWorker } from './src/lib/queue/index.js';
import { createAgentWorker } from './src/lib/queue/agent.worker.js';
import { createEnrichmentWorker } from './src/lib/queue/enrichment.queue.js';
import { createSearchWorker } from './src/lib/queue/search.queue.js';
import { initMeiliIndexes } from './src/lib/search/index.js';
import { createColdCallWorker, scheduleColdCallCampaigns } from './src/lib/queue/coldCall.worker.js';
import { createWhatsAppSignalWorker } from './src/lib/queue/whatsappSignal.worker.js';
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
import { ColdLeadsScannerService } from './src/features/automations/application/cold-leads-scanner.service.js';

/**
 * worker.ts — entrypoint dedicado para processamento assíncrono (Onda 6, Agente 16).
 *
 * Sobe SOMENTE as 13 filas BullMQ + o cron de cold-leads-scanner — sem Express, sem SPA, sem SSE.
 * O processo HTTP (`server.ts`) continua podendo ENFILEIRAR (as `Queue` são criadas em cada
 * arquivo de domínio, fora daqui) — este entrypoint só decide quem PROCESSA.
 *
 * server.ts ainda cria os mesmos workers hoje (ver o diff proposto no handoff
 * `.agents/handoffs/onda-6/16-para-00-remover-workers-de-server-ts.md`). Até esse diff ser
 * aprovado pelo Agente 00, rodar os dois processos ao mesmo tempo com `ENABLE_QUEUES=true`
 * DUPLICA o processamento — BullMQ não impede dois `Worker` concorrentes na mesma fila, e ambos
 * vão competir/duplicar por jobs "fanned out" via `queuesEnabled` local. Enquanto o corte não
 * acontece:
 *   - desenvolvimento local: continue rodando só `npm run dev` (server.ts), como hoje;
 *   - para testar este entrypoint isoladamente: suba SOMENTE `worker.ts` com `ENABLE_QUEUES=true`
 *     e mantenha `server.ts` fora do ar, ou rode `server.ts` sem `ENABLE_QUEUES` (só enfileira via
 *     import direto da Queue teria efeito colateral) — a validação feita nesta onda seguiu o
 *     primeiro caminho: apenas `worker.ts` ativo contra o Redis do harness.
 *
 * Sessões Baileys (WhatsApp) NÃO foram movidas para cá nesta onda — permanecem no processo HTTP.
 * Ver handoff `.agents/handoffs/onda-6/16-para-06-plano-migracao-baileys.md`.
 */

const WORKER_PORT = parseInt(process.env.WORKER_HEALTH_PORT || '3006', 10);

type CloseableWorker = { close: () => Promise<void> } | null;

async function startWorkerProcess() {
    if (!queuesEnabled) {
        logger.warn(
            'worker.ts iniciado com ENABLE_QUEUES/REDIS_URL desligado — nenhuma fila será processada. ' +
            'Isso não é um erro silencioso: o processo sobe, o health check fica "degraded", mas nenhum ' +
            'worker é criado. Configure REDIS_URL ou ENABLE_QUEUES=true para processar de verdade.',
        );
    }

    // ── Inventário: as 14 filas registradas neste processo (ver inventário completo no relatório
    // da onda — o prompt original citava 13, a contagem real de `Queue`/`Worker` distintos no
    // repositório é 14; documentado, não corrigido silenciosamente).
    const leadsWorker = queuesEnabled ? createLeadsWorker() : null;
    const agentWorker = queuesEnabled ? createAgentWorker() : null;
    const enrichmentWorker = queuesEnabled ? createEnrichmentWorker() : null;
    const whatsappSignalWorker = queuesEnabled ? createWhatsAppSignalWorker() : null;
    const bitrixSyncWorker = queuesEnabled ? createBitrixSyncWorker() : null;
    const followUpWorker = queuesEnabled ? createFollowUpWorker() : null;
    const execSummaryWorker = queuesEnabled ? createExecutiveSummaryWorker() : null;
    const deduplicationWorker = queuesEnabled ? createDeduplicationWorker() : null;
    const winLossWorker = queuesEnabled ? createWinLossAnalysisWorker() : null;
    const pdfWorker = queuesEnabled ? createWeeklyPdfReportWorker() : null;
    const autoAnonymizeWorker = queuesEnabled ? createAutoAnonymizeWorker() : null;

    if (queuesEnabled) {
        scheduleBitrixSync().catch((err) => logger.error({ err }, 'Falha ao agendar a sincronização automática do Bitrix'));
        scheduleFollowUpJobs().catch((err) => logger.error({ err }, 'Falha ao agendar jobs de follow-up'));
        scheduleExecutiveSummaryJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de summary executivo'));
        scheduleDeduplicationJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de deduplicacao'));
        scheduleWinLossAnalysisJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de win/loss analysis'));
        scheduleWeeklyPdfReportJob().catch((err) => logger.error({ err }, 'Falha ao agendar job do pdf semanal'));
        scheduleAutoAnonymizeJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de anonimização automática'));
    }

    const searchWorker = queuesEnabled && env.ENABLE_SEARCH ? createSearchWorker() : null;
    if (queuesEnabled && env.ENABLE_SEARCH) {
        initMeiliIndexes().catch(() => logger.warn('Meilisearch offline'));
    }

    // Hoisted de propósito (mesmo motivo do server.ts original): precisam continuar acessíveis em
    // shutdown() abaixo, e a inicialização depende de uma consulta assíncrona por organizações
    // habilitadas. Se essa consulta falhar na inicialização (banco fora do ar no boot do worker),
    // isso NÃO pode ficar silencioso — ver "Mentira mais provável" no prompt desta onda.
    let coldCallWorker: CloseableWorker = null;
    let swarmSchedulerWorker: CloseableWorker = null;
    let coldCallInitError: unknown = null;
    let swarmInitError: unknown = null;

    const coldCallInit = enabledOrganizations()
        .then((coldCallOrgs) => {
            coldCallWorker = queuesEnabled && coldCallOrgs.length > 0 ? createColdCallWorker() : null;
            if (coldCallWorker) {
                return scheduleColdCallCampaigns().catch((err) =>
                    logger.error({ err }, 'Falha ao agendar a campanha de prospecção fria'),
                );
            }
            return undefined;
        })
        .catch((err) => {
            coldCallInitError = err;
            logger.error({ err }, 'Falha ao inicializar o worker de prospecção fria (sdr-cold-call) — fila fica sem processamento até o próximo restart.');
        });

    const swarmInit = swarmSchedulerEnabledOrganizations()
        .then((swarmOrgs) => {
            swarmSchedulerWorker = queuesEnabled && swarmOrgs.length > 0 ? createSwarmSchedulerWorker() : null;
            if (swarmSchedulerWorker) {
                return scheduleSwarmScheduler().catch((err) =>
                    logger.error({ err }, 'Falha ao agendar o enxame autônomo'),
                );
            }
            return undefined;
        })
        .catch((err) => {
            swarmInitError = err;
            logger.error({ err }, 'Falha ao inicializar o worker do enxame autônomo (swarm-scheduler) — fila fica sem processamento até o próximo restart.');
        });

    // cold-leads-scanner: cron próprio (não BullMQ), já com trava distribuída via Redis
    // (`cold-leads-scanner:lock`, SETNX+TTL) implementada em
    // src/features/automations/application/cold-leads-scanner.service.ts — dono: Agente 07.
    // Confirmado nesta onda que dois processos worker rodando o cron simultaneamente executam a
    // varredura uma única vez (ver relatório da onda).
    ColdLeadsScannerService.start();

    await Promise.all([coldCallInit, swarmInit]);

    const registeredWorkers: Array<{ name: string; worker: CloseableWorker }> = [
        { name: 'leads-enrichment', worker: leadsWorker },
        { name: 'intelligence-agents', worker: agentWorker },
        { name: 'enrichment-queue', worker: enrichmentWorker },
        { name: 'search-indexing', worker: searchWorker },
        { name: 'whatsapp-conversation-signal', worker: whatsappSignalWorker },
        { name: 'bitrix-sync', worker: bitrixSyncWorker },
        { name: 'whatsapp-followup-queue', worker: followUpWorker },
        { name: 'daily-executive-summary-queue', worker: execSummaryWorker },
        { name: 'deduplication-queue', worker: deduplicationWorker },
        { name: 'win-loss-analysis-queue', worker: winLossWorker },
        { name: 'weekly-pdf-report-queue', worker: pdfWorker },
        { name: 'auto-anonymize-disqualified-queue', worker: autoAnonymizeWorker },
        { name: 'sdr-cold-call', worker: coldCallWorker },
        { name: 'swarm-scheduler', worker: swarmSchedulerWorker },
    ];

    const activeCount = registeredWorkers.filter((w) => w.worker !== null).length;
    logger.info(
        {
            queuesEnabled,
            searchEnabled: env.ENABLE_SEARCH,
            activeWorkers: activeCount,
            totalRegistered: registeredWorkers.length,
            registered: registeredWorkers.map((w) => w.name),
        },
        'worker.ts: filas registradas nesta inicialização.',
    );

    // ── Health server ──────────────────────────────────────────────────────
    // Health check próprio e minimalista (sem Express) — este processo não serve HTTP de
    // aplicação, só um endpoint de saúde para o orquestrador de deploy (Render worker service,
    // ver handoff para o Agente 08). "ready" exige queuesEnabled E nenhum erro de inicialização
    // nos dois workers condicionais (cold-call/swarm) — worker morto em silêncio é a mentira mais
    // provável deste domínio (ver prompt da onda), então o health check reporta o erro em vez de
    // simplesmente reportar "ok" porque o processo Node ainda está de pé.
    const healthServer = http.createServer((req, res) => {
        if (req.url === '/health/live' || req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
            return;
        }
        if (req.url === '/health/ready' || req.url === '/readyz') {
            const errors: string[] = [];
            if (coldCallInitError) errors.push('sdr-cold-call worker failed to initialize');
            if (swarmInitError) errors.push('swarm-scheduler worker failed to initialize');
            const ok = queuesEnabled && errors.length === 0;
            res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: ok ? 'ok' : 'degraded',
                queuesEnabled,
                activeWorkers: activeCount,
                totalRegistered: registeredWorkers.length,
                errors,
                timestamp: new Date().toISOString(),
            }));
            return;
        }
        if (req.url === '/metrics' && env.EXPOSE_METRICS) {
            client.collectDefaultMetrics();
            res.writeHead(200, { 'Content-Type': client.register.contentType });
            client.register.metrics().then((m) => res.end(m)).catch((err) => {
                res.writeHead(500);
                res.end(String(err));
            });
            return;
        }
        res.writeHead(404);
        res.end();
    });

    healthServer.listen(WORKER_PORT, '0.0.0.0', () => {
        logger.info({ port: WORKER_PORT }, `worker.ts health server escutando em http://localhost:${WORKER_PORT}`);
    });

    // ── Graceful shutdown ──────────────────────────────────────────────────
    // Ordem: parar de aceitar handshake HTTP de health → dar aos workers BullMQ um prazo pra
    // drenar o job em andamento (Worker#close() do BullMQ já faz exatamente isso: para de puxar
    // job novo e aguarda o job ativo terminar antes de resolver) → fechar conexões Redis → sair.
    // Timeout máximo para não travar o deploy pra sempre se algum job ficar preso.
    const SHUTDOWN_TIMEOUT_MS = 25_000;
    let shuttingDown = false;

    const shutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info({ signal }, 'worker.ts: sinal recebido, iniciando graceful shutdown.');

        const timeout = new Promise<void>((resolve) => {
            setTimeout(() => {
                logger.error({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'worker.ts: shutdown excedeu o timeout — forçando saída (job em voo pode ter sido devolvido à fila, não perdido; BullMQ reprocessa jobs "stalled").');
                resolve();
            }, SHUTDOWN_TIMEOUT_MS);
        });

        const drain = (async () => {
            await new Promise<void>((resolve) => healthServer.close(() => resolve()));

            await Promise.allSettled(
                registeredWorkers
                    .filter((w): w is { name: string; worker: NonNullable<CloseableWorker> } => w.worker !== null)
                    .map(async ({ name, worker }) => {
                        try {
                            await worker.close();
                        } catch (err) {
                            logger.error({ err, queue: name }, 'worker.ts: erro ao fechar worker durante shutdown.');
                        }
                    }),
            );

            await shutdownLangfuse().catch((err) => logger.error({ err }, 'worker.ts: erro ao encerrar Langfuse.'));
            await prisma.$disconnect().catch((err) => logger.error({ err }, 'worker.ts: erro ao desconectar Prisma.'));
            await Promise.allSettled([
                connection.quit().catch(() => connection.disconnect()),
                rateLimiterConnection.quit().catch(() => rateLimiterConnection.disconnect()),
                cacheConnection.quit().catch(() => cacheConnection.disconnect()),
            ]);
        })();

        await Promise.race([drain, timeout]);
        logger.info({ signal }, 'worker.ts: shutdown concluído.');
        process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

startWorkerProcess().catch((err) => {
    logger.error({ err }, 'worker.ts: falha fatal ao inicializar o processo de workers.');
    process.exit(1);
});
