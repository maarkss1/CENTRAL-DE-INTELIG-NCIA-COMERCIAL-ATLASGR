import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// RAG-001: vectorStore.similaritySearch delega para searchService.hybridSearch (o motor real da
// Base de Conhecimento — semântico + palavra-chave, RLS por tenant, fusão RRF) em vez de rodar SQL
// cru duplicado contra "DocumentChunk". Este teste cobre: (1) delegação correta com o
// organizationId do tenant atual, (2) proveniência sempre presente (documentTitle/chunkIndex) em
// cada resultado, (3) fail-safe sem tenant conhecido, (4) addDocumentChunk permanece desativado.

const hybridSearchMock = vi.fn();
vi.mock('../../../../src/features/knowledge/search.service.js', () => ({
    searchService: { hybridSearch: (...args: unknown[]) => hybridSearchMock(...args) },
}));

const getTenantIdMock = vi.fn();
vi.mock('../../../../src/lib/async-context.js', () => ({
    getTenantId: () => getTenantIdMock(),
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { vectorStore } = await import('../../../../src/lib/ai/vectorStore.js');

const ORG = 'org-playbook-1';

beforeEach(() => {
    vi.clearAllMocks();
    getTenantIdMock.mockReturnValue(ORG);
    hybridSearchMock.mockResolvedValue({
        query: 'como qualificar um lead frio?',
        semanticAvailable: true,
        hits: [
            {
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                documentTitle: 'Playbook Comercial AtlasGR',
                content: 'trecho',
                chunkIndex: 2,
                similarity: 0.9,
                matchedBy: ['semantic'],
                score: 0.5,
            },
        ],
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('vectorStore.similaritySearch', () => {
    it('delega para searchService.hybridSearch com o tenant atual', async () => {
        await vectorStore.similaritySearch('como qualificar um lead frio?', 5);

        expect(hybridSearchMock).toHaveBeenCalledWith(ORG, 'como qualificar um lead frio?', 5);
    });

    it('devolve proveniência (documentTitle/chunkIndex) em cada resultado — nunca só o texto cru', async () => {
        const results = await vectorStore.similaritySearch('ICP ideal');

        expect(results).toEqual([
            {
                id: 'chunk-1',
                content: 'trecho',
                documentId: 'doc-1',
                documentTitle: 'Playbook Comercial AtlasGR',
                chunkIndex: 2,
                similarity: 0.9,
                matchedBy: ['semantic'],
            },
        ]);
    });

    it('retorna vazio e não consulta o motor de busca quando não há tenant no requestContext', async () => {
        getTenantIdMock.mockReturnValue(undefined);

        const results = await vectorStore.similaritySearch('busca sem tenant');

        expect(results).toEqual([]);
        expect(hybridSearchMock).not.toHaveBeenCalled();
    });

    it('degrada para vazio (nunca lança) quando a busca híbrida falha', async () => {
        hybridSearchMock.mockRejectedValue(new Error('banco fora do ar'));

        const results = await vectorStore.similaritySearch('qualquer coisa');

        expect(results).toEqual([]);
    });
});

describe('vectorStore.addDocumentChunk', () => {
    it('permanece desativado (RAG-001): sem pipeline paralelo de ingestão', async () => {
        await expect(vectorStore.addDocumentChunk()).rejects.toThrow(/ingestionService\.ingestText/);
    });
});
