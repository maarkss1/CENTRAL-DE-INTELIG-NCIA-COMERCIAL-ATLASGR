import { Job, Worker } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { recordQueueJobCompleted } from './metrics.js';
import { isFinalAttempt, recordDeadLetter } from './deadLetter.js';
import {
    WHATSAPP_COMMAND_QUEUE_NAME,
    type WhatsAppCommand,
} from './whatsappCommand.queue.js';
import {
    initWhatsApp,
    logoutWhatsApp,
    sendWhatsAppMessage,
} from '../../features/integrations/whatsapp/whatsapp.service.js';

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
