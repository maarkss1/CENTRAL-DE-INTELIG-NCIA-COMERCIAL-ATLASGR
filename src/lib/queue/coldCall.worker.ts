import { Queue, Worker, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { runColdCallCampaign, enabledOrganizations } from '../../features/integrations/birth-voice/coldCall.service.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';

export const COLD_CALL_QUEUE_NAME = 'sdr-cold-call';

/** De quanto em quanto tempo a campanha reexamina o funil. */
const RUN_EVERY_MS = 15 * 60 * 1000;

export const coldCallQueue = new Queue(COLD_CALL_QUEUE_NAME, { connection });
coldCallQueue.on('error', (err) => logger.warn({ message: err.message }, 'coldCallQueue offline'));
registerQueueForMetrics(COLD_CALL_QUEUE_NAME, coldCallQueue);

interface ColdCallJobData {
    organizationId: string;
}

export function createColdCallWorker() {
    const worker = new Worker<ColdCallJobData>(
        COLD_CALL_QUEUE_NAME,
        async (job: Job<ColdCallJobData>) => runColdCallCampaign(job.data.organizationId),
        // Concorrência 1: duas execuções simultâneas para a mesma organização leriam a mesma lista
        // de candidatos antes de qualquer uma marcar lastInteraction, e discariam em dobro.
        { connection, concurrency: 1 },
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Campanha de prospecção fria falhou.');
    });

    worker.on('completed', () => recordQueueJobCompleted(COLD_CALL_QUEUE_NAME));

    return worker;
}

/**
 * Agenda a campanha para cada organização autorizada.
 *
 * Idempotente: o jobId fixo por organização faz o BullMQ substituir o agendamento anterior em vez
 * de acumular um novo a cada reinício do servidor — sem isso, dez deploys num dia significariam
 * dez campanhas simultâneas discando para os mesmos leads.
 */
export async function scheduleColdCallCampaigns(): Promise<number> {
    const organizations = await enabledOrganizations();
    if (organizations.length === 0) return 0;

    for (const organizationId of organizations) {
        // BullMQ v6 removeu `repeat` de `Queue.add` (vira só um job avulso, nunca mais se repete) —
        // agendamento recorrente agora exige `upsertJobScheduler`, que também é idempotente por
        // `jobSchedulerId` (substitui o agendamento anterior em vez de acumular a cada reinício).
        await coldCallQueue.upsertJobScheduler(
            `cold-call-${organizationId}`,
            { every: RUN_EVERY_MS },
            {
                name: 'run-campaign',
                data: { organizationId },
                opts: {
                    removeOnComplete: true,
                    // A campanha reexecuta sozinha em minutos; reprocessar uma falha só produziria
                    // ligações repetidas para os mesmos leads.
                    attempts: 1,
                },
            },
        );
    }

    logger.info({ organizations }, 'Campanha de prospecção fria agendada.');
    return organizations.length;
}
