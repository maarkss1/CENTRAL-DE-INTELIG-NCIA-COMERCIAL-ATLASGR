/**
 * Onda 40 (auditoria CPI — "RAG: document version/freshness ausente"): Document.version só existia
 * como conceito na auditoria, sem coluna real. Este teste prova que updateDocument incrementa a
 * versão quando o CONTEÚDO muda (reindexação real, chunks antigos apagados/recriados) e NÃO
 * incrementa quando só o título muda (nenhuma reindexação acontece nesse ramo).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const documentFindFirst = vi.fn();
const documentUpdate = vi.fn();
const executeRaw = vi.fn();
vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: { document: { findFirst: (...args: unknown[]) => documentFindFirst(...args), update: (...args: unknown[]) => documentUpdate(...args) } },
    withRlsContext: (fn: (tx: { $executeRaw: typeof executeRaw }) => unknown) => fn({ $executeRaw: executeRaw }),
}));

vi.mock('../../../../src/features/knowledge/vector-support.js', () => ({
    hasVectorSupport: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../../src/features/knowledge/chunking.js', () => ({
    chunkText: vi.fn((content: string) => [content]),
}));

vi.mock('../../../../src/lib/ai/gateway.js', () => ({
    generateEmbedding: vi.fn(),
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { ingestionService } = await import('../../../../src/features/knowledge/ingestion.service.js');

afterEach(() => {
    vi.clearAllMocks();
});

describe('IngestionService.updateDocument — versionamento (onda 40)', () => {
    it('incrementa version quando o conteúdo muda (reindexação real)', async () => {
        documentFindFirst.mockResolvedValue({ id: 'doc-1', title: 'Antigo', content: 'texto antigo', chunkCount: 1, organizationId: 'org-1' });
        documentUpdate.mockResolvedValue({ id: 'doc-1', title: 'Novo', chunkCount: 1, version: 2 });

        await ingestionService.updateDocument('org-1', 'doc-1', { content: 'texto novo' });

        expect(documentUpdate).toHaveBeenCalledWith({
            where: { id: 'doc-1' },
            data: expect.objectContaining({ version: { increment: 1 } }),
        });
    });

    it('NÃO incrementa version quando só o título muda (nenhuma reindexação acontece)', async () => {
        documentFindFirst.mockResolvedValue({ id: 'doc-1', title: 'Antigo', content: 'mesmo texto', chunkCount: 1, organizationId: 'org-1' });
        documentUpdate.mockResolvedValue({ id: 'doc-1', title: 'Novo título', chunkCount: 1 });

        await ingestionService.updateDocument('org-1', 'doc-1', { title: 'Novo título' });

        expect(documentUpdate).toHaveBeenCalledWith({
            where: { id: 'doc-1' },
            data: { title: 'Novo título' },
        });
        expect(executeRaw).not.toHaveBeenCalled();
    });
});
