import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';

export const COMPANY_QUEUE_NAME = 'companies-enrichment';

export const companyQueue = new Queue(COMPANY_QUEUE_NAME, { connection });
export const companyQueueEvents = new QueueEvents(COMPANY_QUEUE_NAME, { connection });

companyQueueEvents.on('completed', ({ jobId }) => {
    logger.info({ jobId }, 'Job completed in company enrichment queue');
});

companyQueueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error({ jobId, failedReason }, 'Job failed in company enrichment queue');
});

export const createCompanyWorker = () => {
    const worker = new Worker(COMPANY_QUEUE_NAME, async (job: Job) => {
        logger.info({ jobId: job.id, data: job.data }, 'Processing company enrichment job');
        
        try {
            const { companyId } = job.data;
            if (!companyId) throw new Error("Missing companyId in job data");

            // Simulação de chamada a serviços de enriquecimento externos (BrasilAPI, Apollo)
            await new Promise((resolve) => setTimeout(resolve, 1500));

            await prisma.company.update({
                where: { id: companyId },
                data: {
                    enrichmentStatus: 'Enriquecido',
                    enrichedAt: new Date(),
                }
            });

            logger.info({ companyId }, "Company Enriched Successfully");

            return { success: true, processedAt: new Date().toISOString() };
        } catch (error: any) {
            logger.error({ err: error }, 'Error during company enrichment');
            throw error;
        }
    }, { connection });

    worker.on('error', (err) => {
        logger.error({ err }, 'Company worker error');
    });

    return worker;
};
