import { describe, expect, it, vi, beforeEach } from 'vitest';

const getTenantIdMock = vi.fn<() => string | undefined>();

vi.mock('../../../../lib/async-context.js', () => ({
    getTenantId: () => getTenantIdMock(),
}));

const activityServiceCreateMock = vi.fn();
vi.mock('../../../activities/services/activity.service.js', () => ({
    activityService: { create: (...args: unknown[]) => activityServiceCreateMock(...args) },
}));

const notificationServiceCreateMock = vi.fn();
vi.mock('../../../notifications/notification.service.js', () => ({
    notificationService: { create: (...args: unknown[]) => notificationServiceCreateMock(...args) },
}));

const leadFindFirstMock = vi.fn();
vi.mock('../../../../lib/prisma.js', () => ({
    prisma: { lead: { findFirst: (...args: unknown[]) => leadFindFirstMock(...args) } },
}));

import { createFollowUpTaskTool, notifyTeamTool } from '../opsTools';

describe('createFollowUpTaskTool', () => {
    beforeEach(() => {
        getTenantIdMock.mockReset();
        activityServiceCreateMock.mockReset();
        leadFindFirstMock.mockReset();
    });

    it('recusa a criação sem contexto de organização (evita vazamento entre tenants)', async () => {
        getTenantIdMock.mockReturnValue(undefined);

        const result = await createFollowUpTaskTool.invoke({
            leadId: 'lead-1',
            date: '2026-08-05T14:00:00.000Z',
        });

        expect(result).toContain('contexto de organização ausente');
        expect(activityServiceCreateMock).not.toHaveBeenCalled();
    });

    it('com owner explícito, usa o valor informado sem consultar o Lead', async () => {
        getTenantIdMock.mockReturnValue('org-1');
        activityServiceCreateMock.mockResolvedValue({
            type: 'Follow-up',
            date: new Date('2026-08-05T14:00:00.000Z'),
        });

        const result = await createFollowUpTaskTool.invoke({
            leadId: 'lead-1',
            date: '2026-08-05T14:00:00.000Z',
            owner: 'Maria Souza',
        });

        expect(leadFindFirstMock).not.toHaveBeenCalled();
        expect(activityServiceCreateMock).toHaveBeenCalledWith('org-1', expect.objectContaining({
            leadId: 'lead-1',
            date: '2026-08-05T14:00:00.000Z',
            type: 'Follow-up',
            status: 'Pendente',
            owner: 'Maria Souza',
        }));
        expect(result).toContain('agendada com sucesso');
    });

    it('sem owner explícito, resolve o responsável real a partir do Lead.owner do próprio lead', async () => {
        getTenantIdMock.mockReturnValue('org-1');
        leadFindFirstMock.mockResolvedValue({ owner: 'João Pereira' });
        activityServiceCreateMock.mockResolvedValue({
            type: 'Follow-up',
            date: new Date('2026-08-05T14:00:00.000Z'),
        });

        const result = await createFollowUpTaskTool.invoke({
            leadId: 'lead-1',
            date: '2026-08-05T14:00:00.000Z',
        });

        expect(leadFindFirstMock).toHaveBeenCalledWith({
            where: { id: 'lead-1', organizationId: 'org-1' },
            select: { owner: true },
        });
        expect(activityServiceCreateMock).toHaveBeenCalledWith('org-1', expect.objectContaining({
            leadId: 'lead-1',
            date: '2026-08-05T14:00:00.000Z',
            type: 'Follow-up',
            status: 'Pendente',
            owner: 'João Pereira',
        }));
        expect(result).toContain('agendada com sucesso');
    });

    it('sem owner explícito e lead sem responsável, pede o responsável em vez de fabricar um nome', async () => {
        getTenantIdMock.mockReturnValue('org-1');
        leadFindFirstMock.mockResolvedValue({ owner: null });

        const result = await createFollowUpTaskTool.invoke({
            leadId: 'lead-1',
            date: '2026-08-05T14:00:00.000Z',
        });

        expect(activityServiceCreateMock).not.toHaveBeenCalled();
        expect(result).not.toContain('Enxame de IA');
        expect(result).toContain('não tem um responsável definido');
    });

    it('sem owner explícito e lead inexistente, devolve erro claro em vez de tentar criar a atividade', async () => {
        getTenantIdMock.mockReturnValue('org-1');
        leadFindFirstMock.mockResolvedValue(null);

        const result = await createFollowUpTaskTool.invoke({
            leadId: 'lead-inexistente',
            date: '2026-08-05T14:00:00.000Z',
        });

        expect(activityServiceCreateMock).not.toHaveBeenCalled();
        expect(result).toContain('não encontrado no CRM');
    });

    it('devolve mensagem de erro (não lança) quando a criação falha', async () => {
        getTenantIdMock.mockReturnValue('org-1');
        activityServiceCreateMock.mockRejectedValue(new Error('Lead not found'));

        const result = await createFollowUpTaskTool.invoke({
            leadId: 'lead-1',
            date: '2026-08-05T14:00:00.000Z',
            owner: 'Maria Souza',
        });

        expect(result).toContain('Erro ao agendar tarefa');
        expect(result).toContain('Lead not found');
    });
});

describe('notifyTeamTool', () => {
    beforeEach(() => {
        getTenantIdMock.mockReset();
        notificationServiceCreateMock.mockReset();
    });

    it('recusa a notificação sem contexto de organização', async () => {
        getTenantIdMock.mockReturnValue(undefined);

        const result = await notifyTeamTool.invoke({ title: 'Risco de churn' });

        expect(result).toContain('contexto de organização ausente');
        expect(notificationServiceCreateMock).not.toHaveBeenCalled();
    });

    it('cria a notificação escopada ao tenant, com kind padrão Info', async () => {
        getTenantIdMock.mockReturnValue('org-1');
        notificationServiceCreateMock.mockResolvedValue({ id: 'notif-1' });

        const result = await notifyTeamTool.invoke({ title: 'Risco de churn no deal X' });

        expect(notificationServiceCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            title: 'Risco de churn no deal X',
            kind: 'Info',
            entity: null,
            entityId: null,
        }));
        expect(result).toContain('enviada para a equipe');
    });
});
