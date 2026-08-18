import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { connection, queuesEnabled } from './redis.js';
import { logger } from '../logger.js';
import { registerQueueForMetrics } from './metrics.js';
import type { SendWhatsAppMessageContext } from '../../features/integrations/whatsapp/whatsapp.service.js';

export const WHATSAPP_COMMAND_QUEUE_NAME = 'whatsapp-command';

type BaseCommand = {
    organizationId: string;
    correlationId: string;
};

export type WhatsAppCommand =
    | (BaseCommand & { type: 'connect' })
    | (BaseCommand & { type: 'disconnect' })
    | (BaseCommand & {
        type: 'send';
        number: string;
        text: string;
        buttons?: string[];
        context?: SendWhatsAppMessageContext;
    });

export type WhatsAppCommandInput =
    | { type: 'connect'; organizationId: string; correlationId?: string }
    | { type: 'disconnect'; organizationId: string; correlationId?: string }
    | {
        type: 'send';
        organizationId: string;
        correlationId?: string;
        number: string;
        text: string;
        buttons?: string[];
        context?: SendWhatsAppMessageContext;
    };

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
