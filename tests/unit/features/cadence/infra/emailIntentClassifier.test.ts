import { afterEach, describe, expect, it, vi } from 'vitest';

/** CYC-003 (onda 26) — implementação real do `IntentClassifierPort` para réplica de e-mail, mesmo padrão de extração já testado para WhatsApp em conversation-intelligence.service.test.ts. */

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

const { emailIntentClassifier } = await import('../../../../../src/features/cadence/infra/emailIntentClassifier');

function aiResponse(content: string) {
    return {
        content,
        response_metadata: { model: 'local-llama3', tokenUsage: { totalTokens: 1, promptTokens: 1, completionTokens: 1 } },
    };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('emailIntentClassifier', () => {
    it('extrai o sinal do JSON devolvido pelo modelo', async () => {
        invoke.mockResolvedValueOnce(aiResponse(JSON.stringify({
            intent: 'alta_intencao_compra',
            urgency: 'alta',
            objections: ['preço alto'],
            budgetMentioned: true,
            nextStep: 'Enviar contrato',
            summary: 'Cliente confirmou fechamento.',
            confidence: 0.87,
        })));

        const result = await emailIntentClassifier.classify('Cliente: Fechado, pode mandar o contrato.');

        expect(result).toMatchObject({
            intent: 'alta_intencao_compra',
            urgency: 'alta',
            objections: ['preço alto'],
            budgetMentioned: true,
            nextStep: 'Enviar contrato',
            summary: 'Cliente confirmou fechamento.',
            confidence: 0.87,
        });
    });

    it('descarta um intent fora do vocabulário permitido em vez de propagar lixo', async () => {
        invoke.mockResolvedValueOnce(aiResponse(JSON.stringify({ intent: 'inventado_pelo_modelo', urgency: 'urgentissimo' })));

        const result = await emailIntentClassifier.classify('texto qualquer');

        expect(result.intent).toBeNull();
        expect(result.urgency).toBeNull();
    });

    it('cai para um resultado neutro (nunca lança) quando o modelo devolve algo que não é JSON', async () => {
        invoke.mockResolvedValueOnce(aiResponse('não é json'));

        const result = await emailIntentClassifier.classify('texto qualquer');

        expect(result.intent).toBeNull();
        expect(result.confidence).toBeNull();
    });
});
