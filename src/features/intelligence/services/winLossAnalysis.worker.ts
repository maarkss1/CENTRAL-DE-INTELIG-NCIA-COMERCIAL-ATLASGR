import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { requestContext } from '../../../lib/async-context.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export const WIN_LOSS_QUEUE_NAME = 'win-loss-analysis-queue';

/** Mesmos 4 status usados pelo disparo manual (`POST /api/intelligence/win-loss-analysis`,
 *  `intelligence.routes.ts`) — antes desta correção o cron usava uma lista menor (sem
 *  `Negocios_Ganhos`), então a análise automática de sexta nunca via negócios explicitamente
 *  marcados como ganhos, só a transição para `Convertido_em_Oportunidade`. Achado real do Piloto de
 *  Win/Loss Analysis: as duas execuções (manual e agendada) devem enxergar o mesmo universo de
 *  leads. */
const WIN_LOSS_STATUSES = [
  'Convertido_em_Oportunidade',
  'Lead_Desqualificado',
  'Negocios_Perdidos',
  'Negocios_Ganhos',
] as const;

export interface WinLossOrgAnalysis {
  organizationId: string;
  analysis: string;
  leadsAnalyzed: number;
}

/**
 * Uma execução completa da varredura — uma análise de IA SEPARADA por organização (nunca leads de
 * organizações diferentes no mesmo prompt). Extraído do processor do `Worker` (mesmo padrão de
 * `runStagnationScan` em `stagnation-scanner.service.ts`) pra ser testável sem precisar instanciar
 * um `Worker`/Redis reais.
 */
export async function runWinLossAnalysis(): Promise<WinLossOrgAnalysis[]> {
  logger.info('Iniciando job de Win/Loss Analysis (IA)');

  // Pega leads fechados nos últimos 7 dias
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Bug real corrigido aqui (achado do Piloto de Win/Loss Analysis): a versão anterior fazia
  // uma única query sem `organizationId`, misturando leads de TODAS as organizações no mesmo
  // prompt de IA — vazamento cross-tenant real. Mesmo padrão de correção já usado em
  // `stagnation-scanner.service.ts`: lista as organizações (não é tenant-scoped em si) e roda
  // uma análise SEPARADA por organização, dentro do contexto de tenant correto
  // (`requestContext.run`), igual ao caminho manual já faz via `req.user.organizationId`.
  //
  // Segundo achado real, de finalização (2026-09-04): a descoberta de organizações em si
  // (`prisma.organization.findMany`) ficou sem NENHUM contexto de RLS — `Organization` também
  // está sob `FORCE ROW LEVEL SECURITY` (migration 20260722020322_enable_rls), então sem
  // `app.current_tenant_id`/`app.bypass_rls` a policy nega a leitura por completo. Confirmado
  // empiricamente contra o Postgres real deste worktree: esta chamada devolvia 0 organizações
  // mesmo havendo organizações reais no banco — o `for` abaixo nunca executava em produção, e o
  // job "concluía com sucesso" sem processar nenhum lead, sem nenhum erro. `Organization` está no
  // allowlist de bypass (BYPASS_RLS_ALLOWED_MODELS, src/lib/prisma.ts) exatamente para esta
  // descoberta inicial — mesmo padrão já usado corretamente por
  // `accountIntelligenceInsights.worker.ts`/`agentMemoryCleanup.worker.ts`/
  // `bitrixExtractionPurge.worker.ts`/`newsMonitor.worker.ts`.
  const organizations = await requestContext.run({ bypassRls: true }, () =>
    prisma.organization.findMany({ select: { id: true } }),
  );
  const analyses: WinLossOrgAnalysis[] = [];

  for (const { id: organizationId } of organizations) {
    await requestContext.run({ tenantId: organizationId }, async () => {
      const leads = await prisma.lead.findMany({
        where: {
          organizationId,
          status: { in: [...WIN_LOSS_STATUSES] },
          updatedAt: { gte: sevenDaysAgo },
        },
        include: {
          whatsAppMessages: {
            select: { body: true, direction: true },
            take: 20,
          },
          timeline: {
            select: { description: true },
            take: 10,
          },
        },
        take: 30,
      });

      if (leads.length === 0) return;

      const dataStr = leads
        .map((l) => {
          const msgs = l.whatsAppMessages
            .map((m) => `${m.direction}: ${m.body || '(sem texto)'}`)
            .join(' | ');
          const tl = l.timeline.map((t) => t.description).join(' | ');
          return `Lead ID: ${l.id} | Status: ${l.status}\nInterações: ${msgs || 'Sem mensagens'}\nTimeline: ${tl || 'Sem timeline'}\n---`;
        })
        .join('\n');

      try {
        const model = getAiModel('local-llama3-fast', 0.3, 'win-loss-analysis');
        const response = await model.invoke([
          new SystemMessage(
            'Você é um analista comercial de alto nível. Leia as transcrições e timelines dos leads Fechados (Ganhos vs Perdidos) desta semana. Extraia padrões: o que os leads que compraram têm em comum? Quais foram as objeções principais dos que não compraram? Resuma em 3 tópicos práticos.',
          ),
          new HumanMessage(`Dados da Semana:\n\n${dataStr}`),
        ]);

        const analysisText =
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);
        logger.info(
          { organizationId, leadsAnalyzed: leads.length },
          'Win/Loss Analysis concluída para a organização',
        );
        analyses.push({ organizationId, analysis: analysisText, leadsAnalyzed: leads.length });
      } catch (err) {
        logger.error({ err, organizationId }, 'Falha na análise Win/Loss com IA');
      }
    });
  }

  if (analyses.length === 0) {
    logger.info('Sem leads suficientes para Win/Loss analysis em nenhuma organização.');
  }

  return analyses;
}

export function createWinLossAnalysisWorker() {
  const worker = new Worker(
    WIN_LOSS_QUEUE_NAME,
    async () => {
      const analyses = await runWinLossAnalysis();
      return { analyses };
    },
    {
      connection: connection as any,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Win/Loss worker job falhou');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: WIN_LOSS_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

  worker.on('error', (err) => {
    logger.warn({ err }, 'WinLoss worker error suppressed (Redis offline)');
  });

  return worker;
}

export async function scheduleWinLossAnalysisJob() {
  const queue = new Queue(WIN_LOSS_QUEUE_NAME, {
    connection: connection as any,
  });

  // Roda toda sexta às 19:00.
  // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
  // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
  await queue.upsertJobScheduler(
    'weekly-win-loss',
    { pattern: '0 19 * * 5' },
    {
      name: 'weekly-win-loss',
      data: {},
    },
  );

  logger.info('Win/Loss Analysis job scheduled (cron: 0 19 * * 5)');
}
