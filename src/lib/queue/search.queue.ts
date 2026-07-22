import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { meili } from '../search/index.js';

export const SEARCH_QUEUE_NAME = 'search-indexing';

export const searchQueue = new Queue(SEARCH_QUEUE_NAME, { connection });
export const searchQueueEvents = new QueueEvents(SEARCH_QUEUE_NAME, { connection });

searchQueueEvents.on('completed', ({ jobId }) => {
    logger.debug({ jobId }, 'Job completed in search queue');
});

searchQueueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error({ jobId, failedReason }, 'Job failed in search queue');
});

export const createSearchWorker = () => {
    const worker = new Worker(SEARCH_QUEUE_NAME, async (job: Job) => {
        logger.debug({ jobId: job.id, action: job.name, index: job.data.index }, 'Processing search indexing job');
        
        try {
            const { index, action, data } = job.data;
            if (!index || !action || !data) {
                throw new Error("Missing required job data for search indexing");
            }

            if (action === 'add' || action === 'update') {
                if (action === 'add') {
                    await meili.index(index).addDocuments(data);
                } else {
                    await meili.index(index).updateDocuments(data);
                }
            } else if (action === 'delete') {
                await meili.index(index).deleteDocuments(data);
            }

            return { success: true, processedAt: new Date().toISOString() };
        } catch (error: any) {
            logger.error({ err: error }, 'Error during search indexing');
            throw error;
        }
    }, { connection });

    worker.on('error', (err) => {
        logger.error({ err }, 'Search Worker error');
    });

    return worker;
};
