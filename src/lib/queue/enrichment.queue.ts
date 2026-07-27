import { Queue, Worker, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { enrichCompany } from '../../features/prospecting/services/enrichment.service.js';

export const ENRICHMENT_QUEUE_NAME = 'enrichment-queue';

export const enrichmentQueue = new Queue(ENRICHMENT_QUEUE_NAME, { connection });
enrichmentQueue.on('error', (err) => logger.warn({ message: err.message }, 'enrichmentQueue offline'));

interface EnrichmentJobData {
    companyId: string;
    cnpj?: string;
    segmentKeywords?: string[];
}

export function createEnrichmentWorker() {
    const worker = new Worker<EnrichmentJobData>(
        ENRICHMENT_QUEUE_NAME,
        async (job: Job<EnrichmentJobData>) => {
            logger.info({ jobId: job.id, companyId: job.data.companyId }, 'Processing enrichment job');

            try {
                const { companyId, cnpj, segmentKeywords } = job.data;
                await enrichCompany(companyId, { cnpj, segmentKeywords });
                logger.info({ companyId }, 'Enrichment job completed successfully');
            } catch (error) {
                logger.error({ err: error, jobId: job.id }, 'Enrichment job failed');
                throw error;
            }
        },
        { connection, concurrency: 5 }
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Enrichment worker job permanently failed');
    });

    return worker;
}
