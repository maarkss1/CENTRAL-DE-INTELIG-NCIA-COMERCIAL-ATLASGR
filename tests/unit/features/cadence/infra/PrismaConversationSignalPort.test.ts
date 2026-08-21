import { afterEach, describe, expect, it, vi } from 'vitest';

const conversationSignalCreate = vi.fn().mockResolvedValue({});
const timelineEventCreate = vi.fn().mockResolvedValue({});

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        conversationSignal: { create: (...args: unknown[]) => conversationSignalCreate(...args) },
        timelineEvent: { create: (...args: unknown[]) => timelineEventCreate(...args) },
    },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { prismaConversationSignalPort } = await import('../../../../../src/features/cadence/infra/PrismaConversationSignalPort');

const baseDraft = {
    organizationId: 'org-1',
    leadId: 'lead-1',
    channel: 'email' as const,
    messageCount: 2,
    intent: 'alta_intencao_compra',
    urgency: 'alta',
    objections: [],
    budgetMentioned: false,
    nextStep: 'Enviar contrato',
    summary: 'Cliente confirmou fechamento.',
    confidence: 0.9,
    rawModelOutput: { raw: true },
};

afterEach(() => {
    vi.clearAllMocks();
});

describe('prismaConversationSignalPort', () => {
    it('grava o ConversationSignal com channel email', async () => {
        await prismaConversationSignalPort.record(baseDraft);

        expect(conversationSignalCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ organizationId: 'org-1', leadId: 'lead-1', channel: 'email', intent: 'alta_intencao_compra' }),
        });
    });

    it('registra o timeline quando há summary', async () => {
        await prismaConversationSignalPort.record(baseDraft);

        expect(timelineEventCreate).toHaveBeenCalledWith({
            data: { type: 'email', description: 'Sinal de conversa (IA, e-mail): Cliente confirmou fechamento.', leadId: 'lead-1' },
        });
    });

    it('não registra timeline quando não há summary', async () => {
        await prismaConversationSignalPort.record({ ...baseDraft, summary: null });

        expect(timelineEventCreate).not.toHaveBeenCalled();
    });

    it('a falha ao gravar o timeline não propaga (o sinal já foi salvo)', async () => {
        timelineEventCreate.mockRejectedValueOnce(new Error('boom'));

        await expect(prismaConversationSignalPort.record(baseDraft)).resolves.toBeUndefined();
    });
});
