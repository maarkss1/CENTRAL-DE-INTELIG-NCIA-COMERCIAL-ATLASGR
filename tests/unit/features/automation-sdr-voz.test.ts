/**
 * Cobre a ação "Ligar via SDR de Voz" do motor de automações — o gatilho que faz a IA ligar
 * sozinha para todo lead novo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// O motor carrega o serviço por import dinâmico, então o mock precisa cobrir o mesmo especificador.
// SuppressedNumberError entra aqui porque o motor a importa para distinguir "bloqueio respeitado"
// de "falha": sem ela no mock, o `instanceof` do motor quebraria com undefined.
vi.mock('@/features/integrations/birth-voice/birthVoice.service', () => ({
    callLead: vi.fn(),
    SuppressedNumberError: class SuppressedNumberError extends Error {},
}));

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { callLead, SuppressedNumberError } from '@/features/integrations/birth-voice/birthVoice.service';
import { automationEngine, type AutomationEvent } from '@/features/automations/automation.engine';

const automationMock = prisma.automation as unknown as {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
};
const auditLogMock = prisma.auditLog as unknown as {
    create: ReturnType<typeof vi.fn>;
};
const mockCallLead = vi.mocked(callLead);

const ORG = 'org-1';

const eventoLeadCriado: AutomationEvent = {
    organizationId: ORG,
    trigger: 'Lead criado',
    entity: 'Lead',
    entityId: 'lead-9',
    data: { status: 'Novo Lead', owner: 'Marcelo' },
};

function regraLigar(over: Record<string, unknown> = {}) {
    return {
        id: 'auto-sdr',
        name: 'Ligar para todo lead novo',
        action: 'Ligar via SDR de Voz',
        actionConfig: {},
        conditions: null,
        ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    // A ação "Ligar via SDR de Voz" só liga dentro da janela comercial (9h-18h, dias úteis, em
    // America/Sao_Paulo — ver coldCall.policy.ts). Sem congelar o relógio, este teste passa ou
    // falha dependendo da hora em que o CI roda; terça-feira 13h local está sempre dentro da
    // janela padrão.
    vi.setSystemTime(new Date('2026-01-06T16:00:00Z'));
    automationMock.update.mockResolvedValue({});
    auditLogMock.create.mockResolvedValue({});
    mockCallLead.mockResolvedValue({ sessionId: 'sess-1', callSid: 'CA1', status: 'queued' });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('Automação "Ligar via SDR de Voz"', () => {
    it('liga para o lead recém-criado e contabiliza a execução', async () => {
        automationMock.findMany.mockResolvedValue([regraLigar()]);

        const executadas = await automationEngine.handle(eventoLeadCriado);

        expect(executadas).toBe(1);
        expect(mockCallLead).toHaveBeenCalledWith(ORG, 'lead-9');
        expect(auditLogMock.create).toHaveBeenCalled();
    });

    it('respeita a condição da regra — não liga para lead que não casa com o filtro', async () => {
        automationMock.findMany.mockResolvedValue([regraLigar({ conditions: { owner: 'Outra pessoa' } })]);

        const executadas = await automationEngine.handle(eventoLeadCriado);

        expect(executadas).toBe(0);
        expect(mockCallLead).not.toHaveBeenCalled();
    });

    // Um lead sem telefone discável é o caso comum numa base importada; ele não pode derrubar as
    // demais regras que também escutam "Lead criado".
    it('isola a falha da ligação sem impedir as outras automações do mesmo gatilho', async () => {
        mockCallLead.mockRejectedValue(new Error('Lead sem telefone em formato discável.'));
        automationMock.findMany.mockResolvedValue([
            regraLigar(),
            { id: 'auto-2', name: 'Avisar time', action: 'Notificar equipe', actionConfig: {}, conditions: null },
        ]);

        const executadas = await automationEngine.handle(eventoLeadCriado);

        expect(executadas).toBe(1); // só a notificação
        expect(logger.error).toHaveBeenCalled();
    });

    // Um número com opt-out é a regra funcionando, não uma falha. Registrar isso como erro encheria
    // o log de alarme falso e faria a automação parecer quebrada toda vez que respeitasse a lei.
    it('trata o número bloqueado como execução normal, sem registrar erro', async () => {
        mockCallLead.mockRejectedValue(new SuppressedNumberError('Número na lista de bloqueio.'));
        automationMock.findMany.mockResolvedValue([regraLigar()]);

        const executadas = await automationEngine.handle(eventoLeadCriado);

        expect(executadas).toBe(1);
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalled();
        expect(auditLogMock.create).toHaveBeenCalled();
    });

    it('recusa o evento de atividade, que não tem lead para ligar', async () => {
        automationMock.findMany.mockResolvedValue([regraLigar()]);

        const executadas = await automationEngine.handle({
            organizationId: ORG,
            trigger: 'Atividade concluída',
            entity: 'Activity',
            entityId: 'act-1',
            data: {},
        });

        expect(executadas).toBe(0);
        expect(mockCallLead).not.toHaveBeenCalled();
    });
});
