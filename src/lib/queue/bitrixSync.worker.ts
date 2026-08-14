import { Queue, Worker, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { runBitrixSyncTick } from '../../features/integrations/bitrix/bitrix.service.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';

export const BITRIX_SYNC_QUEUE_NAME = 'bitrix-sync';

/** De quanto em quanto tempo as regras de sincronização automática são reavaliadas. */
const RUN_EVERY_MS = 15 * 60 * 1000;

export const bitrixSyncQueue = new Queue(BITRIX_SYNC_QUEUE_NAME, { connection });
bitrixSyncQueue.on('error', (err) => logger.warn({ message: err.message }, 'bitrixSyncQueue offline'));
registerQueueForMetrics(BITRIX_SYNC_QUEUE_NAME, bitrixSyncQueue);

export function createBitrixSyncWorker() {
    // Um único job global (não um por organização): diferente do enxame autônomo/prospecção fria,
    // regras de sync são criadas dinamicamente pela própria tela de Integrações, sem passar por
    // variável de ambiente — agendar por organização exigiria reiniciar o servidor toda vez que
    // alguém criasse a primeira regra. runBitrixSyncTick já varre todas as organizações com regra
    // ativa a cada execução.
    const worker = new Worker(
        BITRIX_SYNC_QUEUE_NAME,
        async (_job: Job) => runBitrixSyncTick(),
        { connection, concurrency: 1 },
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Execução da sincronização automática do Bitrix falhou.');
    });

    worker.on('completed', () => recordQueueJobCompleted(BITRIX_SYNC_QUEUE_NAME));

    return worker;
}

/** Idempotente: jobId fixo faz o BullMQ substituir o agendamento anterior em vez de acumular a cada reinício. */
export async function scheduleBitrixSync(): Promise<void> {
    // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
    // agendamento recorrente agora exige `upsertJobScheduler`.
    await bitrixSyncQueue.upsertJobScheduler(
        'bitrix-sync-tick',
        { every: RUN_EVERY_MS },
        {
            name: 'run-bitrix-sync',
            data: {},
            opts: {
                removeOnComplete: true,
                attempts: 1,
            },
        },
    );
    logger.info('Sincronização automática do Bitrix agendada.');
}
