import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { eraseDataSubject } from '../../../shared/services/dataSubjectErasure.service.js';

export const AUTO_ANONYMIZE_QUEUE_NAME = 'auto-anonymize-disqualified-queue';

export function createAutoAnonymizeWorker() {
    const worker = new Worker(AUTO_ANONYMIZE_QUEUE_NAME, async (job) => {
        logger.info('Iniciando rotina de anonimização de leads desqualificados há > 90 dias');
        
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            // Busca leads desqualificados/perdidos cujo contato ainda não foi anonimizado
            const leadsToAnonymize = await prisma.lead.findMany({
                where: {
                    status: { in: ['Negocios_Perdidos'] },
                    updatedAt: { lte: ninetyDaysAgo },
                    contact: {
                        name: { not: '[titular anonimizado — LGPD]' }
                    }
                },
                select: {
                    id: true,
                    organizationId: true,
                    contactId: true
                },
                take: 100
            });

            let anonymizedCount = 0;
            for (const lead of leadsToAnonymize) {
                if (lead.contactId && lead.organizationId) {
                    await eraseDataSubject({
                        organizationId: lead.organizationId,
                        contactId: lead.contactId
                    });
                    anonymizedCount++;
                }
            }

            logger.info({ anonymizedCount }, 'Anonimização automática de leads concluída');
            return { anonymizedCount };
        } catch (err) {
            logger.error({ err }, 'Erro ao executar worker de anonimização automática');
            throw err;
        }
    }, { connection: connection as any });

    worker.on('error', (err) => {
        logger.warn({ message: err.message }, 'AutoAnonymize worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleAutoAnonymizeJob() {
    if (!connection) return;
    const queue = new Queue(AUTO_ANONYMIZE_QUEUE_NAME, { connection: connection as any });
    // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
    // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
    await queue.upsertJobScheduler(
        'auto-anonymize-daily',
        { pattern: '0 3 * * *' }, // Roda todo dia às 3h da manhã
        { name: 'clean-old-disqualified-leads', data: {} }
    );
}
