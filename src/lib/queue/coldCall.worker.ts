import { Queue, Worker, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { runColdCallCampaign, enabledOrganizations } from '../../features/integrations/birth-voice/coldCall.service.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';
import { recordDeadLetter, isFinalAttempt } from './deadLetter.js';

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
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({
            queue: COLD_CALL_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            organizationId: job.data.organizationId,
            attemptsMade: job.attemptsMade,
            error: err,
        });
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

    // Remove agendamentos recorrentes de organizações que perderam a autorização desde a última vez
    // que isto rodou (env mudou, redeploy com uma lista menor em SDR_COLD_CALL_ORGANIZATIONS) — sem
    // isto, revogar a autorização de uma organização não para a campanha: o agendamento fica
    // persistido no Redis do BullMQ e continua disparando a cada intervalo, porque `upsertJobScheduler`
    // só cria/atualiza os agendamentos da lista atual, nunca remove os que saíram dela.
    // `runColdCallCampaign` já revalida as duas travas na execução (defesa em profundidade), mas
    // deixar o agendamento morto vivo ainda gastaria um ciclo de fila e um log de "not-authorized"
    // a cada 15 minutos, para sempre.
    const enabledSet = new Set(organizations);
    const existingSchedulers = await coldCallQueue.getJobSchedulers();
    for (const scheduler of existingSchedulers) {
        const schedulerId = scheduler.id;
        if (!schedulerId?.startsWith('cold-call-')) continue;
        const organizationId = schedulerId.slice('cold-call-'.length);
        if (!enabledSet.has(organizationId)) {
            await coldCallQueue.removeJobScheduler(schedulerId);
            logger.warn(
                { organizationId },
                'Agendamento de campanha fria removido: organização não está mais autorizada (SDR_COLD_CALL_ENABLED/SDR_COLD_CALL_ORGANIZATIONS).',
            );
        }
    }

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
