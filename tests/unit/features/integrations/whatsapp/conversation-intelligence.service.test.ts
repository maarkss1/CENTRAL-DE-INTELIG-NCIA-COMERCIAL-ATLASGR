import { afterEach, describe, expect, it, vi } from 'vitest';

// Onda 43: analyzeConversation agora exige base legal LGPD (assertPiiExternalConsent) antes de
// ler qualquer mensagem/montar o modelo — concede consentimento geral por padrão pra não quebrar
// os testes de comportamento normal já existentes; o describe dedicado abaixo desliga isso pra
// provar a trava.
const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: '*' };
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

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
vi.mock('../../../../../src/lib/ai/gateway.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../../src/lib/ai/gateway.js')>();
    return {
        ...actual,
        getAiModel: () => ({ invoke: (...args: unknown[]) => invoke(...args) }),
        logAiUsage: vi.fn().mockResolvedValue(undefined),
    };
});

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
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '*';
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

describe('WhatsApp conversation intelligence — trava de consentimento LGPD (Onda 43)', () => {
    it('bloqueia sem base legal registrada: nunca lê mensagens nem invoca o modelo de IA', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
        findMany.mockResolvedValueOnce([
            { direction: 'inbound', body: 'Mensagem real do cliente, nunca deveria sair da checagem de consentimento.' },
        ]);

        await analyzeConversation('lead-1', 'org-sem-consentimento');

        expect(findMany).not.toHaveBeenCalled();
        expect(invoke).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it('libera normalmente quando a organização está na allowlist', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        findMany.mockResolvedValueOnce([{ direction: 'inbound', body: 'Oi' }]);
        invoke.mockResolvedValueOnce(aiResponse(JSON.stringify({
            intent: 'neutro',
            urgency: 'baixa',
            objections: [],
            budgetMentioned: false,
            nextStep: null,
            summary: 'Saudação inicial.',
            confidence: 0.4,
        })));

        await analyzeConversation('lead-1', 'org-1');

        expect(invoke).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledTimes(1);
    });
});
