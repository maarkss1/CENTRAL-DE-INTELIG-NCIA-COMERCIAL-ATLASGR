import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vectorStore faz busca vetorial (embeddings do playbook RAG) via SQL cru na tabela
// "DocumentChunk", que não passa pela extensão $allOperations de src/lib/prisma.ts (RLS/tenant
// scoping) — por isso precisa de withRlsContext + filtro explícito de organizationId. Este teste
// cobre a correção: sem withRlsContext, a policy de RLS (FORCE ROW LEVEL SECURITY) devolveria
// zero linhas sempre em produção, ou vazaria entre tenants sob um papel de banco que ignora RLS.

const txQueryRaw = vi.fn();
const txExecuteRaw = vi.fn();
const withRlsContextMock = vi.fn((fn: (tx: { $queryRaw: typeof txQueryRaw; $executeRaw: typeof txExecuteRaw }) => unknown) =>
    fn({ $queryRaw: txQueryRaw, $executeRaw: txExecuteRaw }),
);

vi.mock('../../../../src/lib/prisma.js', () => ({
    withRlsContext: (fn: (tx: unknown) => unknown) => withRlsContextMock(fn as never),
}));

const generateEmbeddingMock = vi.fn();
vi.mock('../../../../src/lib/ai/gateway.js', () => ({
    generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
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
    generateEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
    getTenantIdMock.mockReturnValue(ORG);
    txQueryRaw.mockResolvedValue([{ id: 'chunk-1', content: 'trecho', documentId: 'doc-1', similarity: 0.9 }]);
    txExecuteRaw.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('vectorStore.similaritySearch', () => {
    it('roda a busca vetorial dentro de withRlsContext', async () => {
        await vectorStore.similaritySearch('como qualificar um lead frio?');

        expect(withRlsContextMock).toHaveBeenCalledTimes(1);
        expect(txQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('filtra explicitamente por organizationId (defesa em profundidade, além da RLS)', async () => {
        await vectorStore.similaritySearch('ICP ideal');

        const [strings, ...values] = txQueryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
        expect(strings.join('')).toContain('d."organizationId"');
        expect(values).toContain(ORG);
    });

    it('retorna vazio e não consulta o banco quando não há tenant no requestContext', async () => {
        getTenantIdMock.mockReturnValue(undefined);

        const results = await vectorStore.similaritySearch('busca sem tenant');

        expect(results).toEqual([]);
        expect(withRlsContextMock).not.toHaveBeenCalled();
        expect(txQueryRaw).not.toHaveBeenCalled();
    });
});

describe('vectorStore.addDocumentChunk', () => {
    it('roda o insert do chunk dentro de withRlsContext', async () => {
        await vectorStore.addDocumentChunk('doc-1', 'conteúdo do trecho');

        expect(withRlsContextMock).toHaveBeenCalledTimes(1);
        expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    });
});
