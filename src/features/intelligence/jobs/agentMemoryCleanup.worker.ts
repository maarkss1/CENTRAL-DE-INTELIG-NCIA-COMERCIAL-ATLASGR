import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import { requestContext } from '../../../lib/async-context.js';
import { env } from '../../../config/env.js';

export const AGENT_MEMORY_CLEANUP_QUEUE_NAME = 'agent-memory-cleanup-queue';

// `agentType` usado pelo LearningAgent (src/features/intelligence/agents/learning.agent.ts,
// `persistProfile`) para guardar o "Manual de Estilo" aprendido por (tenant, ator) — um único
// registro de CONFIGURAÇÃO de longo prazo, sobrescrito a cada `reflectAndLearn` bem-sucedido, nunca
// uma sessão de conversa efêmera. AgentMemory não tem uma coluna dedicada para distinguir "sessão
// de execução" de "perfil aprendido" — os dois vivem na mesma tabela, diferenciados só por este
// valor de agentType (ver comentário em learningProfileSessionId, learning.agent.ts).
//
// DECISÃO deste worker: LEARNING_PROFILE é excluído do expurgo automático por idade, não apenas
// tem retenção maior. Motivo: apagar por idade um perfil que ninguém reflete há muito tempo
// destruiria uma configuração ainda ativa (o SDR/BDR/CRM autônomo continua carregando esse perfil
// via getLearningProfile em toda execução) sem nenhum ganho real de espaço — é 1 linha por
// (tenant, ator), não cresce por sessão como as demais. Se o produto decidir no futuro que um
// perfil aprendido "expira" depois de X tempo sem reflexão, essa é uma decisão de negócio separada
// (revalidar o estilo aprendido), não uma limpeza de lixo de sessão — não implementada aqui.
export const LEARNING_PROFILE_AGENT_TYPE = 'LEARNING_PROFILE';

export interface AgentMemoryCleanupResult {
  deletedCount: number;
  organizationsProcessed: number;
  retentionDays: number;
}

/**
 * Corpo do job, exportado à parte do worker BullMQ (mesmo padrão de `runAutoAnonymizeSweep` em
 * `autoAnonymizeDisqualified.worker.ts` e `runWeeklySalesReportJob` em `weeklyPdfReport.worker.ts`)
 * para ser testável sem depender de Redis/BullMQ real.
 *
 * Gap real corrigido: `AgentMemory` acumula uma linha por (sessionId, agentType, organizationId)
 * para todo agente do enxame (SDR/BDR/CLOSER/CRM/OPS/LearningAgent) e, até este worker, não existia
 * nenhum job de expurgo — a tabela cresce para sempre.
 */
export async function runAgentMemoryCleanupSweep(): Promise<AgentMemoryCleanupResult> {
  const retentionDays = env.AGENT_MEMORY_RETENTION_DAYS;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  logger.info({ retentionDays }, 'Iniciando expurgo de AgentMemory antigo (todas as organizações)');

  // Descoberta cross-tenant: `Organization` está no allowlist de bypass (BYPASS_RLS_ALLOWED_MODELS,
  // src/lib/prisma.ts) — usado SÓ para listar as organizações existentes, nunca para ler ou
  // apagar `AgentMemory` diretamente. `AgentMemory` foi deliberadamente FECHADO para bypass no
  // ITEM-02 (migration 20260825120000_scope_rls_bypass_to_bootstrap_allowlist) — leitura e
  // escrita dessa tabela, sem exceção, exigem `app.current_tenant_id` real (ver
  // tests/integration/agent-memory.test.ts e tests/integration/rls-bypass-allowlist.test.ts, que
  // provam essa exclusão). Por isso a varredura abaixo roda por organização, sempre dentro do
  // tenant real (`requestContext.run({ tenantId })`), nunca com bypass — mesmo padrão de
  // "descobrir cross-tenant via modelo permitido, processar cada tenant com RLS real" já usado em
  // `runWeeklySalesReportJob` (weeklyPdfReport.worker.ts).
  const organizations = await requestContext.run({ bypassRls: true }, () =>
    prisma.organization.findMany({ select: { id: true } }),
  );

  let deletedCount = 0;
  for (const org of organizations) {
    try {
      const result = await requestContext.run({ tenantId: org.id }, () =>
        prisma.agentMemory.deleteMany({
          where: {
            organizationId: org.id,
            updatedAt: { lte: cutoff },
            // LEARNING_PROFILE nunca expira por idade aqui — ver
            // LEARNING_PROFILE_AGENT_TYPE acima.
            agentType: { not: LEARNING_PROFILE_AGENT_TYPE },
          },
        }),
      );
      deletedCount += result.count;
    } catch (err) {
      logger.error(
        { err, organizationId: org.id },
        'Falha ao expurgar AgentMemory desta organização',
      );
    }
  }

  // NOTA (mesma limitação já documentada em prisma/schema.prisma, model AgentMemory): linhas
  // legadas com organizationId NULL nunca são alcançadas por esta varredura — já são órfãs e
  // invisíveis sob a política de RLS real (NULL nunca colide com organizationId de nenhum
  // tenant), e AgentMemory não tem bypass para lê-las de outra forma. Gap pré-existente, não
  // introduzido por este worker.
  logger.info(
    { deletedCount, organizationsProcessed: organizations.length, retentionDays },
    'Expurgo de AgentMemory concluído',
  );
  return { deletedCount, organizationsProcessed: organizations.length, retentionDays };
}

export function createAgentMemoryCleanupWorker() {
  const worker = new Worker(
    AGENT_MEMORY_CLEANUP_QUEUE_NAME,
    async (_job) => runAgentMemoryCleanupSweep(),
    {
      connection: connection as any,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'AgentMemory cleanup worker job falhou');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: AGENT_MEMORY_CLEANUP_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

  worker.on('error', (err) => {
    logger.warn(
      { message: err.message },
      'AgentMemoryCleanup worker error suppressed (Redis offline)',
    );
  });

  return worker;
}

export async function scheduleAgentMemoryCleanupJob() {
  const queue = new Queue(AGENT_MEMORY_CLEANUP_QUEUE_NAME, { connection: connection as any });
  // Roda todo dia às 4h da manhã (fora do horário de auto-anonimização de leads, 3h, e do
  // follow-up diário, 9h — ver autoAnonymizeDisqualified.worker.ts/followUp.worker.ts).
  // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
  // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
  await queue.upsertJobScheduler(
    'agent-memory-cleanup-daily',
    { pattern: '0 4 * * *' },
    { name: 'cleanup-old-agent-memory', data: {} },
  );

  logger.info('AgentMemory cleanup job scheduled (cron: 0 4 * * *)');
}
