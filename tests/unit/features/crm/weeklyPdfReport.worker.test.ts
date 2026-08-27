import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Auditoria de tenancy (Onda 2, Agente 04): antes desta correção, o job semanal de vendas
 * (`weeklyPdfReport.worker.ts`) processava só a PRIMEIRA organização encontrada por
 * `prisma.lead.findFirst` (sem nenhum `requestContext.run`, então na prática nem essa era
 * encontrada de verdade sob RLS real — ver o comentário completo no arquivo fonte) e devolvia
 * `status: 'success'` mesmo sem enviar nada a ninguém (PDF "stub" nunca implementado). Este teste
 * prova, com Prisma/mailer mockados (sem depender de Postgres real), que a versão corrigida:
 * (1) descobre TODA organização com lead, não só a primeira;
 * (2) roda o trabalho de cada organização dentro do tenant correto (`requestContext`);
 * (3) só reporta "sent" quando um e-mail real foi de fato enviado a um destinatário real.
 */

vi.mock('../../../../src/lib/queue/redis.js', () => ({ connection: {} }));

const leadFindMany = vi.fn();
const userFindMany = vi.fn();
vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
        user: { findMany: (...args: unknown[]) => userFindMany(...args) },
    },
}));

const dashboardMock = vi.fn();
vi.mock('../../../../src/features/analytics/analytics.service.js', () => ({
    analyticsService: { dashboard: (...args: unknown[]) => dashboardMock(...args) },
}));

const sendEmailMock = vi.fn();
vi.mock('../../../../src/lib/email/mailer.js', () => ({
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock('../../../../src/config/env.js', () => ({
    env: { SMTP_HOST: 'smtp.test.local' },
}));

import { requestContext } from '../../../../src/lib/async-context';
import { runWeeklySalesReportJob } from '../../../../src/features/crm/jobs/weeklyPdfReport.worker';

const FAKE_DASHBOARD = {
    overview: { totalLeads: 3, closedThisMonth: 1, lostThisMonth: 0, conversionRate: 33.3 },
    tmqMetric: null,
    performanceReport: [{ agent: 'user-1', isAi: false, leadsAssigned: 3, leadsQualified: 2, conversionRate: 66.6 }],
};

beforeEach(() => {
    vi.clearAllMocks();
    dashboardMock.mockResolvedValue(FAKE_DASHBOARD);
    sendEmailMock.mockResolvedValue({ messageId: 'msg-1' });
});

describe('runWeeklySalesReportJob — sem SMTP configurado', () => {
    it('não tenta descobrir organizações nem enviar nada; reporta o motivo explicitamente', async () => {
        vi.resetModules();
        vi.doMock('../../../../src/config/env.js', () => ({ env: { SMTP_HOST: undefined } }));
        const { runWeeklySalesReportJob: run } = await import('../../../../src/features/crm/jobs/weeklyPdfReport.worker');

        const result = await run();

        expect(result).toEqual({ status: 'skipped_mailer_not_configured' });
        expect(leadFindMany).not.toHaveBeenCalled();
        expect(sendEmailMock).not.toHaveBeenCalled();
    });
});

describe('runWeeklySalesReportJob — descoberta cross-tenant', () => {
    it('processa TODA organização com lead, não só a primeira (bug corrigido)', async () => {
        leadFindMany.mockResolvedValue([
            { organizationId: 'org-a' },
            { organizationId: 'org-a' }, // duplicata real (leads diferentes, mesma org) — dedupe esperado
            { organizationId: 'org-b' },
        ]);
        userFindMany.mockResolvedValue([{ email: 'gestor@org.com' }]);

        const result = await runWeeklySalesReportJob();

        expect(result.status).toBe('completed');
        if (result.status !== 'completed') throw new Error('unreachable');
        const orgIds = result.results.map((r) => r.organizationId).sort();
        expect(orgIds).toEqual(['org-a', 'org-b']);
        expect(sendEmailMock).toHaveBeenCalledTimes(2);
    });

    it('a descoberta cross-tenant roda com bypass, e o trabalho por organização roda com o tenant real (nunca bypass)', async () => {
        leadFindMany.mockImplementation(async () => {
            expect(requestContext.getStore()?.bypassRls).toBe(true);
            return [{ organizationId: 'org-a' }];
        });
        userFindMany.mockImplementation(async () => {
            expect(requestContext.getStore()?.tenantId).toBe('org-a');
            expect(requestContext.getStore()?.bypassRls).toBeUndefined();
            return [{ email: 'gestor@org-a.com' }];
        });
        dashboardMock.mockImplementation(async (organizationId: string) => {
            expect(requestContext.getStore()?.tenantId).toBe(organizationId);
            return FAKE_DASHBOARD;
        });

        const result = await runWeeklySalesReportJob();

        expect(result.status).toBe('completed');
        expect(sendEmailMock).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'gestor@org-a.com', subject: 'Relatório Semanal de Vendas' })
        );
    });

    it('organização sem nenhum ADMIN/GESTOR real não recebe e-mail nenhum (nunca um destinatário inventado)', async () => {
        leadFindMany.mockResolvedValue([{ organizationId: 'org-sem-gestor' }]);
        userFindMany.mockResolvedValue([]);

        const result = await runWeeklySalesReportJob();

        expect(result.status).toBe('completed');
        if (result.status !== 'completed') throw new Error('unreachable');
        expect(result.results).toEqual([{ organizationId: 'org-sem-gestor', status: 'skipped_no_recipients' }]);
        expect(sendEmailMock).not.toHaveBeenCalled();
        expect(dashboardMock).not.toHaveBeenCalled();
    });

    it('nenhuma organização com lead: reporta o estado real, não um "success" vazio', async () => {
        leadFindMany.mockResolvedValue([]);

        const result = await runWeeklySalesReportJob();

        expect(result).toEqual({ status: 'no_organizations_with_leads' });
    });

    it('falha ao enviar para um destinatário não derruba o job inteiro nem inventa sucesso para essa organização', async () => {
        leadFindMany.mockResolvedValue([{ organizationId: 'org-a' }]);
        userFindMany.mockResolvedValue([{ email: 'gestor@org-a.com' }]);
        sendEmailMock.mockRejectedValue(new Error('SMTP fora do ar'));

        const result = await runWeeklySalesReportJob();

        expect(result.status).toBe('completed');
        if (result.status !== 'completed') throw new Error('unreachable');
        expect(result.results).toEqual([{ organizationId: 'org-a', status: 'failed', recipients: 0 }]);
    });
});
