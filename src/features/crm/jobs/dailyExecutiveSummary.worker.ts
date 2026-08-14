import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export const EXEC_SUMMARY_QUEUE_NAME = 'daily-executive-summary-queue';

export function createExecutiveSummaryWorker() {
    const worker = new Worker(EXEC_SUMMARY_QUEUE_NAME, async (job) => {
        logger.info('Iniciando job de resumo executivo diário (IA)');
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Buscar leads criados, ganhos ou perdidos hoje
        const leadsToday = await prisma.lead.findMany({
            where: {
                updatedAt: { gte: startOfDay }
            },
            select: {
                id: true,
                status: true,
                title: true,
                score: true,
                temperature: true
            }
        });

        if (leadsToday.length === 0) {
            logger.info('Sem movimentações hoje para gerar resumo executivo.');
            return { summary: 'Sem movimentações.' };
        }

        const ganhos = leadsToday.filter(l => l.status === 'Convertido_em_Oportunidade').length;
        const perdidos = leadsToday.filter(l => l.status === 'Lead_Desqualificado').length;
        const novos = leadsToday.filter(l => l.status === 'Lead_Recebido').length;

        const reportData = `Total de leads atualizados: ${leadsToday.length}
Convertidos em Oportunidade: ${ganhos}
Desqualificados/Perdidos: ${perdidos}
Novos Leads Recebidos: ${novos}

Lista parcial (amostra):
${leadsToday.slice(0, 50).map(l => `- Status: ${l.status}, Score: ${l.score || 'N/A'}`).join('\n')}`;

        try {
            const model = getAiModel('local-llama3-fast', 0.5, 'exec-summary');
            const response = await model.invoke([
                new SystemMessage('Você é um Diretor de Vendas B2B experiente. Leia os dados de movimentação do CRM de hoje e escreva um resumo executivo de 2 parágrafos, em português, destacando os resultados. Seja direto e inspirador.'),
                new HumanMessage(`Dados de Hoje:\n\n${reportData}`)
            ]);

            const summaryText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
            logger.info({ summaryText }, 'Resumo Executivo Gerado com Sucesso');
            
            // Aqui poderíamos salvar em uma tabela `ExecutiveReport` ou enviar por e-mail (usando Nodemailer).
            // Para efeitos de integração (Passo 56), o texto gerado já é suficiente.
            return { summary: summaryText };
        } catch (err) {
            logger.error({ err }, 'Falha ao gerar resumo executivo com IA');
            throw err;
        }
    }, {
        connection: connection as any,
        concurrency: 1
    });

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Executive summary worker job falhou');
    });

    worker.on('error', (err) => {
        logger.warn({ err }, 'ExecutiveSummary worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleExecutiveSummaryJob() {
    const queue = new Queue(EXEC_SUMMARY_QUEUE_NAME, {
        connection: connection as any
    });
    
    // Roda todo dia as 18:00 — BullMQ 6: Job Scheduler idempotente por id.
    await queue.upsertJobScheduler('daily-summary', { pattern: '0 18 * * *' }, {
        name: 'daily-summary'
    });
    
    logger.info('Executive summary job scheduled (cron: 0 18 * * *)');
}
