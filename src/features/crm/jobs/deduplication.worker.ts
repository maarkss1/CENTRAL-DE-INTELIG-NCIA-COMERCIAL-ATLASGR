import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';

export const DEDUP_QUEUE_NAME = 'deduplication-queue';

export function createDeduplicationWorker() {
    const worker = new Worker(DEDUP_QUEUE_NAME, async (job) => {
        logger.info('Iniciando job de deduplicação (Limpeza de Base)');
        
        try {
            // Agrupa por `emailHash`/`phoneHash` (índice de busca determinístico — HMAC-SHA256 do
            // valor normalizado, ver src/lib/security/piiSearchIndex.ts, DEC-01/onda-42), não mais
            // pelo valor puro de `email`/`phone`: além de continuar funcionando no dia em que esses
            // campos voltarem a ser cifrados em repouso (cifra com IV aleatório nunca agrupa por
            // igualdade), agrupar pelo hash do valor NORMALIZADO também passa a pegar duplicatas que
            // o agrupamento por valor puro deixava passar (ex.: "Ana@Empresa.com" e
            // "ana@empresa.com" — mesmo e-mail, formatação diferente — nunca eram a mesma linha de
            // `groupBy`). O grupo "duplicado por WhatsApp" (via `whatsappHash`) existe no índice mas
            // não é varrido aqui — o job histórico nunca cobriu WhatsApp, mantido assim para não
            // mudar o formato do resultado (`duplicatesByEmail`/`duplicatesByPhone`) sem necessidade.
            // `Contact.emailHash`/`phoneHash` ainda não existem nos tipos gerados do Prisma Client
            // (schema/migration são de dono único deste repositório — ver
            // .agents/handoffs/onda-42/01-para-00-pii-hash-fields.md); o cast para `any` é só para
            // isso, não para contornar um erro de lógica. Depois de `prisma generate` rodar com o
            // schema atualizado, dá para trocar por `Prisma.ContactGroupByArgs` tipado de verdade.
            const contactDelegate = prisma.contact as unknown as {
                groupBy: (args: unknown) => Promise<Array<Record<string, unknown>>>;
            };

            const duplicateEmails = await contactDelegate.groupBy({
                by: ['emailHash'],
                having: { emailHash: { _count: { gt: 1 } } },
            });
            const emailDupes = duplicateEmails.filter((e) => !!e.emailHash);

            const duplicatePhones = await contactDelegate.groupBy({
                by: ['phoneHash'],
                having: { phoneHash: { _count: { gt: 1 } } },
            });
            const phoneDupes = duplicatePhones.filter((e) => !!e.phoneHash);
            
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
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({
            queue: DEDUP_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            attemptsMade: job.attemptsMade,
            error: err,
        });
    });

    worker.on('error', (err) => {
        logger.warn({ err }, 'Deduplication worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleDeduplicationJob() {
    const queue = new Queue(DEDUP_QUEUE_NAME, {
        connection: connection as any
    });
    
    // Roda domingo meia-noite (0 0 * * 0).
    // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
    // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
    await queue.upsertJobScheduler('weekly-dedup', { pattern: '0 0 * * 0' }, {
        name: 'weekly-dedup',
        data: {},
    });
    
    logger.info('Deduplication job scheduled (cron: 0 0 * * 0)');
}
