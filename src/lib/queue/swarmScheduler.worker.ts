import { Queue, Worker, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { runSwarmScheduler, enabledOrganizations } from '../../features/intelligence/services/swarmScheduler.service.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';

export const SWARM_SCHEDULER_QUEUE_NAME = 'swarm-scheduler';

/** De quanto em quanto tempo o enxame reexamina o funil por conta própria. */
const RUN_EVERY_MS = 15 * 60 * 1000;

export const swarmSchedulerQueue = new Queue(SWARM_SCHEDULER_QUEUE_NAME, { connection });
swarmSchedulerQueue.on('error', (err) => logger.warn({ message: err.message }, 'swarmSchedulerQueue offline'));
registerQueueForMetrics(SWARM_SCHEDULER_QUEUE_NAME, swarmSchedulerQueue);

interface SwarmSchedulerJobData {
    organizationId: string;
}

export function createSwarmSchedulerWorker() {
    const worker = new Worker<SwarmSchedulerJobData>(
        SWARM_SCHEDULER_QUEUE_NAME,
        async (job: Job<SwarmSchedulerJobData>) => runSwarmScheduler(job.data.organizationId),
        // Concorrência 1: duas execuções simultâneas pra mesma organização proporiam recomendação
        // duplicada pro mesmo lead antes de qualquer uma gravar a AIPendingAction que evita isso.
        { connection, concurrency: 1 },
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Execução do enxame autônomo falhou.');
    });

    worker.on('completed', () => recordQueueJobCompleted(SWARM_SCHEDULER_QUEUE_NAME));

    return worker;
}

/**
 * Agenda o enxame autônomo para cada organização autorizada.
 *
 * Idempotente: o jobId fixo por organização faz o BullMQ substituir o agendamento anterior em vez
 * de acumular um novo a cada reinício do servidor — mesmo padrão de scheduleColdCallCampaigns.
 */
export async function scheduleSwarmScheduler(): Promise<number> {
    const organizations = await enabledOrganizations();
    if (organizations.length === 0) return 0;

    // BullMQ v6 removeu `repeat` de `Queue.add`/`addBulk` (viraria um job avulso, nunca mais se
    // repete) — agendamento recorrente agora exige `upsertJobScheduler`, chamado por organização
    // pois cada uma precisa do seu próprio `jobSchedulerId` idempotente.
    await Promise.all(
        organizations.map((organizationId) =>
            swarmSchedulerQueue.upsertJobScheduler(
                `swarm-scheduler-${organizationId}`,
                { every: RUN_EVERY_MS },
                {
                    name: 'run-swarm-scheduler',
                    data: { organizationId },
                    opts: {
                        removeOnComplete: true,
                        // A rodada reexecuta sozinha em minutos; reprocessar uma falha só produziria
                        // recomendações duplicadas pros mesmos leads.
                        attempts: 1,
                    },
                },
            )
        )
    );

    logger.info({ organizations }, 'Enxame autônomo agendado.');
    return organizations.length;
}
