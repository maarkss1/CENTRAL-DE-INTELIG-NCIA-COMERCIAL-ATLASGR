import { Worker, Queue, type Job } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { requestContext } from '../../../lib/async-context.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { AccountIntelligenceService } from '../server/accountIntelligence.service.js';
import { withRlsContext } from '../../../lib/prisma.js';

export const accountIntelligenceSchedulerQueueName = 'account-intelligence-scheduler';

export const accountIntelligenceSchedulerQueue = new Queue(accountIntelligenceSchedulerQueueName, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

interface SchedulerJobData {
  batchSize?: number;
}

/**
 * Worker da Fase 5 do LDR: Scheduler Autonomo baseado em prioridade.
 * Roda periodicamente e procura contas cujo \AccountIntelligenceSnapshot\
 * expirou, ou que ainda nao possuem um, forcando a atualizacao real via API interna.
 *
 * Fábrica lazy (não `export const ... = new Worker(...)` no topo do módulo) de propósito: um
 * `Worker` do BullMQ começa a fazer poll no Redis (BZPOPMIN) assim que é construído, mesmo sem
 * `autorun: false`. Como `workers.ts` importa este módulo incondicionalmente, uma instância
 * eager rodava mesmo com ENABLE_EMBEDDED_WORKERS/ENABLE_QUEUES=false — a `connection`
 * compartilhada fica com `lazyConnect: true`/`enableOfflineQueue: false` nesse caso (ver
 * src/lib/queue/redis.ts), e o poll falhava em loop apertado com "Stream isn't writeable and
 * enableOfflineQueue options is false" (reproduzido no boot local desta sessão). Os outros 16
 * workers embutidos em workers.ts já seguem o padrão de fábrica chamada só quando o gate está
 * ligado — este ficou pra trás na Fase 5 do LDR.
 */
export function createAccountIntelligenceSchedulerWorker() {
  return new Worker<SchedulerJobData>(
    accountIntelligenceSchedulerQueueName,
    async (job: Job<SchedulerJobData>) => {
      return requestContext.run({}, async () => {
        logger.info('Iniciando job Account Intelligence Scheduler...');
        const batchSize = job.data.batchSize || 10;

        const expiredSnapshots = await prisma.accountIntelligenceSnapshot.findMany({
          where: {
            expiresAt: { lt: new Date() },
          },
          select: { companyId: true, organizationId: true },
          take: Math.floor(batchSize / 2),
        });

        const noSnapshotCompanies = await prisma.company.findMany({
          where: {
            status: 'Ativo',
            intelligenceSnapshots: { none: {} },
          },
          select: { id: true, organizationId: true },
          take: Math.floor(batchSize / 2),
        });

        const targets = [
          ...expiredSnapshots.map((s) => ({ id: s.companyId, orgId: s.organizationId })),
          ...noSnapshotCompanies.map((c) => ({ id: c.id, orgId: c.organizationId })),
        ].filter((t) => t.orgId !== null) as { id: string; orgId: string }[];

        const uniqueTargets = Array.from(new Map(targets.map((t) => [t.id, t])).values());

        let refreshed = 0;
        for (const target of uniqueTargets) {
          try {
            await withRlsContext(async (tx) => {
              const service = new AccountIntelligenceService(tx as any, target.orgId);
              await service.refresh(target.id);
            });
            refreshed++;
          } catch (error) {
            logger.error(
              { error, companyId: target.id },
              'Falha ao atualizar a inteligencia no scheduler LDR',
            );
          }
        }

        logger.info('Scheduler atualizou ' + refreshed + ' contas (LDR Fase 5).');
        return { success: true, processed: refreshed };
      });
    },
    { connection },
  );
}
