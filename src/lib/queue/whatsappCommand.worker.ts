import { randomUUID } from 'node:crypto';
import { Job, Queue, Worker } from 'bullmq';
import { connection, queuesEnabled } from './redis.js';
import { logger } from '../logger.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';
import { isFinalAttempt, recordDeadLetter } from './deadLetter.js';
import {
    initWhatsApp,
    logoutWhatsApp,
    sendWhatsAppMessage,
    type SendWhatsAppMessageContext,
} from '../../features/integrations/whatsapp/whatsapp.service.js';

export const WHATSAPP_COMMAND_QUEUE_NAME = 'whatsapp-command';

type BaseCommand = {
    organizationId: string;
    correlationId: string;
};

type ConnectCommand = BaseCommand & { type: 'connect' };
type DisconnectCommand = BaseCommand & { type: 'disconnect' };
type SendCommand = BaseCommand & {
    type: 'send';
    number: string;
    text: string;
    buttons?: string[];
    context?: SendWhatsAppMessageContext;
};

export type WhatsAppCommand = ConnectCommand | DisconnectCommand | SendCommand;
export type WhatsAppCommandInput =
    | Omit<ConnectCommand, 'correlationId'> & { correlationId?: string }
    | Omit<DisconnectCommand, 'correlationId'> & { correlationId?: string }
    | Omit<SendCommand, 'correlationId'> & { correlationId?: string };

export const whatsappCommandQueue = queuesEnabled
    ? new Queue<WhatsAppCommand>(WHATSAPP_COMMAND_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: { age: 60 * 60, count: 1_000 },
            removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
        },
    })
    : null;

whatsappCommandQueue?.on('error', (err) => logger.error({ err }, 'WhatsApp command queue unavailable'));
registerQueueForMetrics(WHATSAPP_COMMAND_QUEUE_NAME, whatsappCommandQueue);

export async function enqueueWhatsAppCommand(
    command: WhatsAppCommandInput,
    idempotencyKey?: string,
): Promise<{ jobId: string; correlationId: string }> {
    if (!whatsappCommandQueue) {
        throw new Error('WhatsApp command broker unavailable: ENABLE_QUEUES=true e REDIS_URL são obrigatórios.');
    }

    const correlationId = command.correlationId || randomUUID();
    const jobId = idempotencyKey
        ? `whatsapp-command:${command.organizationId}:${idempotencyKey}`
        : `whatsapp-command:${command.organizationId}:${correlationId}`;

    const existing = await whatsappCommandQueue.getJob(jobId);
    if (!existing) {
        await whatsappCommandQueue.add(command.type, { ...command, correlationId } as WhatsAppCommand, { jobId });
    }
    return { jobId, correlationId };
}

export function createWhatsAppCommandWorker(): Worker<WhatsAppCommand> {
    const worker = new Worker<WhatsAppCommand>(
        WHATSAPP_COMMAND_QUEUE_NAME,
        async (job: Job<WhatsAppCommand>) => {
            const command = job.data;
            switch (command.type) {
                case 'connect':
                    await initWhatsApp(command.organizationId);
                    return;
                case 'disconnect':
                    await logoutWhatsApp(command.organizationId);
                    return;
                case 'send':
                    await sendWhatsAppMessage(
                        command.organizationId,
                        command.number,
                        command.text,
                        command.buttons,
                        command.context,
                    );
                    return;
            }
        },
        { connection, concurrency: 4 },
    );

    worker.on('completed', () => recordQueueJobCompleted(WHATSAPP_COMMAND_QUEUE_NAME));
    worker.on('failed', (job, err) => {
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        logger.error({ err, jobId: job.id, command: job.name }, 'WhatsApp command failed');
        void recordDeadLetter({
            queue: WHATSAPP_COMMAND_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            organizationId: job.data.organizationId,
            attemptsMade: job.attemptsMade,
            correlationId: job.data.correlationId,
            error: err,
            data: job.data,
        });
    });

    return worker;
}
