import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

/**
 * AI-010 (onda 34): a prova mais forte de "citação real, não alucinada" é ponta a ponta contra
 * Postgres/pgvector de verdade — ingere um documento real, roda a busca híbrida real
 * (`searchService.hybridSearch`), e confirma que a citação devolvida pelo `KnowledgeCopilotService`
 * aponta exatamente para o `documentId`/`chunkId` do documento que foi realmente ingerido e
 * encontrado — nunca para um valor que o LLM (aqui, um stub determinístico, já que não há
 * credencial de provedor de IA neste ambiente) poderia ter inventado.
 */
vi.mock('../../src/lib/ai/gateway', async () => {
    const actual = await vi.importActual<typeof import('../../src/lib/ai/gateway')>('../../src/lib/ai/gateway');
    return {
        ...actual,
        generateEmbedding: vi.fn(async () => new Array(768).fill(0).map((_, i) => Math.sin(i + 1))),
        getAiModel: () => ({
            invoke: async () => ({
                content: JSON.stringify({
                    directAnswer: 'O módulo M400 suporta 4 sondas 1-Wire.',
                    technicalSpecifications: ['4 sondas 1-Wire DS18B20'],
                    confidenceScore: 92,
                    // Alucina um índice fora de faixa (2) além do real (1) — prova que o índice
                    // inventado é descartado e só o real sobrevive.
                    citedSnippetIndexes: [1, 2],
                }),
                response_metadata: { model: 'stub-model', tokenUsage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 } },
            }),
        }),
        logAiUsage: vi.fn().mockResolvedValue(undefined),
    };
});

const { ingestionService } = await import('../../src/features/knowledge/ingestion.service');
const { searchService } = await import('../../src/features/knowledge/search.service');
const { KnowledgeCopilotService } = await import('../../src/features/knowledge/services/knowledge-copilot.service');

const ORG_A = 'test-org-id'; // pré-seedado por tests/helpers/integration-setup.ts
const ORG_B = 'test-org-id-copilot-b';

describe('AI-010: KnowledgeCopilotService cita a fonte real (Postgres/pgvector reais)', () => {
    let documentId = '';

    beforeEach(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            const exists = await prisma.organization.findUnique({ where: { id: ORG_B } });
            if (!exists) await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org Copilot B' } });
        });

        const doc = await requestContext.run({ tenantId: ORG_A }, () =>
            ingestionService.ingestText({
                organizationId: ORG_A,
                title: 'Manual Técnico Atlas M400',
                content: 'O módulo M400 suporta até 4 sondas de temperatura 1-Wire DS18B20 em barramento único com calibração digital de -55°C a +125°C.',
            }));
        documentId = doc.id;
    });

    afterEach(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            await prisma.document.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
            await prisma.organization.deleteMany({ where: { id: ORG_B } });
        });
    });

    it('a citação devolvida aponta para o documentId/chunkId real ingerido, e o índice alucinado (2) é descartado', async () => {
        const { hits } = await requestContext.run({ tenantId: ORG_A }, () =>
            searchService.hybridSearch(ORG_A, 'sonda de temperatura 1-Wire módulo M400'));

        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0]!.documentId).toBe(documentId);

        const copilot = new KnowledgeCopilotService();
        const result = await copilot.answerTechnicalQuestion({
            question: 'Quantas sondas de temperatura o módulo M400 suporta?',
            hits,
        });

        expect(result.sourceReferences).toHaveLength(1);
        expect(result.sourceReferences[0]!.documentId).toBe(documentId);
        expect(result.sourceReferences[0]!.chunkId).toBe(hits[0]!.chunkId);
        expect(result.sourceReferences[0]!.documentTitle).toBe('Manual Técnico Atlas M400');
    });

    it('busca de outro tenant nunca traz o documento do tenant A como hit — e por isso nunca vira citação', async () => {
        const { hits } = await requestContext.run({ tenantId: ORG_B }, () =>
            searchService.hybridSearch(ORG_B, 'sonda de temperatura 1-Wire módulo M400'));

        expect(hits.every((hit) => hit.documentId !== documentId)).toBe(true);

        const copilot = new KnowledgeCopilotService();
        const result = await copilot.answerTechnicalQuestion({
            question: 'Quantas sondas de temperatura o módulo M400 suporta?',
            hits,
        });

        expect(result.sourceReferences.some((ref) => ref.documentId === documentId)).toBe(false);
    });
});
