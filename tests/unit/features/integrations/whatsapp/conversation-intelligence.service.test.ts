import { afterEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const create = vi.fn();
const timelineEventCreate = vi.fn().mockResolvedValue({});
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        whatsAppMessage: { findMany: (...args: unknown[]) => findMany(...args) },
        conversationSignal: { create: (...args: unknown[]) => create(...args) },
        timelineEvent: { create: (...args: unknown[]) => timelineEventCreate(...args) },
    },
}));

const invoke = vi.fn();
vi.mock('../../../../../src/lib/ai/gateway.js', () => ({
    getAiModel: () => ({ invoke: (...args: unknown[]) => invoke(...args) }),
    logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { analyzeConversation } = await import(
    '../../../../../src/features/integrations/whatsapp/conversation-intelligence.service'
);

function aiResponse(content: string) {
    return {
        content,
        response_metadata: { model: 'local-llama3', tokenUsage: { totalTokens: 1, promptTokens: 1, completionTokens: 1 } },
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('WhatsApp conversation intelligence', () => {
    it('does nothing when there are no messages for the lead', async () => {
        findMany.mockResolvedValueOnce([]);

        await analyzeConversation('lead-1', 'org-1');

        expect(invoke).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it('does nothing when every message is media-without-caption (no text to read)', async () => {
        findMany.mockResolvedValueOnce([
            { direction: 'inbound', body: null },
            { direction: 'outbound', body: '   ' },
        ]);

        await analyzeConversation('lead-1', 'org-1');

        expect(invoke).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it('extracts a structured signal and logs it to the timeline', async () => {
        findMany.mockResolvedValueOnce([
            { direction: 'outbound', body: 'Oi! Vi que vocês têm frota própria, hoje como tratam ocorrência?' },
            { direction: 'inbound', body: 'Hoje é tudo manual, tá pesado. Quanto custa isso?' },
        ]);
        invoke.mockResolvedValueOnce(aiResponse(JSON.stringify({
            intent: 'alta_intencao_compra',
            urgency: 'alta',
            objections: ['achou que pode ser caro'],
            budgetMentioned: true,
            nextStep: 'Enviar proposta amanhã',
            summary: 'Cliente demonstrou interesse real e perguntou preço.',
            confidence: 0.82,
        })));

        await analyzeConversation('lead-1', 'org-1');

        expect(invoke).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: 'org-1',
                leadId: 'lead-1',
                messageCount: 2,
                intent: 'alta_intencao_compra',
                urgency: 'alta',
                objections: ['achou que pode ser caro'],
                budgetMentioned: true,
                nextStep: 'Enviar proposta amanhã',
                summary: 'Cliente demonstrou interesse real e perguntou preço.',
                confidence: 0.82,
            }),
        });
        expect(timelineEventCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: 'whatsapp',
                leadId: 'lead-1',
                description: expect.stringContaining('Cliente demonstrou interesse real'),
            }),
        });
    });

    it('discards intent/urgency values outside the allowed vocabulary instead of trusting the model blindly', async () => {
        findMany.mockResolvedValueOnce([{ direction: 'inbound', body: 'Oi' }]);
        invoke.mockResolvedValueOnce(aiResponse(JSON.stringify({
            intent: 'algo-que-o-modelo-inventou',
            urgency: 'urgentissimo',
            objections: [],
            budgetMentioned: false,
            nextStep: null,
            summary: 'Resumo válido.',
            confidence: 0.5,
        })));

        await analyzeConversation('lead-1', 'org-1');

        expect(create).toHaveBeenCalledWith({
            data: expect.objectContaining({ intent: null, urgency: null }),
        });
    });

    it('falls back to a null signal (and skips the timeline entry) when the model output is not valid JSON', async () => {
        findMany.mockResolvedValueOnce([{ direction: 'inbound', body: 'Oi' }]);
        invoke.mockResolvedValueOnce(aiResponse('desculpe, não consigo ajudar com isso'));

        await analyzeConversation('lead-1', 'org-1');

        expect(create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                intent: null,
                urgency: null,
                objections: [],
                budgetMentioned: false,
                nextStep: null,
                summary: null,
                confidence: null,
            }),
        });
        expect(timelineEventCreate).not.toHaveBeenCalled();
    });
});
