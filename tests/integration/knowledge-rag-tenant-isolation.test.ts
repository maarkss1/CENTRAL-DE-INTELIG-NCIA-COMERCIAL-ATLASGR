import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

// RAG-001: `vector.service.ts`/`vector-search.service.ts` (usados pelo agente de SDR outbound e
// por `GET /api/intelligence/search`) foram corrigidos para delegar ao mesmo pipeline real da Base
// de Conhecimento (`Document`/`DocumentChunk`, via `search.service.ts`) em vez de uma tabela
// paralela ("KnowledgeChunk") sem ingestão real. Este teste garante, ponta a ponta com Postgres de
// verdade (RLS incluída), que esse pipeline consolidado nunca vaza trecho de um tenant para outro —
// mesmo quando os dois tenants têm documentos com conteúdo quase idêntico.
// Mock completo (sem `importOriginal`) de propósito: o gateway real puxa @xenova/transformers
// (runtime de embedding local, pesado) e outras dependências que este teste não precisa — só
// `ingestionService`/`searchService` chamam `generateEmbedding` no caminho exercitado aqui. O que
// importa é isolamento de tenant, não qualidade de ranking semântico, então um vetor fixo serve.
vi.mock('../../src/lib/ai/gateway', () => ({
    generateEmbedding: vi.fn(async () => new Array(768).fill(0).map((_, i) => Math.sin(i + 1))),
}));

import { ingestionService } from '../../src/features/knowledge/ingestion.service';
import { searchService } from '../../src/features/knowledge/search.service';
import { VectorSearchService } from '../../src/features/intelligence/services/vector-search.service';

const ORG_A = 'test-org-id'; // pré-seedado por tests/helpers/integration-setup.ts
const ORG_B = 'test-org-id-rag-b';

describe('RAG (Base de Conhecimento): isolamento de tenant na busca híbrida', () => {
    let docAId = '';
    let docBId = '';

    beforeEach(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            const exists = await prisma.organization.findUnique({ where: { id: ORG_B } });
            if (!exists) await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org RAG B' } });
        });

        const docA = await requestContext.run({ tenantId: ORG_A }, () =>
            ingestionService.ingestText({
                organizationId: ORG_A,
                title: 'Playbook exclusivo do tenant A',
                content: 'Estratégia confidencial de precificação para o segmento de logística pesada, uso interno do tenant A.',
            }));
        docAId = docA.id;

        const docB = await requestContext.run({ tenantId: ORG_B }, () =>
            ingestionService.ingestText({
                organizationId: ORG_B,
                title: 'Playbook exclusivo do tenant B',
                content: 'Estratégia confidencial de precificação para o segmento de logística pesada, uso interno do tenant B.',
            }));
        docBId = docB.id;
    });

    afterEach(async () => {
        await requestContext.run({ bypassRls: true }, async () => {
            await prisma.document.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
            await prisma.organization.deleteMany({ where: { id: ORG_B } });
        });
    });

    it('busca do tenant A nunca retorna trecho do documento do tenant B, mesmo com termos quase idênticos', async () => {
        const result = await requestContext.run({ tenantId: ORG_A }, () =>
            searchService.hybridSearch(ORG_A, 'estratégia confidencial de precificação logística pesada'));

        expect(result.hits.length).toBeGreaterThan(0);
        expect(result.hits.every((hit) => hit.documentId === docAId)).toBe(true);
        expect(result.hits.some((hit) => hit.documentId === docBId)).toBe(false);
    });

    it('busca do tenant B nunca retorna trecho do documento do tenant A', async () => {
        const result = await requestContext.run({ tenantId: ORG_B }, () =>
            searchService.hybridSearch(ORG_B, 'estratégia confidencial de precificação logística pesada'));

        expect(result.hits.length).toBeGreaterThan(0);
        expect(result.hits.every((hit) => hit.documentId === docBId)).toBe(true);
        expect(result.hits.some((hit) => hit.documentId === docAId)).toBe(false);
    });

    it('RAG-001: VectorSearchService (usado pelo agente de SDR outbound) delega ao pipeline real com tenant isolado', async () => {
        const results = await requestContext.run({ tenantId: ORG_A }, () =>
            VectorSearchService.searchChunks('estratégia confidencial de precificação logística pesada', ORG_A, 5));

        expect(results.length).toBeGreaterThan(0);
        expect(results.every((hit) => (hit.metadata as { documentId?: string } | null)?.documentId === docAId)).toBe(true);
    });
});
