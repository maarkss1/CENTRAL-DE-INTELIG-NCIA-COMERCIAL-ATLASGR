import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export const EXEC_SUMMARY_QUEUE_NAME = 'daily-executive-summary-queue';

export interface ExecutiveSummaryOrgResult {
  organizationId: string;
  summary: string;
}

/**
 * Uma execução completa do job — um resumo executivo SEPARADO por organização (nunca leads de
 * organizações diferentes no mesmo prompt de IA). Extraído do processor do `Worker` (mesmo padrão
 * de `runWinLossAnalysis`/`runStagnationScan`) pra ser testável sem precisar instanciar um
 * `Worker`/Redis reais.
 *
 * Achado real de finalização (2026-09-04), duplo:
 * 1. `prisma.lead.findMany` rodava sem NENHUM contexto de RLS, sem filtro de `organizationId` —
 *    mesmo problema já corrigido em `winLossAnalysis.worker.ts` (leads de todas as organizações
 *    misturados no mesmo prompt de IA — vazamento cross-tenant real, não só um bug de dado
 *    vazio).
 * 2. Por `Lead` estar sob `FORCE ROW LEVEL SECURITY` sem contexto, essa mesma query devolvia
 *    SEMPRE 0 linhas em produção — o resumo executivo nunca via nenhuma movimentação real, mesmo
 *    em dias com dezenas de leads atualizados, sem nenhum erro (`logger.info('Sem
 *    movimentações...')` sempre disparava). Corrigido com o mesmo padrão já usado em
 *    `winLossAnalysis.worker.ts`: descobre as organizações via bypass (`Organization` está no
 *    allowlist, `BYPASS_RLS_ALLOWED_MODELS` em src/lib/prisma.ts) e roda uma análise por
 *    organização dentro do tenant real (`requestContext.run({ tenantId })`).
 */
export async function runDailyExecutiveSummaryJob(): Promise<ExecutiveSummaryOrgResult[]> {
  logger.info('Iniciando job de resumo executivo diário (IA)');
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const organizations = await requestContext.run({ bypassRls: true }, () =>
    prisma.organization.findMany({ select: { id: true } }),
  );

  const results: ExecutiveSummaryOrgResult[] = [];

  for (const { id: organizationId } of organizations) {
    await requestContext.run({ tenantId: organizationId }, async () => {
      const leadsToday = await prisma.lead.findMany({
        where: {
          organizationId,
          updatedAt: { gte: startOfDay },
        },
        select: {
          id: true,
          status: true,
          title: true,
          score: true,
          temperature: true,
        },
      });

      if (leadsToday.length === 0) {
        results.push({ organizationId, summary: 'Sem movimentações.' });
        return;
      }

      const ganhos = leadsToday.filter((l) => l.status === 'Convertido_em_Oportunidade').length;
      const perdidos = leadsToday.filter((l) => l.status === 'Lead_Desqualificado').length;
      const novos = leadsToday.filter((l) => l.status === 'Lead_Recebido').length;

      const reportData = `Total de leads atualizados: ${leadsToday.length}
Convertidos em Oportunidade: ${ganhos}
Desqualificados/Perdidos: ${perdidos}
Novos Leads Recebidos: ${novos}

Lista parcial (amostra):
${leadsToday
  .slice(0, 50)
  .map((l) => `- Status: ${l.status}, Score: ${l.score || 'N/A'}`)
  .join('\n')}`;

      try {
        const model = getAiModel('local-llama3-fast', 0.5, 'exec-summary');
        const response = await model.invoke([
          new SystemMessage(
            'Você é um Diretor de Vendas B2B experiente. Leia os dados de movimentação do CRM de hoje e escreva um resumo executivo de 2 parágrafos, em português, destacando os resultados. Seja direto e inspirador.',
          ),
          new HumanMessage(`Dados de Hoje:\n\n${reportData}`),
        ]);

        const summaryText =
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);
        logger.info({ organizationId, summaryText }, 'Resumo Executivo Gerado com Sucesso');

        // Aqui poderíamos salvar em uma tabela `ExecutiveReport` ou enviar por e-mail (usando Nodemailer).
        // Para efeitos de integração (Passo 56), o texto gerado já é suficiente.
        results.push({ organizationId, summary: summaryText });
      } catch (err) {
        logger.error({ err, organizationId }, 'Falha ao gerar resumo executivo com IA');
        throw err;
      }
    });
  }

  return results;
}

export function createExecutiveSummaryWorker() {
  const worker = new Worker(
    EXEC_SUMMARY_QUEUE_NAME,
    async () => {
      const results = await runDailyExecutiveSummaryJob();
      return { organizationsProcessed: results.length };
    },
    {
      connection: connection as any,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Executive summary worker job falhou');
    if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
    void recordDeadLetter({
      queue: EXEC_SUMMARY_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      error: err,
    });
  });

  worker.on('error', (err) => {
    logger.warn({ err }, 'ExecutiveSummary worker error suppressed (Redis offline)');
  });

  return worker;
}

export async function scheduleExecutiveSummaryJob() {
  const queue = new Queue(EXEC_SUMMARY_QUEUE_NAME, {
    connection: connection as any,
  });

  // Roda todo dia as 18:00.
  // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
  // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
  await queue.upsertJobScheduler(
    'daily-executive-summary',
    { pattern: '0 18 * * *' },
    {
      name: 'daily-summary',
      data: {},
    },
  );

  logger.info('Executive summary job scheduled (cron: 0 18 * * *)');
}
