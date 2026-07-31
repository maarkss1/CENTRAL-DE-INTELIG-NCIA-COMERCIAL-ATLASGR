import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { meili } from '../../lib/search/index';

export class SearchService {
    async hybridSearch(query: string) {
        // 1. Semantic search (simulated vector query)
        const vectorResults = await prisma.$queryRaw`
            SELECT "documentId", "content", 1 - (vector <=> '[0,0,0]'::vector) as similarity
            FROM "DocumentChunk"
            ORDER BY vector <=> '[0,0,0]'::vector
            LIMIT 5
        `;

        // 2. Keyword search via Meilisearch
        // Note: in a real implementation we would search a "documents" index.
        let keywordResults: unknown[] = [];
        try {
            const meiliRes = await meili.index('leads').search(query, { limit: 5 });
            keywordResults = meiliRes.hits;
        } catch (e) {
            logger.error({ err: e, query }, 'Meili search failed');
        }

        return {
            semantic: vectorResults,
            keyword: keywordResults
        };
    }
}
