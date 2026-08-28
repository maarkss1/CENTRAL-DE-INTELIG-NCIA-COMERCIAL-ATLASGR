import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import { requestContext } from '../../../lib/async-context.js';
import { eraseDataSubject } from '../../../shared/services/dataSubjectErasure.service.js';

export const AUTO_ANONYMIZE_QUEUE_NAME = 'auto-anonymize-disqualified-queue';

// SEC-007 (Sprint 01/Onda 13): extraído do processor do Worker para ser testável sem precisar de
// Redis/BullMQ real — o worker.ts abaixo só chama esta função. `eraseDataSubject` (que esta função
// chama por lead elegível) já é idempotente por si só (ver `tests/integration/lgpd-erasure-cross-
// tenant.test.ts`), mas isso nunca tinha sido comprovado rodando a VARREDURA inteira duas vezes
// seguidas — o filtro `contact.name != '[titular anonimizado — LGPD]'` é o que deveria impedir a
// segunda rodada de reprocessar quem a primeira já tratou.
export async function runAutoAnonymizeSweep(): Promise<{ anonymizedCount: number }> {
  logger.info('Iniciando rotina de anonimização de leads desqualificados há > 90 dias');

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // BUG REAL encontrado ao escrever o teste de idempotência (SEC-007): esta função nunca
    // abria contexto de RLS próprio. O processor do BullMQ (abaixo) chama
    // `runAutoAnonymizeSweep()` fora de qualquer requisição HTTP — sem `tenantId`/`bypassRls`
    // no `AsyncLocalStorage`, a policy RLS de `Lead` nega toda linha silenciosamente
    // (`findMany` sempre voltava `[]`, sem lançar erro). Na prática, este worker NUNCA
    // anonimizou nenhum lead em produção — a varredura sempre "concluía com sucesso"
    // processando zero. Mesmo padrão já resolvido em `runBitrixSyncTick`
    // (`src/features/integrations/bitrix/service/syncRules.ts`): bypass só para a descoberta
    // cross-tenant (aqui, "quais leads em QUALQUER organização são elegíveis"); cada
    // anonimização em si já roda escopada ao tenant certo dentro de `eraseDataSubject`
    // (`requestContext.run({ tenantId: ... })`, ver dataSubjectErasure.service.ts).
    //
    // ITEM-02 (remediação de dívida técnica P0): a descoberta cross-tenant NÃO filtra mais por
    // `contact: { name: { not: ANONYMIZED } }` aqui — esse filtro fazia o Prisma gerar um JOIN
    // contra `Contact`, e `Contact` (dado pessoal do titular) deliberadamente NÃO está no
    // allowlist de bypass (`BYPASS_RLS_ALLOWED_MODELS`, src/lib/prisma.ts) precisamente por ser
    // uma das tabelas mais sensíveis do produto — com a RLS de `Contact` fechada para bypass
    // (migration 20260825120000_scope_rls_bypass_to_bootstrap_allowlist), esse JOIN cross-tenant
    // sob bypass sempre devolvia zero linhas (a varredura silenciosamente parava de anonimizar
    // qualquer lead de novo). A elegibilidade "contato ainda não anonimizado" agora é checada
    // abaixo, DEPOIS de resolver o tenant de cada lead (`contact` lido dentro do próprio
    // `requestContext.run({ tenantId })`, RLS real de tenant, sem bypass nenhum) — `Lead` segue
    // sendo a única leitura cross-tenant sob bypass, exatamente como antes.
    const leadsToAnonymize = await requestContext.run({ bypassRls: true }, () =>
      // IMPORTANTE: `await` a query AQUI DENTRO do callback do run(), não fora — Prisma
      // devolve um PrismaPromise "lazy" que só dispara (e só enxerga o AsyncLocalStorage
      // corrente) quando algo dá `.then()`/`await` nela. Ver comentário idêntico em
      // `runBitrixSyncTick`, que documenta o mesmo bug já descoberto uma vez lá.
      prisma.lead.findMany({
        where: {
          status: { in: ['Negocios_Perdidos'] },
          updatedAt: { lte: ninetyDaysAgo },
        },
        select: {
          id: true,
          organizationId: true,
          contactId: true,
        },
        take: 100,
      }),
    );

    let anonymizedCount = 0;
    for (const lead of leadsToAnonymize) {
      if (!lead.contactId || !lead.organizationId) continue;

      const alreadyAnonymized = await requestContext.run({ tenantId: lead.organizationId }, () =>
        prisma.contact.findFirst({
          where: { id: lead.contactId!, name: '[titular anonimizado — LGPD]' },
          select: { id: true },
        }),
      );
      if (alreadyAnonymized) continue;

      await eraseDataSubject({
        organizationId: lead.organizationId,
        contactId: lead.contactId,
      });
      anonymizedCount++;
    }

    logger.info({ anonymizedCount }, 'Anonimização automática de leads concluída');
    return { anonymizedCount };
  } catch (err) {
    logger.error({ err }, 'Erro ao executar worker de anonimização automática');
    throw err;
  }
}

export function createAutoAnonymizeWorker() {
  const worker = new Worker(AUTO_ANONYMIZE_QUEUE_NAME, async (_job) => runAutoAnonymizeSweep(), {
    connection: connection as any,
  });

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Auto-anonymize worker job falhou');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: AUTO_ANONYMIZE_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

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
    { name: 'clean-old-disqualified-leads', data: {} },
  );
}
