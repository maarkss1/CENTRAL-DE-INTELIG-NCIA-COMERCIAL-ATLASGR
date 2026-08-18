import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import { sendWhatsAppMessage } from '../../integrations/whatsapp/whatsapp.service.js';

export const FOLLOWUP_QUEUE_NAME = 'whatsapp-followup-queue';

export function createFollowUpWorker() {
    const followUpWorker = new Worker(FOLLOWUP_QUEUE_NAME, async (job) => {
        logger.info('Iniciando job de follow-up diário do WhatsApp');

    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    const leadsToFollowUp = await prisma.lead.findMany({
        where: {
            status: { in: ['Lead_Recebido', 'Qualificacao_SDR'] },
            lastInteraction: {
                lte: oneDayAgo
            }
        },
        include: {
            contact: true
        }
    });

    let sentCount = 0;
    for (const lead of leadsToFollowUp) {
        const customFields = (lead.customFields as Record<string, unknown>) || {};
        if (customFields.optOutWhatsApp) continue;

        const phone = lead.contact?.whatsapp || lead.contact?.phone;
        if (!phone || !lead.organizationId) continue;

        try {
            await sendWhatsAppMessage(
                lead.organizationId,
                phone,
                `Olá! Tudo bem? Estou passando para dar continuidade ao nosso contato de alguns dias atrás. Faz sentido falarmos sobre a proposta essa semana?`,
                ['Sim, tenho interesse', 'Agora não']
            );
            
            await prisma.lead.update({
                where: { id: lead.id },
                data: {
                    lastInteraction: new Date()
                }
            });
            
            sentCount++;
        } catch (err) {
            logger.warn({ err, leadId: lead.id }, 'Falha ao enviar follow-up de WhatsApp');
        }
    }

    }, {
        connection: connection as any,
        concurrency: 1
    });

    followUpWorker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Follow-up worker job falhou');
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({
            queue: FOLLOWUP_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            attemptsMade: job.attemptsMade,
            error: err,
        });
    });

    followUpWorker.on('error', (err) => {
        logger.warn({ err }, 'FollowUp worker error suppressed (Redis offline)');
    });

    return followUpWorker;
}

export async function scheduleFollowUpJobs() {
    const queue = new Queue(FOLLOWUP_QUEUE_NAME, {
        connection: connection as any
    });
    
    // Roda todo dia as 09:00.
    // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
    // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
    await queue.upsertJobScheduler('daily-followups', { pattern: '0 9 * * *' }, {
        name: 'daily-followups',
        data: {},
    });
    
    logger.info('Follow-up jobs scheduled (cron: 0 9 * * *)');
}
