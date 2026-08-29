import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';

export const DEDUP_QUEUE_NAME = 'deduplication-queue';

export function createDeduplicationWorker() {
  const worker = new Worker(
    DEDUP_QUEUE_NAME,
    async (job) => {
      logger.info('Iniciando job de deduplicação (Limpeza de Base)');

      try {
        // Contact.email/phone cifrados em repouso (ver src/lib/crypto/piiFields.ts) — o mesmo
        // texto puro nunca produz o mesmo ciphertext duas vezes (IV aleatório por valor), então
        // agrupar pela coluna cifrada nunca encontraria duplicata nenhuma. Agrupa pelos índices
        // cegos determinísticos em vez disso (mesmo valor → mesmo índice, ver
        // src/lib/crypto/piiIndex.ts); `emailIndex` normaliza e-mail (trim + lowercase) antes
        // de indexar, então também passa a agrupar variações de maiúsculas/minúsculas do mesmo
        // e-mail como duplicata — refinamento correto para este fim (achar o MESMO e-mail
        // humano), não uma regressão.
        // Buscando contatos duplicados por e-mail
        const duplicateEmails = await prisma.contact.groupBy({
          by: ['emailIndex'],
          having: {
            emailIndex: { _count: { gt: 1 } },
          },
        });

        const emailDupes = duplicateEmails.filter((e) => !!e.emailIndex);

        // Buscando contatos duplicados por telefone
        const duplicatePhones = await prisma.contact.groupBy({
          by: ['phoneIndex'],
          having: {
            phoneIndex: { _count: { gt: 1 } },
          },
        });

        const phoneDupes = duplicatePhones.filter((e) => !!e.phoneIndex);

        // No futuro, isso poderia realizar o "merge" usando os IDs dos Leads associados.
        // Por enquanto, apenas detecta e envia logs para a organização ou diretoria sobre a base suja.
        logger.info(
          {
            duplicatesByEmail: emailDupes.length,
            duplicatesByPhone: phoneDupes.length,
          },
          'Rotina de Deduplicação executada com sucesso.',
        );

        return {
          duplicatesByEmail: emailDupes.length,
          duplicatesByPhone: phoneDupes.length,
        };
      } catch (err) {
        logger.error({ err }, 'Falha na rotina de deduplicação');
        throw err;
      }
    },
    {
      connection: connection as any,
      concurrency: 1,
    },
  );

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
    connection: connection as any,
  });

  // Roda domingo meia-noite (0 0 * * 0).
  // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
  // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
  await queue.upsertJobScheduler(
    'weekly-dedup',
    { pattern: '0 0 * * 0' },
    {
      name: 'weekly-dedup',
      data: {},
    },
  );

  logger.info('Deduplication job scheduled (cron: 0 0 * * 0)');
}
