import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { analyticsService } from '../../analytics/analytics.service.js';

export const WEEKLY_PDF_QUEUE_NAME = 'weekly-pdf-report-queue';

export function createWeeklyPdfReportWorker() {
    const worker = new Worker(WEEKLY_PDF_QUEUE_NAME, async (job) => {
        logger.info('Iniciando job de relatorio semanal PDF para diretoria');
        
        try {
            // Em uma arquitetura multitenant real, faríamos um loop por todas as orgs ativas.
            // Para simplificar, vamos pegar a primeira org que possui leads:
            const firstLead = await prisma.lead.findFirst({ select: { organizationId: true } });
            if (!firstLead || !firstLead.organizationId) {
                return { status: 'Sem leads/org para relatorio' };
            }

            const orgId = firstLead.organizationId;
            const dashData = await analyticsService.dashboard(orgId, 1); // Último mês

            const htmlContent = `
                <html>
                <body>
                    <h1>Relatório Semanal de Vendas</h1>
                    <h2>Visão Geral</h2>
                    <ul>
                        <li>Novos Leads: ${dashData.overview.totalLeads}</li>
                        <li>Convertidos: ${dashData.overview.closedThisMonth}</li>
                        <li>Perdidos: ${dashData.overview.lostThisMonth}</li>
                        <li>Taxa de Conversão: ${dashData.overview.conversionRate.toFixed(2)}%</li>
                        <li>TMQ (Dias): ${dashData.tmqMetric ? dashData.tmqMetric.toFixed(2) : 'N/A'}</li>
                    </ul>
                    <h2>Performance de Agentes</h2>
                    <ul>
                        ${dashData.performanceReport.slice(0, 5).map((a: any) => `<li>${a.agent} (${a.isAi ? 'IA' : 'Humano'}): ${a.leadsQualified} Qualificados</li>`).join('')}
                    </ul>
                </body>
                </html>
            `;

            // Num ambiente de produção, faríamos:
            // const pdfBuffer = await pdfGenerator.generatePdfFromHtml(htmlContent);
            // await mailer.sendPdf(pdfBuffer, 'diretoria@empresa.com');

            logger.info({ 
                htmlPreview: htmlContent.slice(0, 150) + '...'
            }, 'Relatório Semanal PDF gerado (Stub)');

            return { status: 'success', orgId };
        } catch (err) {
            logger.error({ err }, 'Falha na geração do relatorio semanal PDF');
            throw err;
        }
    }, {
        connection: connection as any,
        concurrency: 1
    });

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Weekly PDF worker job falhou');
    });

    worker.on('error', (err) => {
        logger.warn({ message: err.message }, 'WeeklyPdf worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleWeeklyPdfReportJob() {
    const queue = new Queue(WEEKLY_PDF_QUEUE_NAME, {
        connection: connection as any
    });
    
    // Roda sexta-feira 20:00 (0 20 * * 5) — BullMQ 6: Job Scheduler idempotente por id.
    await queue.upsertJobScheduler('weekly-pdf', { pattern: '0 20 * * 5' }, {
        name: 'weekly-pdf'
    });
    
    logger.info('Weekly PDF Report job scheduled (cron: 0 20 * * 5)');
}
