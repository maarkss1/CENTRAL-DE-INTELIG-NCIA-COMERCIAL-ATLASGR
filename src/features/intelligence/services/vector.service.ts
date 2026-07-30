import { prisma } from '../../../lib/prisma.js';
import { generateEmbedding } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface SemanticSearchResult {
    id: string;
    content: string;
    metadata: unknown;
    distance: number;
}

export class VectorService {
    /**
     * Ingests a new document/chunk into the vector database.
     * Generates the embedding and saves it to KnowledgeChunk.
     */
    async ingestDocument(content: string, metadata: Record<string, unknown> = {}): Promise<void> {
        try {
            const organizationId = typeof metadata.organizationId === 'string'
                ? metadata.organizationId
                : '';
            if (!organizationId) {
                throw new Error('organizationId é obrigatório para indexar conhecimento.');
            }
            const embedding = await generateEmbedding(content);
            const metadataJson = JSON.stringify(metadata);
            
            // Format for pgvector: '[0.1, 0.2, ...]'
            const vectorString = `[${embedding.join(',')}]`;

            // We must use $executeRaw to insert into Unsupported("vector") column
            await prisma.$executeRaw`
                INSERT INTO "KnowledgeChunk" (id, content, metadata, embedding, "createdAt", "updatedAt")
                VALUES (gen_random_uuid()::text, ${content}, ${metadataJson}::jsonb, ${vectorString}::vector, now(), now())
            `;
            
            logger.info({ contentLength: content.length }, 'Document ingested into vector store successfully');
            
            logger.info({ contentLength: content.length }, 'Document ingested into vector store successfully');
        } catch (error) {
            logger.error({ err: error, contentLength: content.length }, 'Failed to ingest document into vector store');
            throw error;
        }
    }

    /**
     * Busca Híbrida: Combina Busca Semântica (pgvector) com Busca Lexical (Full-Text Search BM25-like).
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
            const queryEmbedding = await generateEmbedding(query);
            const vectorString = `[${queryEmbedding.join(',')}]`;

            // Query Híbrida: Busca Vetorial (pgvector) + Full Text Search
            // Os resultados vetoriais ganham bônus se também contiverem as palavras-chave (FTS).
            // Convertendo a query string para tsquery básico substituindo espaços por &
            const tsQueryString = query.replace(/[^\w\s]/g, '').trim().split(/\s+/).join(' & ');

            const results = await prisma.$queryRaw<SemanticSearchResult[]>`
                WITH semantic_search AS (
                    SELECT 
                        id, 
                        content, 
                        metadata, 
                        (embedding <=> ${vectorString}::vector) as semantic_distance
                    FROM "KnowledgeChunk"
                    WHERE metadata->>'organizationId' = ${organizationId}
                      AND (embedding <=> ${vectorString}::vector) < ${threshold}
                    ORDER BY semantic_distance ASC
                    LIMIT ${limit * 2}
                ),
                lexical_search AS (
                    SELECT 
                        id,
                        ts_rank_cd(to_tsvector('portuguese', content), to_tsquery('portuguese', ${tsQueryString})) as rank
                    FROM "KnowledgeChunk"
                    WHERE metadata->>'organizationId' = ${organizationId}
                      AND to_tsvector('portuguese', content) @@ to_tsquery('portuguese', ${tsQueryString})
                )
                SELECT 
                    s.id, 
                    s.content, 
                    s.metadata, 
                    -- Cálculo de Score Híbrido: Combina a distância semântica com o bônus léxico
                    (s.semantic_distance - COALESCE(l.rank, 0) * 0.1) as distance
                FROM semantic_search s
                LEFT JOIN lexical_search l ON s.id = l.id
                ORDER BY distance ASC
                LIMIT ${limit}
            `;

            return results.map(row => ({
                id: row.id,
                content: row.content,
                metadata: row.metadata,
                distance: row.distance
            }));
        } catch (error) {
            logger.error({ err: error, query }, 'Failed to perform hybrid semantic search');
            return [];
        }
    }
}

export const vectorService = new VectorService();
