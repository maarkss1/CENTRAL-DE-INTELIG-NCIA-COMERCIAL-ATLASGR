import { Worker, Queue } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { requestContext } from '../../../lib/async-context.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import { analyticsService } from '../../analytics/analytics.service.js';
import { sendEmail } from '../../../lib/email/mailer.js';
import { env } from '../../../config/env.js';
import { COMMERCIAL_INTELLIGENCE_ROLES } from '../../../lib/auth/authorization.js';

export const WEEKLY_PDF_QUEUE_NAME = 'weekly-pdf-report-queue';

/** Corpo em texto simples do relatório semanal — dado real de `analyticsService.dashboard`, nunca fabricado. */
async function buildWeeklyReportText(organizationId: string): Promise<string> {
    const dashData = await analyticsService.dashboard(organizationId, 1); // Último mês

    const lines = [
        'Relatório Semanal de Vendas',
        '',
        'Visão Geral',
        `- Novos Leads: ${dashData.overview.totalLeads}`,
        `- Convertidos: ${dashData.overview.closedThisMonth}`,
        `- Perdidos: ${dashData.overview.lostThisMonth}`,
        `- Taxa de Conversão: ${dashData.overview.conversionRate.toFixed(2)}%`,
        `- TMQ (Dias): ${dashData.tmqMetric != null ? dashData.tmqMetric.toFixed(2) : 'Não disponível'}`,
        '',
        'Performance de Agentes',
        ...dashData.performanceReport
            .slice(0, 5)
            .map((a) => `- ${a.agent} (${a.isAi ? 'IA' : 'Humano'}): ${a.leadsQualified} Qualificados`),
    ];

    return lines.join('\n');
}

export interface WeeklySalesReportOrgResult {
    organizationId: string;
    status: 'sent' | 'failed' | 'skipped_no_recipients';
    recipients?: number;
}

export type WeeklySalesReportResult =
    | { status: 'skipped_mailer_not_configured' }
    | { status: 'no_organizations_with_leads' }
    | { status: 'completed'; results: WeeklySalesReportOrgResult[] };

/**
 * Corpo do job, exportado à parte do worker BullMQ (mesmo padrão de `runDailyFollowUpScan` em
 * `followUp.worker.ts`) para permitir teste direto sem depender do agendador nem de um Postgres
 * real com RLS.
 */
export async function runWeeklySalesReportJob(): Promise<WeeklySalesReportResult> {
    logger.info('Iniciando job de relatorio semanal de vendas (todas as organizações com leads)');

    // Sem SMTP configurado, o mailer fica inerte (`MailerNotConfiguredError`) — melhor
    // registrar isso uma vez e parar do que deixar cada tentativa de envio falhar
    // silenciosamente por destinatário.
    if (!env.SMTP_HOST) {
        logger.warn('Relatório semanal de vendas não enviado: SMTP_HOST não configurado (mailer inerte)');
        return { status: 'skipped_mailer_not_configured' };
    }

    // CORRIGIDO (Onda 2, Agente 04): a versão anterior pegava só a PRIMEIRA organização que
    // possuía qualquer lead (`prisma.lead.findFirst`) e ignorava silenciosamente todas as
    // outras — "Em uma arquitetura multitenant real, faríamos um loop por todas as orgs
    // ativas. Para simplificar, vamos pegar a primeira org". Em produção multitenant real,
    // isso significa que nenhum tenant além desse jamais recebia o relatório, toda sexta,
    // indefinidamente, sem nenhum sinal de erro. Pior: essa consulta nem sequer usava
    // `requestContext.run` — com `Lead` sob FORCE ROW LEVEL SECURITY, sem tenant/bypass
    // conhecido a policy de RLS não libera NENHUMA linha (mesma classe de bug documentada em
    // `followUp.worker.ts`), então nem essa primeira organização era encontrada de verdade; o
    // job sempre caía no early-return `Sem leads/org para relatorio`. Descoberta cross-tenant
    // via bypass (só liberado para `Lead`/`User`, ver BYPASS_RLS_ALLOWED_MODELS em
    // `src/lib/prisma.ts`); tudo que segue, uma vez conhecido o tenant, roda com RLS real de
    // tenant (`requestContext.run({ tenantId })`), nunca com bypass.
    const orgRows = await requestContext.run({ bypassRls: true }, () => prisma.lead.findMany({
        distinct: ['organizationId'],
        select: { organizationId: true },
    }));
    // `Lead.organizationId` é opcional no schema (registro legado/importação sem organização
    // resolvida) — nunca processa relatório para um tenant `null`.
    const orgIds = [...new Set(orgRows.map((row) => row.organizationId).filter((id): id is string => id != null))];

    if (orgIds.length === 0) {
        return { status: 'no_organizations_with_leads' };
    }

    const results: WeeklySalesReportOrgResult[] = [];

    for (const organizationId of orgIds) {
        try {
            await requestContext.run({ tenantId: organizationId }, async () => {
                // Mesmos papéis autorizados a ver dado financeiro consolidado do módulo
                // Comercial Inteligente (ADMIN/GESTOR, ver COMMERCIAL_INTELLIGENCE_ROLES) —
                // destinatário real do sistema, nunca um e-mail hardcoded tipo
                // "diretoria@empresa.com".
                const recipients = await prisma.user.findMany({
                    where: { organizationId, role: { in: COMMERCIAL_INTELLIGENCE_ROLES as unknown as never[] } },
                    select: { email: true },
                });

                if (recipients.length === 0) {
                    results.push({ organizationId, status: 'skipped_no_recipients' });
                    return;
                }

                const text = await buildWeeklyReportText(organizationId);

                let sent = 0;
                for (const recipient of recipients) {
                    try {
                        await sendEmail({ to: recipient.email, subject: 'Relatório Semanal de Vendas', text });
                        sent++;
                    } catch (err) {
                        logger.error({ err, organizationId, to: recipient.email }, 'Falha ao enviar relatório semanal para um destinatário');
                    }
                }
                results.push({ organizationId, status: sent > 0 ? 'sent' : 'failed', recipients: sent });
            });
        } catch (err) {
            logger.error({ err, organizationId }, 'Falha ao gerar/enviar relatorio semanal desta organização');
            results.push({ organizationId, status: 'failed' });
        }
    }

    logger.info({ results }, 'Relatório Semanal de Vendas processado (por organização)');
    return { status: 'completed', results };
}

export function createWeeklyPdfReportWorker() {
    const worker = new Worker(WEEKLY_PDF_QUEUE_NAME, async () => runWeeklySalesReportJob(), {
        connection: connection as any,
        concurrency: 1
    });

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Weekly sales report worker job falhou');
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({
            queue: WEEKLY_PDF_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            attemptsMade: job.attemptsMade,
            error: err,
        });
    });

    worker.on('error', (err) => {
        logger.warn({ message: err.message }, 'WeeklyReport worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleWeeklyPdfReportJob() {
    const queue = new Queue(WEEKLY_PDF_QUEUE_NAME, {
        connection: connection as any
    });

    // Roda sexta-feira 20:00 (0 20 * * 5).
    // BullMQ v6 removeu `repeat` de `Queue.add` (viraria um job avulso, nunca mais se repete) —
    // agendamento recorrente agora exige `upsertJobScheduler`, idempotente pelo id abaixo.
    await queue.upsertJobScheduler('weekly-pdf-report', { pattern: '0 20 * * 5' }, {
        name: 'weekly-sales-report',
        data: {},
    });

    logger.info('Weekly Sales Report job scheduled (cron: 0 20 * * 5)');
}
