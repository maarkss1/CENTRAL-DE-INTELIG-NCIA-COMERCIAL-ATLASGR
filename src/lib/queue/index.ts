import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { connection, queuesEnabled } from './redis.js';
import { logger } from '../logger.js';
import { requestContext } from '../async-context.js';
import { aiService } from '../../features/intelligence/services/ai.service.js';
import { prisma } from '../prisma.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';
import { recordDeadLetter, isFinalAttempt } from './deadLetter.js';

/**
 * Base queue setup.
 * As an example for the Enterprise architecture, we'll setup a standard Lead Enrichment queue.
 */
export const LEADS_QUEUE_NAME = 'leads-enrichment';

/**
 * QUEUE-001: retries com backoff exponencial + retenção de falhas — sem isto (`defaultJobOptions`
 * ausente), um job usava os defaults do BullMQ (`attempts: 1`, sem retry nenhum, `removeOnFail`
 * indefinido = falhas acumulam no Redis para sempre). Uma falha transitória (timeout do provedor de
 * IA, banco reiniciando) derrubava a qualificação do lead sem nenhuma segunda chance — o usuário via
 * "iniciado em background" e o resultado nunca chegava, sem explicação.
 */
export const leadsQueue = queuesEnabled
    ? new Queue(LEADS_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: { age: 24 * 60 * 60 },
            removeOnFail: { age: 7 * 24 * 60 * 60 },
        },
    })
    : null;
registerQueueForMetrics(LEADS_QUEUE_NAME, leadsQueue);
export const leadsQueueEvents = queuesEnabled
    ? new QueueEvents(LEADS_QUEUE_NAME, { connection })
    : null;

leadsQueue?.on('error', (err) => logger.warn({ message: err.message }, 'leadsQueue offline'));
leadsQueueEvents?.on('error', (err) => logger.warn({ message: err.message }, 'leadsQueueEvents offline'));

leadsQueueEvents?.on('completed', ({ jobId }) => {
    logger.info({ jobId }, 'Job completed in leads queue');
});

leadsQueueEvents?.on('failed', ({ jobId, failedReason }) => {
    logger.error({ jobId, failedReason }, 'Job failed in leads queue');
});

/**
 * Worker setup. In a real microservices architecture, this might run in a separate process.
 * For now, it runs alongside the main server.
 */
export const createLeadsWorker = () => {
    const worker = new Worker(LEADS_QUEUE_NAME, async (job: Job) => {
        logger.info({ jobId: job.id, data: job.data }, 'Processing lead enrichment job');

        const { leadId, companyInfo, organizationId } = job.data as {
            leadId?: string; companyInfo?: string; organizationId?: string;
        };
        if (!leadId) {
            throw new Error('Missing leadId in job data');
        }
        // QUEUE-002: sem isto, o worker rodava fora de qualquer `requestContext.run({ tenantId })` —
        // um job de BullMQ nunca herda o AsyncLocalStorage da requisição HTTP que o enfileirou. Com
        // "Lead" sob FORCE ROW LEVEL SECURITY (ver prisma/migrations/20260722020322_enable_rls), a
        // extensão RLS de src/lib/prisma.ts roda a query SEM `app.current_tenant_id` setado sempre
        // que não há tenant no contexto — a policy então filtra TODA linha (nenhuma passa
        // `NULL = "organizationId"`), silenciosamente. Na prática: `prisma.lead.update` no final
        // deste worker sempre lançava "Record to update not found" (P2025, 0 linhas visíveis), e
        // TODA qualificação de lead por IA em background falhava — sem nunca atualizar score/
        // temperatura, sem o usuário nunca ficar sabendo (a rota que enfileira devolve 202 antes do
        // job rodar). Mesma classe de bug já corrigida em runColdLeadsScan/runBitrixSyncTick.
        if (!organizationId) {
            throw new Error('Missing organizationId in job data — cannot scope this job to a tenant.');
        }

        return requestContext.run({ tenantId: organizationId }, async () => {
            try {
                const qualificationResult = await aiService.qualifyLead(leadId, companyInfo || '');
                const score = qualificationResult.qualificationScore ?? null;
                const temperature = score != null ? (score >= 75 ? 'Quente' : score >= 45 ? 'Morno' : 'Frio') : undefined;

                await prisma.lead.update({
                    where: { id: leadId },
                    data: {
                        score: score ?? undefined,
                        temperature: temperature as unknown as Prisma.LeadUpdateInput['temperature'],
                        timeline: {
                            create: {
                                type: 'generic',
                                description: `Qualificação por IA: score ${score ?? '?'}/100 — ${qualificationResult.summary || 'sem resumo'}`,
                            },
                        },
                    },
                });

                logger.info({ leadId, status: qualificationResult.status, score }, 'Lead Qualified Successfully');

                return { success: true, processedAt: new Date().toISOString(), result: qualificationResult };
            } catch (error: unknown) {
                logger.error({ err: error, leadId, organizationId }, 'Error during lead qualification');
                throw error;
            }
        });
    }, { connection });

    worker.on('error', (err) => {
        logger.error({ err }, 'Worker error');
    });

    worker.on('completed', () => recordQueueJobCompleted(LEADS_QUEUE_NAME));

    // QUEUE-001: dead-letter — só na falha FINAL (todas as tentativas esgotadas), nunca a cada
    // retry intermediário. Ver src/lib/queue/deadLetter.ts.
    worker.on('failed', (job, err) => {
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({
            queue: LEADS_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            organizationId: (job.data as { organizationId?: string })?.organizationId ?? null,
            attemptsMade: job.attemptsMade,
            error: err,
            data: job.data,
        });
    });

    return worker;
};
