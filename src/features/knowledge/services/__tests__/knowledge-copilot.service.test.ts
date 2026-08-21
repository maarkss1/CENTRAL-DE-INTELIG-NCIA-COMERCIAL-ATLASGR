import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchHit } from '../../search.service.js';

/**
 * AI-010 (onda 34): prova o núcleo do "gate de citação real" — o LLM só pode apontar o ÍNDICE de
 * um trecho que fornecemos (nunca escrever o nome de uma fonte em texto livre), e nós resolvemos
 * esse índice de volta para os metadados reais do `SearchHit`. Um índice inventado, fora de faixa,
 * duplicado ou não-inteiro nunca vira uma citação — é descartado silenciosamente, não propagado
 * como se fosse uma fonte real.
 */

const invokeMock = vi.fn();

vi.mock('../../../../lib/ai/gateway.js', async () => {
    const actual = await vi.importActual<typeof import('../../../../lib/ai/gateway.js')>('../../../../lib/ai/gateway.js');
    return {
        ...actual,
        getAiModel: () => ({ invoke: invokeMock }),
        logAiUsage: vi.fn().mockResolvedValue(undefined),
    };
});

const { KnowledgeCopilotService } = await import('../knowledge-copilot.service.js');

function buildHit(overrides: Partial<SearchHit> = {}): SearchHit {
    return {
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        documentTitle: 'Manual Técnico Atlas',
        content: 'Alimentação 9-36V DC',
        chunkIndex: 0,
        matchedBy: ['semantic'],
        similarity: 0.9,
        score: 0.5,
        ...overrides,
    };
}

function mockLlmResponse(body: Record<string, unknown>) {
    invokeMock.mockResolvedValueOnce({
        content: JSON.stringify(body),
        response_metadata: { model: 'stub', tokenUsage: {} },
    });
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('KnowledgeCopilotService — citação real resolvida de SearchHit (AI-010)', () => {
    it('resolve um índice citado para o metadado real do hit correspondente', async () => {
        const service = new KnowledgeCopilotService();
        mockLlmResponse({
            directAnswer: 'x', technicalSpecifications: [], confidenceScore: 90,
            citedSnippetIndexes: [1],
        });

        const result = await service.answerTechnicalQuestion({
            question: 'q', hits: [buildHit()],
        });

        expect(result.sourceReferences).toEqual([
            { documentId: 'doc-1', chunkId: 'chunk-1', documentTitle: 'Manual Técnico Atlas', chunkIndex: 0, score: 0.5 },
        ]);
    });

    it('descarta um índice fora de faixa (LLM alucinou um número que não existe na lista)', async () => {
        const service = new KnowledgeCopilotService();
        mockLlmResponse({
            directAnswer: 'x', technicalSpecifications: [], confidenceScore: 90,
            citedSnippetIndexes: [1, 99],
        });

        const result = await service.answerTechnicalQuestion({ question: 'q', hits: [buildHit()] });

        expect(result.sourceReferences).toHaveLength(1);
        expect(result.sourceReferences[0]!.documentId).toBe('doc-1');
    });

    it('descarta índices não-inteiros e zero/negativos', async () => {
        const service = new KnowledgeCopilotService();
        mockLlmResponse({
            directAnswer: 'x', technicalSpecifications: [], confidenceScore: 90,
            citedSnippetIndexes: [0, -1, 1.5, 'um'],
        });

        const result = await service.answerTechnicalQuestion({ question: 'q', hits: [buildHit()] });

        expect(result.sourceReferences).toEqual([]);
    });

    it('deduplica índices repetidos — nunca duas citações para o mesmo trecho', async () => {
        const service = new KnowledgeCopilotService();
        mockLlmResponse({
            directAnswer: 'x', technicalSpecifications: [], confidenceScore: 90,
            citedSnippetIndexes: [1, 1, 1],
        });

        const result = await service.answerTechnicalQuestion({ question: 'q', hits: [buildHit()] });

        expect(result.sourceReferences).toHaveLength(1);
    });

    it('citedSnippetIndexes ausente ou não-array não quebra — devolve resposta sem citações', async () => {
        const service = new KnowledgeCopilotService();
        mockLlmResponse({ directAnswer: 'x', technicalSpecifications: [], confidenceScore: 90 });

        const result = await service.answerTechnicalQuestion({ question: 'q', hits: [buildHit()] });

        expect(result.sourceReferences).toEqual([]);
    });

    it('sem nenhum hit (nada encontrado na base), diz isso honestamente ao LLM e não cita nada', async () => {
        const service = new KnowledgeCopilotService();
        mockLlmResponse({
            directAnswer: 'Não há documentação sobre isso na base.', technicalSpecifications: [], confidenceScore: 20,
            citedSnippetIndexes: [],
        });

        const result = await service.answerTechnicalQuestion({ question: 'q', hits: [] });

        expect(result.sourceReferences).toEqual([]);
        const promptSentToLlm = invokeMock.mock.calls[0]![0][1].content as string;
        expect(promptSentToLlm).toContain('Nenhum documento da base de conhecimento foi encontrado');
    });

    it('com múltiplos hits, cita apenas os índices realmente referenciados pelo LLM', async () => {
        const service = new KnowledgeCopilotService();
        mockLlmResponse({
            directAnswer: 'x', technicalSpecifications: [], confidenceScore: 90,
            citedSnippetIndexes: [2],
        });

        const result = await service.answerTechnicalQuestion({
            question: 'q',
            hits: [
                buildHit({ chunkId: 'chunk-1', documentId: 'doc-1' }),
                buildHit({ chunkId: 'chunk-2', documentId: 'doc-2', content: 'Regra PGR: pacote a cada 60s' }),
            ],
        });

        expect(result.sourceReferences).toEqual([
            expect.objectContaining({ documentId: 'doc-2', chunkId: 'chunk-2' }),
        ]);
    });

    it('em caso de falha do LLM, devolve a resposta honesta de fallback sem citação inventada', async () => {
        const service = new KnowledgeCopilotService();
        invokeMock.mockRejectedValueOnce(new Error('provedor indisponível'));

        const result = await service.answerTechnicalQuestion({ question: 'q', hits: [buildHit()] });

        expect(result.sourceReferences).toEqual([]);
        expect(result.confidenceScore).toBe(40);
    });
});
