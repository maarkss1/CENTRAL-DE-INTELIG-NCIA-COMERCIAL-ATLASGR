import { Queue, Worker, Job } from 'bullmq';
import { connection, queuesEnabled } from './redis.js';
import { logger } from '../logger.js';
import { enrichCompany } from '../../features/prospecting/services/enrichment.service.js';
import { requestContext } from '../async-context.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';

export const ENRICHMENT_QUEUE_NAME = 'enrichment-queue';

export const enrichmentQueue = queuesEnabled
    ? new Queue(ENRICHMENT_QUEUE_NAME, { connection })
    : null;
registerQueueForMetrics(ENRICHMENT_QUEUE_NAME, enrichmentQueue);
enrichmentQueue?.on('error', (err) => logger.warn({ message: err.message }, 'enrichmentQueue offline'));

interface EnrichmentJobData {
    companyId: string;
    organizationId: string;
    cnpj?: string;
    segmentKeywords?: string[];
}

export function createEnrichmentWorker() {
    const worker = new Worker<EnrichmentJobData>(
        ENRICHMENT_QUEUE_NAME,
        async (job: Job<EnrichmentJobData>) => {
            const { companyId, organizationId, cnpj, segmentKeywords } = job.data;
            logger.info({ jobId: job.id, companyId, organizationId }, 'Processing enrichment job');

            // O worker BullMQ roda fora do contexto HTTP — precisamos injetar o tenantId
            // manualmente para que o Prisma extension aplique o RLS e encontre a empresa.
            await requestContext.run({ tenantId: organizationId }, async () => {
                try {
                    await enrichCompany(organizationId, companyId, { cnpj, segmentKeywords });
                    logger.info({ companyId, organizationId }, 'Enrichment job completed successfully');
                } catch (error) {
                    logger.error({ err: error, jobId: job.id, companyId }, 'Enrichment job failed');
                    throw error;
                }
            });
        },
        { connection, concurrency: 5 }
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Enrichment worker job permanently failed');
    });

    worker.on('completed', () => recordQueueJobCompleted(ENRICHMENT_QUEUE_NAME));

    return worker;
}
