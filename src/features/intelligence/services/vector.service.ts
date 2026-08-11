import { logger } from '../../../lib/logger.js';
import { searchService } from '../../knowledge/search.service.js';

export interface SemanticSearchResult {
    id: string;
    content: string;
    metadata: unknown;
    distance: number;
}

/**
 * RAG-001: esta classe gravava e lia de "KnowledgeChunk", um segundo armazenamento de embeddings
 * paralelo ao pipeline real da Base de Conhecimento ("Document"/"DocumentChunk", ver
 * `src/features/knowledge/`). `ingestDocument` nunca teve nenhum chamador em todo o app — a tabela
 * ficava sempre vazia na prática — então todo consumidor de `searchSimilar` (inclusive o agente de
 * SDR que redige e-mails automáticos reais, `sdr-agent.ts`) sempre recebia zero resultados e caía no
 * fallback "Sem contexto adicional no playbook", mesmo com documentos reais indexados pelos usuários
 * na Base de Conhecimento. Dois pipelines de RAG conflitantes (proibido pela missão de IA da Onda 2)
 * — este agora delega para o pipeline real em vez de manter uma segunda fonte de verdade morta.
 */
export class VectorService {
    /**
     * @deprecated Sem chamador no código (RAG-001). Ingestão real é `ingestionService.ingestText`
     * (`src/features/knowledge/ingestion.service.ts`), que grava em "Document"/"DocumentChunk" com
     * RLS e alimenta a busca real. Mantido só para não quebrar import externo eventual; não usar.
     */
    async ingestDocument(): Promise<void> {
        throw new Error(
            'VectorService.ingestDocument está desativado (RAG-001): use ingestionService.ingestText '
            + '(src/features/knowledge/ingestion.service.ts) para indexar na Base de Conhecimento real.',
        );
    }

    /**
     * Busca híbrida (RAG-001): delega para o mesmo `searchService.hybridSearch` que alimenta a
     * Base de Conhecimento (Document/DocumentChunk, com RLS + filtro explícito de tenant), em vez da
     * tabela "KnowledgeChunk" (sem ingestão real, sempre vazia). `threshold` preserva a semântica
     * original de "distância máxima aceitável" (0 = idêntico, 1 = sem relação semântica): trechos que
     * só bateram por palavra-chave (sem embedding) recebem distância 1 e são descartados pelo
     * threshold padrão, igual ao comportamento anterior de não devolver não-semânticos aqui.
     */
    async searchSimilar(
        query: string,
        organizationId: string,
        limit: number = 3,
        threshold: number = 0.5,
    ): Promise<SemanticSearchResult[]> {
        if (!organizationId) {
            logger.warn('Busca híbrida ignorada por ausência de organizationId');
            return [];
        }
        try {
            const response = await searchService.hybridSearch(organizationId, query, Math.max(limit * 2, limit));
            return response.hits
                .map((hit) => ({
                    id: hit.chunkId,
                    content: hit.content,
                    metadata: { documentId: hit.documentId, documentTitle: hit.documentTitle, chunkIndex: hit.chunkIndex, matchedBy: hit.matchedBy },
                    distance: hit.similarity != null ? 1 - hit.similarity : 1,
                }))
                .filter((row) => row.distance < threshold)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, limit);
        } catch (error) {
            logger.error({ err: error, query }, 'Failed to perform hybrid semantic search');
            return [];
        }
    }
}

export const vectorService = new VectorService();
