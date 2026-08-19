
import { prisma } from '../../../lib/prisma.js';
import { VectorSearchService } from '../../intelligence/services/vector-search.service.js';
import { enabledOrganizations } from '../../intelligence/services/swarmScheduler.service.js';
import { acquireDistributedLock } from '../../../lib/queue/distributedLock.js';
import { requestContext } from '../../../lib/async-context.js';
import { logger } from '../../../lib/logger.js';

/**
 * AUTO-001: correções de confiabilidade sobre a primeira versão deste serviço.
 *
 * 1. Cross-tenant: a consulta original (`prisma.lead.findMany({ where: { temperature: 'Frio' } })`)
 *    não filtrava organização nenhuma — varria leads frios de TODAS as organizações a cada
 *    execução, violando o isolamento de tenant exigido pela missão de IA da Onda 2. Agora só
 *    processa organizações que optaram explicitamente pelo piloto automático de IA
 *    (`enabledOrganizations()`, o mesmo gate fail-closed do enxame autônomo).
 * 2. Custo descontrolado: sem `take`, um banco com milhares de leads frios geraria uma chamada de
 *    embedding por lead a cada madrugada, para todas as organizações, sem limite. Agora cada
 *    organização tem um teto por execução (`SCAN_LIMIT_PER_ORG`) e as buscas rodam com
 *    concorrência limitada.
 * 3. Execução duplicada: `node-cron` roda por processo — em qualquer deploy com mais de uma
 *    instância do servidor, cada instância dispararia a mesma varredura ao mesmo tempo,
 *    multiplicando o custo de IA sem nenhum ganho. Uma trava distribuída (`acquireDistributedLock`,
 *    ver `src/lib/queue/distributedLock.ts` — extraída daqui para ser reaproveitada por outras
 *    varreduras periódicas, ex.: `stagnation-scanner.service.ts`) garante uma única execução por
 *    tick quando o Redis está disponível; sem Redis (`queuesEnabled=false`, ambiente local de
 *    instância única) roda direto, sem travar o boot.
 * 4. Observabilidade: nenhuma correlação entre o início e o fim de uma varredura. Cada execução
 *    agora tem um `runId` único nos logs, do início ao fim, com contagem de leads processados e
 *    falhas — o mais próximo de "status de execução" que dá para ter sem um novo modelo de
 *    histórico de automação (ver handoff `07-para-01-automation-execution-history.md` para o
 *    modelo persistente completo, que ainda depende de migração do Agente 01).
 */

/** Teto de leads processados por organização em cada execução — controla o custo de embeddings. */
const SCAN_LIMIT_PER_ORG = 50;
/** Buscas RAG em paralelo. Acima disso o provedor de embeddings começa a devolver 429. */
const SEARCH_CONCURRENCY = 3;
const LOCK_KEY = 'cold-leads-scanner:lock';
/** Precisa ser menor que o intervalo do cron (24h) para nunca travar o serviço indefinidamente
 *  se uma instância morrer no meio da execução sem liberar a trava. */
const LOCK_TTL_SECONDS = 60 * 30;

async function withConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<number> {
    let cursor = 0;
    let failures = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const item = items[cursor++];
            try {
                await worker(item);
            } catch {
                failures++;
            }
        }
    });
    await Promise.all(runners);
    return failures;
}

/** Uma execução da varredura. Exportado para permitir teste direto sem esperar o cron. */
export async function runColdLeadsScan(): Promise<{ runId: string; organizations: number; scanned: number; failures: number }> {
    const startedAt = Date.now();
    const lock = await acquireDistributedLock(LOCK_KEY, LOCK_TTL_SECONDS);
    const { runId } = lock;

    if (!lock.acquired) {
        logger.info({ runId }, 'Cold leads scan pulada: outra instância já está executando.');
        return { runId, organizations: 0, scanned: 0, failures: 0 };
    }

    logger.info({ runId }, 'Cold leads scan iniciada.');
    let totalScanned = 0;
    let totalFailures = 0;
    let organizationCount = 0;

    try {
        const organizationIds = await enabledOrganizations();
        organizationCount = organizationIds.length;
        if (organizationIds.length === 0) {
            logger.info({ runId }, 'Cold leads scan: nenhuma organização habilitada para o piloto automático de IA.');
            return { runId, organizations: 0, scanned: 0, failures: 0 };
        }

        for (const organizationId of organizationIds) {
            // A busca de leads frios (`prisma.lead.findMany`) precisa rodar DENTRO do mesmo
            // `requestContext.run` que o processamento — antes desta correção ela rodava fora,
            // sem `app.current_tenant_id` setado na transação da extensão RLS de
            // src/lib/prisma.ts. Com FORCE ROW LEVEL SECURITY, isso faz a query devolver
            // silenciosamente zero linhas (ou vazar entre tenants, dependendo do papel de banco em
            // uso) mesmo com o filtro explícito de `organizationId` no WHERE — mesmo padrão já
            // corrigido em `runBitrixSyncTick` (syncRules.ts).
            const failures = await requestContext.run({ tenantId: organizationId }, async () => {
                const coldLeads = await prisma.lead.findMany({
                    where: { organizationId, temperature: 'Frio' },
                    take: SCAN_LIMIT_PER_ORG,
                    orderBy: { updatedAt: 'asc' },
                    include: { company: true },
                });
                totalScanned += coldLeads.length;

                return withConcurrency(coldLeads, SEARCH_CONCURRENCY, async (lead) => {
                    const query = `Segmento: ${lead.company?.segment ?? 'geral'} Porte: ${lead.company?.size ?? 'geral'} Nome: ${lead.company?.tradeName ?? 'geral'}`;
                    const insights = await VectorSearchService.searchChunks(query, organizationId, 3);
                    logger.info({ runId, organizationId, leadId: lead.id, insightsCount: insights.length }, 'RAG insights for cold lead');
                });
            });
            totalFailures += failures;
        }

        logger.info(
            { runId, organizations: organizationCount, scanned: totalScanned, failures: totalFailures, durationMs: Date.now() - startedAt },
            'Cold leads scan concluída.',
        );
        return { runId, organizations: organizationCount, scanned: totalScanned, failures: totalFailures };
    } catch (error) {
        logger.error({ err: error, runId }, 'Cold leads scan falhou.');
        return { runId, organizations: organizationCount, scanned: totalScanned, failures: totalFailures + 1 };
    } finally {
        await lock.release();
    }
}

import { Worker, Queue } from 'bullmq';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';

export const COLD_LEADS_SCANNER_QUEUE_NAME = 'cold-leads-scanner-queue';

export function createColdLeadsScannerWorker() {
    const worker = new Worker(COLD_LEADS_SCANNER_QUEUE_NAME, async (job) => {
        logger.info('Iniciando job de cold-leads-scanner');
        await runColdLeadsScan();
    }, {
        connection: connection as any,
        concurrency: 1
    });

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'ColdLeadsScanner worker job falhou');
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({
            queue: COLD_LEADS_SCANNER_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            attemptsMade: job.attemptsMade,
            error: err,
        });
    });

    worker.on('error', (err) => {
        logger.warn({ err }, 'ColdLeadsScanner worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleColdLeadsScannerJob() {
    const queue = new Queue(COLD_LEADS_SCANNER_QUEUE_NAME, {
        connection: connection as any
    });
    
    // Roda todo dia as 02:00
    await queue.upsertJobScheduler('daily-cold-leads-scan', { pattern: '0 2 * * *' }, {
        name: 'daily-cold-leads-scan',
        data: {},
    });
    
    logger.info('ColdLeadsScanner job scheduled (cron: 0 2 * * *)');
}
