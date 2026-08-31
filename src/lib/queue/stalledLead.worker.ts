import { Queue, Worker, type Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { automationEngine } from '../../features/automations/automation.engine.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';
import { recordDeadLetter, isFinalAttempt } from './deadLetter.js';

export const STALLED_LEAD_QUEUE_NAME = 'stalled-lead-check';

export const stalledLeadQueue = new Queue(STALLED_LEAD_QUEUE_NAME, { connection });
stalledLeadQueue.on('error', (err) =>
  logger.warn({ message: err.message }, 'stalledLeadQueue offline'),
);
registerQueueForMetrics(STALLED_LEAD_QUEUE_NAME, stalledLeadQueue);

export function createStalledLeadWorker() {
  const worker = new Worker(
    STALLED_LEAD_QUEUE_NAME,
    async (job: Job) => {
      logger.info({ jobId: job.id }, 'Iniciando varredura de leads estagnados');

      const leads = await prisma.lead.findMany({
        where: {
          status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos'] },
          deletedAt: null,
        },
        select: {
          id: true,
          organizationId: true,
          status: true,
          lastInteraction: true,
        },
      });

      const now = new Date();
      let processed = 0;

      for (const lead of leads) {
        if (!lead.organizationId) continue;
        const lastInteraction = lead.lastInteraction || now;
        const daysSinceLastInteraction = Math.floor(
          (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24),
        );
        const executed = await automationEngine.handle({
          organizationId: lead.organizationId,
          trigger: 'Lead estagnado',
          entity: 'Lead',
          entityId: lead.id,
          data: {
            status: lead.status,
            daysSinceLastInteraction,
          },
        });
        processed += executed;
      }
      logger.info({ processedCount: processed }, 'Varredura de leads estagnados concluída');
    },
    { connection, concurrency: 1, limiter: { max: 1, duration: 5000 } },
  );

  worker.on('completed', () => recordQueueJobCompleted(worker.name));
  worker.on('failed', async (job, err) => {
    if (job && isFinalAttempt(job.attemptsMade, job.opts.attempts)) {
      await recordDeadLetter({
        queue: worker.name,
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        error: err,
      });
    }
  });

  return worker;
}

export async function scheduleStalledLeadJob() {
  await stalledLeadQueue.upsertJobScheduler(
    'stalled-lead-recurring',
    { pattern: '0 * * * *' },
    { name: 'stalled-lead-recurring', data: {} },
  );
}
