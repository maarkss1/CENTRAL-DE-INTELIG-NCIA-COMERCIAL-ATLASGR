import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';

export const DEDUP_QUEUE_NAME = 'deduplication-queue';

export function createDeduplicationWorker() {
    const worker = new Worker(DEDUP_QUEUE_NAME, async (job) => {
        logger.info('Iniciando job de deduplicação (Limpeza de Base)');
        
        try {
            // Buscando contatos duplicados por e-mail
            const duplicateEmails = await prisma.contact.groupBy({
                by: ['email'],
                having: {
                    email: { _count: { gt: 1 } }
                }
            });

            const emailDupes = duplicateEmails.filter(e => !!e.email);
            
            // Buscando contatos duplicados por telefone
            const duplicatePhones = await prisma.contact.groupBy({
                by: ['phone'],
                having: {
                    phone: { _count: { gt: 1 } }
                }
            });

            const phoneDupes = duplicatePhones.filter(e => !!e.phone);
            
            // No futuro, isso poderia realizar o "merge" usando os IDs dos Leads associados.
            // Por enquanto, apenas detecta e envia logs para a organização ou diretoria sobre a base suja.
            logger.info({ 
                duplicatesByEmail: emailDupes.length, 
                duplicatesByPhone: phoneDupes.length 
            }, 'Rotina de Deduplicação executada com sucesso.');

            return { 
                duplicatesByEmail: emailDupes.length, 
                duplicatesByPhone: phoneDupes.length 
            };
        } catch (err) {
            logger.error({ err }, 'Falha na rotina de deduplicação');
            throw err;
        }
    }, {
        connection: connection as any,
        concurrency: 1
    });

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Deduplication worker job falhou');
    });

    return worker;
}

export async function scheduleDeduplicationJob() {
    const queue = new Queue(DEDUP_QUEUE_NAME, {
        connection: connection as any
    });
    
    // Roda domingo meia-noite (0 0 * * 0)
    await queue.add('weekly-dedup', {}, {
        repeat: {
            pattern: '0 0 * * 0'
        }
    });
    
    logger.info('Deduplication job scheduled (cron: 0 0 * * 0)');
}
