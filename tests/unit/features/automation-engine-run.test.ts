/**
 * Exercita o caminho completo do motor de automações — o que até aqui nunca havia rodado de fato,
 * só a lógica isolada de condição e template. Aqui a regra é buscada, filtrada, executada, e
 * verificamos o efeito colateral real (notificação criada, atividade agendada, contador somado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        automation: { findMany: vi.fn(), update: vi.fn() },
        notification: { create: vi.fn() },
        activity: { create: vi.fn() },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { automationEngine, type AutomationEvent } from '@/features/automations/automation.engine';

const automationMock = prisma.automation as unknown as {
    findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>;
};
const notificationMock = prisma.notification as unknown as { create: ReturnType<typeof vi.fn> };
const activityMock = prisma.activity as unknown as { create: ReturnType<typeof vi.fn> };

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
});

describe('AutomationEngine.handle — execução real', () => {
    it('busca apenas regras ativas do tenant e do gatilho do evento', async () => {
        automationMock.findMany.mockResolvedValue([]);
        await automationEngine.handle(eventoLead);

        expect(automationMock.findMany).toHaveBeenCalledWith({
            where: { organizationId: ORG, enabled: true, trigger: 'Lead mudou de status' },
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
        // O dono sai do evento quando o config não define um.
        expect(data.owner).toBe('Marcelo');

        const dias = Math.round((data.date.getTime() - Date.now()) / 86_400_000);
        expect(dias).toBe(3);
    });

    it('registra a execução: soma o contador e carimba a data', async () => {
        automationMock.findMany.mockResolvedValue([regra()]);
        await automationEngine.handle(eventoLead);

        expect(automationMock.update).toHaveBeenCalledTimes(1);
        const call = automationMock.update.mock.calls[0][0];
        expect(call.where).toEqual({ id: 'auto-1' });
        expect(call.data.runCount).toEqual({ increment: 1 });
        expect(call.data.lastRunAt).toBeInstanceOf(Date);
    });

    it('pula a regra cuja condição não casa, sem executar nem contar', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ conditions: { status: 'Negociação' } }),
        ]);

        const executadas = await automationEngine.handle(eventoLead);

        expect(executadas).toBe(0);
        expect(notificationMock.create).not.toHaveBeenCalled();
        expect(automationMock.update).not.toHaveBeenCalled();
    });

    it('executa a regra cuja condição casa', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ conditions: { status: 'Proposta', temperature: 'Quente' } }),
        ]);
        expect(await automationEngine.handle(eventoLead)).toBe(1);
    });

    it('uma regra que falha não impede as demais', async () => {
        automationMock.findMany.mockResolvedValue([
            regra({ id: 'quebrada', action: 'Ação inexistente' }),
            regra({ id: 'boa' }),
        ]);

        const executadas = await automationEngine.handle(eventoLead);

        expect(executadas).toBe(1);
        expect(notificationMock.create).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalled();
    });

    it('recusa "Criar atividade" em evento que não é de lead, sem derrubar o motor', async () => {
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
    });

    it('não propaga erro quando o banco cai: automação não pode derrubar o fluxo principal', async () => {
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
});
