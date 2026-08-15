/**
 * Exercita o caminho completo do motor de automações: regra buscada, filtrada, executada,
 * efeito colateral aplicado, telemetria agregada atualizada e execução persistida no AuditLog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        automation: { findMany: vi.fn(), update: vi.fn() },
        notification: { create: vi.fn() },
        activity: { create: vi.fn() },
        auditLog: { create: vi.fn() },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const sendEmailMock = vi.fn();
class MailerNotConfiguredErrorMock extends Error {}
vi.mock('@/lib/email/mailer', () => ({
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
    MailerNotConfiguredError: MailerNotConfiguredErrorMock,
}));

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requestContext } from '@/lib/async-context';
import { automationEngine, type AutomationEvent } from '@/features/automations/automation.engine';

const automationMock = prisma.automation as unknown as {
    findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>;
};
const notificationMock = prisma.notification as unknown as { create: ReturnType<typeof vi.fn> };
const activityMock = prisma.activity as unknown as { create: ReturnType<typeof vi.fn> };
const auditLogMock = prisma.auditLog as unknown as { create: ReturnType<typeof vi.fn> };

const ORG = 'org-1';

const eventoLead: AutomationEvent = {
    organizationId: ORG,
    trigger: 'Lead mudou de status',
    entity: 'Lead',
    entityId: 'lead-9',
    data: { status: 'Proposta', owner: 'Marcelo', temperature: 'Quente' },
};

function regra(over: Record<string, unknown> = {}) {
    return {
        id: 'auto-1',
        name: 'Avisar em Proposta',
        action: 'Notificar equipe',
        actionConfig: {},
        conditions: null,
        ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    automationMock.update.mockResolvedValue({});
    notificationMock.create.mockResolvedValue({ id: 'notif-1' });
    activityMock.create.mockResolvedValue({ id: 'act-1' });
    auditLogMock.create.mockResolvedValue({ id: 'audit-1' });
    sendEmailMock.mockResolvedValue(undefined);
});

describe('AutomationEngine.handle — execução real', () => {
    it('busca apenas regras ativas do tenant e do gatilho do evento', async () => {
        automationMock.findMany.mockResolvedValue([]);
        await automationEngine.handle(eventoLead);

        expect(automationMock.findMany).toHaveBeenCalledWith({
            where: { organizationId: ORG, enabled: true, trigger: 'Lead_Mudou_Status' },
        });
    });

    it('cria a notificação com título renderizado e vínculo com a entidade de origem', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ actionConfig: { title: 'Lead em {{status}}', body: 'Dono: {{owner}}', kind: 'Alerta' } }),
        ]);

        const executadas = await automationEngine.handle(eventoLead);

        expect(executadas).toBe(1);
        expect(notificationMock.create).toHaveBeenCalledTimes(1);
        const { data } = notificationMock.create.mock.calls[0][0];
        expect(data.title).toBe('Lead em Proposta');
        expect(data.body).toBe('Dono: Marcelo');
        expect(data.kind).toBe('Alerta');
        expect(data.entity).toBe('Lead');
        expect(data.entityId).toBe('lead-9');
        expect(data.automationId).toBe('auto-1');
        expect(data.organizationId).toBe(ORG);
    });

    it('usa o nome da regra como título quando o config não traz um', async () => {
        automationMock.findMany.mockResolvedValue([regra({ actionConfig: {} })]);
        await automationEngine.handle(eventoLead);
        expect(notificationMock.create.mock.calls[0][0].data.title).toBe('Avisar em Proposta');
    });

    it('agenda a atividade no prazo configurado, vinculada ao lead', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ action: 'Criar atividade', actionConfig: { dueInDays: 3, type: 'Follow_up' } }),
        ]);

        await automationEngine.handle(eventoLead);

        expect(activityMock.create).toHaveBeenCalledTimes(1);
        const { data } = activityMock.create.mock.calls[0][0];
        expect(data.leadId).toBe('lead-9');
        expect(data.organizationId).toBe(ORG);
        expect(data.status).toBe('Pendente');
        expect(data.owner).toBe('Marcelo');

        const dias = Math.round((data.date.getTime() - Date.now()) / 86_400_000);
        expect(dias).toBe(3);
    });

    it('registra a execução: soma o contador, carimba a data e persiste status success', async () => {
        automationMock.findMany.mockResolvedValue([regra()]);
        await automationEngine.handle(eventoLead);

        expect(automationMock.update).toHaveBeenCalledTimes(1);
        const call = automationMock.update.mock.calls[0][0];
        expect(call.where).toEqual({ id: 'auto-1' });
        expect(call.data.runCount).toEqual({ increment: 1 });
        expect(call.data.lastRunAt).toBeInstanceOf(Date);

        expect(auditLogMock.create).toHaveBeenCalledTimes(1);
        const audit = auditLogMock.create.mock.calls[0][0].data;
        expect(audit.action).toBe('AUTOMATION_EXECUTION');
        expect(audit.entity).toBe('Automation');
        expect(audit.entityId).toBe('auto-1');
        expect(audit.tenantId).toBe(ORG);
        const details = JSON.parse(audit.details);
        expect(details.status).toBe('success');
        expect(details.trigger).toBe('Lead mudou de status');
        expect(details.entityId).toBe('lead-9');
        expect(details.correlationId).toEqual(expect.any(String));
        expect(details.startedAt).toEqual(expect.any(String));
        expect(details.finishedAt).toEqual(expect.any(String));
    });

    it('pula a regra cuja condição não casa, sem executar nem contar', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ conditions: { status: 'Negociação' } }),
        ]);

        const executadas = await automationEngine.handle(eventoLead);

        expect(executadas).toBe(0);
        expect(notificationMock.create).not.toHaveBeenCalled();
        expect(automationMock.update).not.toHaveBeenCalled();
        expect(auditLogMock.create).not.toHaveBeenCalled();
    });

    it('executa a regra cuja condição casa', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ conditions: { status: 'Proposta', temperature: 'Quente' } }),
        ]);
        expect(await automationEngine.handle(eventoLead)).toBe(1);
    });

    it('uma regra que falha não impede as demais e a falha fica persistida', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ id: 'quebrada', action: 'Ação inexistente' }),
            regra({ id: 'boa' }),
        ]);

        const executadas = await automationEngine.handle(eventoLead);

        expect(executadas).toBe(1);
        expect(notificationMock.create).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalled();
        expect(auditLogMock.create).toHaveBeenCalledTimes(2);

        const failure = auditLogMock.create.mock.calls
            .map((call) => call[0].data)
            .find((data) => data.entityId === 'quebrada');
        expect(failure).toBeTruthy();
        const details = JSON.parse(failure.details);
        expect(details.status).toBe('failed');
        expect(details.error).toContain('Ação desconhecida');
        expect(details.correlationId).toEqual(expect.any(String));
    });

    it('recusa "Criar atividade" em evento de atividade sem lead vinculado, sem derrubar o motor', async () => {
        automationMock.findMany.mockResolvedValue([regra({ action: 'Criar atividade' })]);

        const executadas = await automationEngine.handle({
            organizationId: ORG,
            trigger: 'Atividade concluída',
            entity: 'Activity',
            entityId: 'act-7',
            data: { type: 'Reunião' },
        });

        expect(executadas).toBe(0);
        expect(activityMock.create).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
        const details = JSON.parse(auditLogMock.create.mock.calls[0][0].data.details);
        expect(details.status).toBe('failed');
    });

    it('cria "Criar atividade" a partir de atividade concluída, usando o leadId do evento', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ action: 'Criar atividade', actionConfig: { dueInDays: 2, type: 'Follow_up' } }),
        ]);

        const executadas = await automationEngine.handle({
            organizationId: ORG,
            trigger: 'Atividade concluída',
            entity: 'Activity',
            entityId: 'act-7',
            data: { type: 'Reunião', owner: 'Marcelo', leadId: 'lead-42' },
        });

        expect(executadas).toBe(1);
        expect(activityMock.create).toHaveBeenCalledTimes(1);
        const { data } = activityMock.create.mock.calls[0][0];
        expect(data.leadId).toBe('lead-42');
        expect(data.organizationId).toBe(ORG);
        expect(data.owner).toBe('Marcelo');
    });

    it('cria contexto RLS a partir do tenant do evento quando chamado por worker sem contexto', async () => {
        automationMock.findMany.mockImplementation(async () => {
            expect(requestContext.getStore()?.tenantId).toBe(ORG);
            return [];
        });

        await expect(automationEngine.handle(eventoLead)).resolves.toBe(0);
    });

    it('recusa evento cross-tenant quando já existe contexto autenticado de outro tenant', async () => {
        await requestContext.run({ tenantId: 'org-outra' }, async () => {
            await expect(automationEngine.handle(eventoLead)).resolves.toBe(0);
        });

        expect(automationMock.findMany).not.toHaveBeenCalled();
        expect(auditLogMock.create).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
    });

    it('falha de persistência do histórico não desfaz uma ação já concluída', async () => {
        automationMock.findMany.mockResolvedValue([regra()]);
        auditLogMock.create.mockRejectedValue(new Error('audit indisponível'));

        await expect(automationEngine.handle(eventoLead)).resolves.toBe(1);
        expect(notificationMock.create).toHaveBeenCalledTimes(1);
        expect(automationMock.update).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalled();
    });

    it('não propaga erro quando o banco cai antes de avaliar regras', async () => {
        automationMock.findMany.mockRejectedValue(new Error('banco fora do ar'));

        await expect(automationEngine.handle(eventoLead)).resolves.toBe(0);
        expect(logger.error).toHaveBeenCalled();
    });

    it('não propaga erro quando a própria notificação falha', async () => {
        automationMock.findMany.mockResolvedValue([regra()]);
        notificationMock.create.mockRejectedValue(new Error('sem tabela'));

        // O serviço de notificação engole o erro e devolve null, então a regra conta como executada.
        await expect(automationEngine.handle(eventoLead)).resolves.toBe(1);
    });

    it('registra um snapshot sanitizado de event.data no histórico — auditável, base da idempotência do scanner de estagnação', async () => {
        automationMock.findMany.mockResolvedValue([regra()]);
        await automationEngine.handle({
            ...eventoLead,
            data: { ...eventoLead.data, daysSinceLastInteraction: 7, streakKey: '2026-08-01T00:00:00.000Z' },
        });

        const details = JSON.parse(auditLogMock.create.mock.calls[0][0].data.details);
        expect(details.eventData).toEqual(expect.objectContaining({
            status: 'Proposta',
            daysSinceLastInteraction: 7,
            streakKey: '2026-08-01T00:00:00.000Z',
        }));
    });

    describe('"Notificar equipe" com canal de e-mail (novo, Onda 7)', () => {
        it('canal padrão (ausente/in_app) não envia e-mail nenhum — só a notificação interna, comportamento original preservado', async () => {
            automationMock.findMany.mockResolvedValue([regra({ actionConfig: { title: 'Aviso' } })]);
            await automationEngine.handle(eventoLead);

            expect(notificationMock.create).toHaveBeenCalledTimes(1);
            expect(sendEmailMock).not.toHaveBeenCalled();
        });

        it('canal email: cria a notificação interna E envia o e-mail, com template renderizado', async () => {
            automationMock.findMany.mockResolvedValue([
                regra({ actionConfig: { title: 'Lead parado: {{status}}', body: 'Dono: {{owner}}', channel: 'email', to: 'gestor@atlasgr.com.br' } }),
            ]);

            const executadas = await automationEngine.handle(eventoLead);

            expect(executadas).toBe(1);
            expect(notificationMock.create).toHaveBeenCalledTimes(1);
            expect(sendEmailMock).toHaveBeenCalledWith({
                to: 'gestor@atlasgr.com.br',
                subject: 'Lead parado: Proposta',
                text: 'Dono: Marcelo',
            });
        });

        it('canal email sem destinatário: falha com erro claro, sem tentar enviar', async () => {
            automationMock.findMany.mockResolvedValue([
                regra({ actionConfig: { title: 'Aviso', channel: 'email' } }),
            ]);

            const executadas = await automationEngine.handle(eventoLead);

            expect(executadas).toBe(0);
            expect(sendEmailMock).not.toHaveBeenCalled();
            const details = JSON.parse(auditLogMock.create.mock.calls[0][0].data.details);
            expect(details.status).toBe('failed');
            expect(details.error).toContain('destinatário');
        });

        it('SMTP não configurado: notificação interna já criada continua de pé, e o histórico explica a causa sem fingir sucesso total', async () => {
            automationMock.findMany.mockResolvedValue([
                regra({ actionConfig: { title: 'Aviso', channel: 'email', to: 'gestor@atlasgr.com.br' } }),
            ]);
            sendEmailMock.mockRejectedValue(new MailerNotConfiguredErrorMock('SMTP_HOST ausente'));

            const executadas = await automationEngine.handle(eventoLead);

            expect(executadas).toBe(0);
            expect(notificationMock.create).toHaveBeenCalledTimes(1); // já tinha acontecido antes da falha do e-mail
            const details = JSON.parse(auditLogMock.create.mock.calls[0][0].data.details);
            expect(details.status).toBe('failed');
            expect(details.error).toContain('não configurado');
        });
    });
});
