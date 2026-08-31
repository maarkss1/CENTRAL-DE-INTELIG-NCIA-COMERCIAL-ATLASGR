import { Queue, Worker, type Job } from 'bullmq';
import { connection, queuesEnabled } from './redis.js';
import { logger } from '../logger.js';
import {
  runEnrichmentCascade,
  type CascadeEnrichmentOptions,
} from '../../features/prospecting/services/enrichmentCascade.service.js';
import { requestContext } from '../async-context.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';
import { recordDeadLetter, isFinalAttempt } from './deadLetter.js';

export const ENRICHMENT_CASCADE_QUEUE_NAME = 'enrichment-cascade-queue';

export interface EnrichmentCascadeJobData {
  companyId: string;
  organizationId: string;
  options?: CascadeEnrichmentOptions;
}

export const enrichmentCascadeQueue = queuesEnabled
  ? new Queue<EnrichmentCascadeJobData>(ENRICHMENT_CASCADE_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 8_000 },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    })
  : null;

if (enrichmentCascadeQueue) {
  registerQueueForMetrics(ENRICHMENT_CASCADE_QUEUE_NAME, enrichmentCascadeQueue);
  enrichmentCascadeQueue.on('error', (err) =>
    logger.warn({ message: err.message }, 'enrichmentCascadeQueue offline'),
  );
}

export function createEnrichmentCascadeWorker() {
  const worker = new Worker<EnrichmentCascadeJobData>(
    ENRICHMENT_CASCADE_QUEUE_NAME,
    async (job: Job<EnrichmentCascadeJobData>) => {
      const { companyId, organizationId, options } = job.data;
      logger.info(
        { jobId: job.id, companyId, organizationId },
        'Iniciando job de enriquecimento em cascata',
      );

      await requestContext.run({ tenantId: organizationId }, async () => {
        try {
          const result = await runEnrichmentCascade(organizationId, companyId, options);
          logger.info(
            {
              jobId: job.id,
              companyId,
              organizationId,
              apollo: result.apolloEnriched,
              hunter: result.hunterEnriched,
              places: result.googlePlacesEnriched,
              contacts: result.contactsAdded,
            },
            'Job de enriquecimento em cascata concluído',
          );
        } catch (error) {
          logger.error(
            { err: error, jobId: job.id, companyId },
            'Falha no job de enriquecimento em cascata',
          );
          throw error;
        }
      });
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 5,
        duration: 1000, // Rate-limit inteligente: no máximo 5 requisições por segundo para respeitar as quotas das APIs
      },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Job de cascata falhou definitivamente');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: ENRICHMENT_CASCADE_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      organizationId: job.data?.organizationId ?? null,
      attemptsMade: job.attemptsMade,
      error: err,
      data: job.data,
    });
  });

  worker.on('completed', () => recordQueueJobCompleted(ENRICHMENT_CASCADE_QUEUE_NAME));

  return worker;
}
