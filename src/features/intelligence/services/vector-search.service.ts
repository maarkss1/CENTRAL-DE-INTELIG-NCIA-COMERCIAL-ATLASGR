import { logger } from '../../../lib/logger.js';
import { searchService } from '../../knowledge/search.service.js';

export interface SearchResult {
    id: string;
    content: string;
    metadata: unknown;
    similarity: number;
}

/**
 * RAG-001 (ver também vector.service.ts): esta classe lia de "KnowledgeChunk", um segundo
 * armazenamento de embeddings paralelo ao pipeline real da Base de Conhecimento
 * ("Document"/"DocumentChunk"). Como nada no app grava em "KnowledgeChunk", `searchChunks` sempre
 * devolvia `[]` — inclusive para `GET /api/intelligence/search`, que parecia funcional mas nunca
 * encontrava nada. Agora delega para `searchService.hybridSearch`, o mesmo motor de busca (semântica
 * + palavra-chave, com RLS por tenant) que alimenta a Base de Conhecimento de verdade.
 */
export class VectorSearchService {
    /**
     * @deprecated Sem chamador no código (RAG-001). Revetorização real é
     * `ingestionService.reembedDocument` (src/features/knowledge/ingestion.service.ts).
     */
    static async updateChunkEmbedding(): Promise<boolean> {
        logger.warn('VectorSearchService.updateChunkEmbedding está desativado (RAG-001) — sem efeito.');
        return false;
    }

    /**
     * Busca semântica (RAG-001): delega para `searchService.hybridSearch` (Document/DocumentChunk,
     * com RLS + filtro explícito de tenant) em vez da tabela "KnowledgeChunk" (sem ingestão real).
     */
    static async searchChunks(query: string, organizationId: string, limit: number = 5): Promise<SearchResult[]> {
        if (!organizationId) return [];
        try {
            const response = await searchService.hybridSearch(organizationId, query, limit);
            return response.hits.map((hit) => ({
                id: hit.chunkId,
                content: hit.content,
                metadata: { documentId: hit.documentId, documentTitle: hit.documentTitle, chunkIndex: hit.chunkIndex, matchedBy: hit.matchedBy },
                similarity: hit.similarity ?? 0,
            }));
        } catch (error) {
            logger.error({ err: error, query }, 'Erro ao realizar busca vetorial');
            return [];
        }
    }
}
