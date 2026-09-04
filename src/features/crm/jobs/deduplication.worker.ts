import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';

export const DEDUP_QUEUE_NAME = 'deduplication-queue';

export interface DeduplicationOrgResult {
  organizationId: string;
  duplicatesByEmail: number;
  duplicatesByPhone: number;
}

/**
 * Uma execução completa da varredura — agrupamento SEPARADO por organização (nunca contatos de
 * organizações diferentes agrupados juntos: dois tenants diferentes com um contato de mesmo
 * e-mail não são "a mesma pessoa duplicada", são dois clientes distintos usando o mesmo
 * fornecedor). Extraído do processor do `Worker` (mesmo padrão de `runWinLossAnalysis`/
 * `runStagnationScan`) pra ser testável sem precisar instanciar um `Worker`/Redis reais.
 *
 * Achado real de finalização (2026-09-04): `prisma.contact.groupBy` rodava sem NENHUM contexto de
 * RLS nem filtro de `organizationId` — cross-tenant por desenho (misturaria contatos de
 * organizações diferentes no mesmo grupo se a policy deixasse passar) E, por `Contact` estar sob
 * `FORCE ROW LEVEL SECURITY` sem contexto, a query devolvia SEMPRE 0 linhas em produção — a
 * rotina "executava com sucesso" reportando 0/0 duplicatas todo domingo, para sempre, mesmo com
 * uma base suja de verdade. Corrigido com o mesmo padrão já usado em `winLossAnalysis.worker.ts`:
 * descobre as organizações via bypass (`Organization` está no allowlist,
 * `BYPASS_RLS_ALLOWED_MODELS` em src/lib/prisma.ts) e agrupa dentro do tenant real
 * (`requestContext.run({ tenantId })`) para cada uma.
 */
export async function runDeduplicationJob(): Promise<DeduplicationOrgResult[]> {
  logger.info('Iniciando job de deduplicação (Limpeza de Base)');

  const organizations = await requestContext.run({ bypassRls: true }, () =>
    prisma.organization.findMany({ select: { id: true } }),
  );

  const results: DeduplicationOrgResult[] = [];

  for (const { id: organizationId } of organizations) {
    await requestContext.run({ tenantId: organizationId }, async () => {
      // Contact.email/phone cifrados em repouso (ver src/lib/crypto/piiFields.ts) — o mesmo
      // texto puro nunca produz o mesmo ciphertext duas vezes (IV aleatório por valor), então
      // agrupar pela coluna cifrada nunca encontraria duplicata nenhuma. Agrupa pelos índices
      // cegos determinísticos em vez disso (mesmo valor → mesmo índice, ver
      // src/lib/crypto/piiIndex.ts); `emailIndex` normaliza e-mail (trim + lowercase) antes
      // de indexar, então também passa a agrupar variações de maiúsculas/minúsculas do mesmo
      // e-mail como duplicata — refinamento correto para este fim (achar o MESMO e-mail
      // humano), não uma regressão.
      const duplicateEmails = await prisma.contact.groupBy({
        by: ['emailIndex'],
        where: { organizationId },
        having: {
          emailIndex: { _count: { gt: 1 } },
        },
      });

      const emailDupes = duplicateEmails.filter((e) => !!e.emailIndex);

      const duplicatePhones = await prisma.contact.groupBy({
        by: ['phoneIndex'],
        where: { organizationId },
        having: {
          phoneIndex: { _count: { gt: 1 } },
        },
      });

      const phoneDupes = duplicatePhones.filter((e) => !!e.phoneIndex);

      // No futuro, isso poderia realizar o "merge" usando os IDs dos Leads associados.
      // Por enquanto, apenas detecta e envia logs para a organização ou diretoria sobre a base suja.
      logger.info(
        {
          organizationId,
          duplicatesByEmail: emailDupes.length,
          duplicatesByPhone: phoneDupes.length,
        },
        'Rotina de Deduplicação executada com sucesso.',
      );

      results.push({
        organizationId,
        duplicatesByEmail: emailDupes.length,
        duplicatesByPhone: phoneDupes.length,
      });
    });
  }

  return results;
}

export function createDeduplicationWorker() {
  const worker = new Worker(
    DEDUP_QUEUE_NAME,
    async () => {
      try {
        const results = await runDeduplicationJob();
        return {
          duplicatesByEmail: results.reduce((sum, r) => sum + r.duplicatesByEmail, 0),
          duplicatesByPhone: results.reduce((sum, r) => sum + r.duplicatesByPhone, 0),
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
