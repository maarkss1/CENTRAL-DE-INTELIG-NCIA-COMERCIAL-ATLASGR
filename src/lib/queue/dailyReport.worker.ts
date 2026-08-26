import { Worker } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { getAiModel } from '../ai/gateway.js';
import { HumanMessage } from '@langchain/core/messages';

export const dailyReportWorker = new Worker(
    'daily-report',
    async (job) => {
        logger.info(`Gerando relatório diário para organizationId: ${job.data.organizationId}`);
        try {
            const model = getAiModel('groq-llama3-70b');
            const prompt = `Gere um pequeno resumo inspirador e analítico para um diretor de vendas sobre o dia de ontem.`;
            const result = await model.invoke([new HumanMessage(prompt)]);
            
            logger.info(`Resumo gerado: ${result.content}`);
            logger.info(`Simulando envio de e-mail para diretores...`);

            return { success: true, report: result.content };
        } catch (error) {
            logger.error({ error }, 'Falha ao gerar relatório diário');
            throw error;
        }
    },
    {
        connection,
        concurrency: 1, // um por vez para não sobrecarregar API
    }
);

dailyReportWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'dailyReportWorker job falhou');
});
