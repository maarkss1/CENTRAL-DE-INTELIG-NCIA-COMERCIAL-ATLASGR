import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { meili } from '../../lib/search/index';
import { generateEmbedding } from '../../lib/ai/gateway';

export class SearchService {
    /**
     * Busca híbrida: combina similaridade semântica (pgvector com embedding real da query)
     * e busca por palavras-chave (Meilisearch) para retornar resultados mais relevantes.
     */
    async hybridSearch(query: string) {
        // 1. Busca semântica: gera embedding real da query via gateway de IA
        //    e ordena os chunks por distância cosseno no pgvector.
        let vectorResults: unknown[] = [];
        try {
            const embedding = await generateEmbedding(query);
            const vectorStr = `[${embedding.join(',')}]`;
            vectorResults = await prisma.$queryRaw`
                SELECT "documentId", "content", 1 - (vector <=> ${vectorStr}::vector) as similarity
                FROM "DocumentChunk"
                ORDER BY vector <=> ${vectorStr}::vector
                LIMIT 5
            `;
        } catch (e) {
            logger.error({ err: e, query }, 'Vector search failed');
        }

        // 2. Busca por palavras-chave via Meilisearch
        let keywordResults: unknown[] = [];
        try {
            const meiliRes = await meili.index('documents').search(query, { limit: 5 });
            keywordResults = meiliRes.hits;
        } catch (e) {
            logger.error({ err: e, query }, 'Meili search failed');
        }

        return {
            semantic: vectorResults,
            keyword: keywordResults,
        };
    }
}
