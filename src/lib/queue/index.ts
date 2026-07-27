import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { connection, queuesEnabled } from './redis.js';
import { logger } from '../logger.js';
import { aiService } from '../../features/intelligence/services/ai.service.js';
import { prisma } from '../prisma.js';

/**
 * Base queue setup. 
 * As an example for the Enterprise architecture, we'll setup a standard Lead Enrichment queue.
 */
export const LEADS_QUEUE_NAME = 'leads-enrichment';

export const leadsQueue = new Queue(LEADS_QUEUE_NAME, { connection });
export const leadsQueueEvents = queuesEnabled
    ? new QueueEvents(LEADS_QUEUE_NAME, { connection })
    : null;

leadsQueue.on('error', (err) => logger.warn({ message: err.message }, 'leadsQueue offline'));
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
        
        try {
            const { leadId, companyInfo } = job.data;
            if (!leadId) {
                throw new Error("Missing leadId in job data");
            }

            const qualificationResult = await aiService.qualifyLead(leadId, companyInfo || '');
            const score = qualificationResult.qualificationScore ?? null;
            const temperature = score != null ? (score >= 75 ? 'Quente' : score >= 45 ? 'Morno' : 'Frio') : undefined;

            await prisma.lead.update({
                where: { id: leadId },
                data: {
                    score: score ?? undefined,
                    temperature: temperature as any,
                    timeline: {
                        create: {
                            type: 'generic',
                            description: `Qualificação por IA: score ${score ?? '?'}/100 — ${qualificationResult.summary || 'sem resumo'}`,
                        },
                    },
                },
            });

            logger.info({ leadId, status: qualificationResult.status, score }, "Lead Qualified Successfully");

            return { success: true, processedAt: new Date().toISOString(), result: qualificationResult };
        } catch (error: any) {
            logger.error({ err: error }, 'Error during lead qualification');
            throw error;
        }
    }, { connection });

    worker.on('error', (err) => {
        logger.error({ err }, 'Worker error');
    });

    return worker;
};
