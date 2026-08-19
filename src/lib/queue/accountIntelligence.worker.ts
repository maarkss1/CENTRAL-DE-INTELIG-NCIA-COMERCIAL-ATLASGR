import { Queue, Worker, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { accountIntelligenceService } from '../../features/market-intelligence/server/accountIntelligence.service.js';
import { actionExecutorService } from '../../features/market-intelligence/server/actionExecutor.service.js';

export const ACCOUNT_INTELLIGENCE_QUEUE = 'account-intelligence';

export const accountIntelligenceQueue = new Queue(ACCOUNT_INTELLIGENCE_QUEUE, { connection });
accountIntelligenceQueue.on('error', (err) => logger.warn({ err }, 'AccountIntelligenceQueue offline'));

interface JobData {
    companyId?: string;
    recommendationId?: string;
}

export function createAccountIntelligenceWorker() {
    const worker = new Worker<JobData>(
        ACCOUNT_INTELLIGENCE_QUEUE,
        async (job: Job<JobData>) => {
            if (job.name === 'refresh-account-intelligence') {
                if (!job.data.companyId) throw new Error('companyId required');
                await accountIntelligenceService.refreshIntelligence(job.data.companyId);
            } else if (job.name === 'dispatch-approved-commercial-action') {
                if (!job.data.recommendationId) throw new Error('recommendationId required');
                await actionExecutorService.executeAction(job.data.recommendationId);
            }
        },
        { connection, concurrency: 5 }
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id, name: job?.name }, 'Falha na execução de job de account intelligence.');
    });

    return worker;
}

export async function scheduleAccountRefresh(companyId: string) {
    await accountIntelligenceQueue.add('refresh-account-intelligence', { companyId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        jobId: `refresh-${companyId}` // idempotency
    });
}

export async function scheduleActionDispatch(recommendationId: string) {
    await accountIntelligenceQueue.add('dispatch-approved-commercial-action', { recommendationId }, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: true,
        jobId: `dispatch-${recommendationId}` // idempotency
    });
}
