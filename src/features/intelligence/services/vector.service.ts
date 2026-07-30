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
    async ingestDocument(content: string, metadata: unknown = {}): Promise<void> {
        try {
            const embedding = await generateEmbedding(content);
            
            // Format for pgvector: '[0.1, 0.2, ...]'
            const vectorString = `[${embedding.join(',')}]`;

            // We must use $executeRaw to insert into Unsupported("vector") column
            await prisma.$executeRaw`
                INSERT INTO "KnowledgeChunk" (id, content, metadata, embedding, "createdAt", "updatedAt")
                VALUES (gen_random_uuid()::text, ${content}, ${metadata}::jsonb, ${vectorString}::vector, now(), now())
            `;
            
            logger.info({ contentLength: content.length }, 'Document ingested into vector store successfully');
        } catch (error) {
            logger.error({ err: error, content }, 'Failed to ingest document into vector store');
            throw error;
        }
    }

    /**
     * Searches for semantically similar chunks in the database.
     * Uses L2 distance (<->) or Cosine distance (<=>). 
     * We'll use Cosine distance as it's standard for text-embeddings.
     */
    async searchSimilar(query: string, limit: number = 3, threshold: number = 0.5): Promise<SemanticSearchResult[]> {
        try {
            const queryEmbedding = await generateEmbedding(query);
            const vectorString = `[${queryEmbedding.join(',')}]`;

            // Query using pgvector cosine distance `<=>` operator. 
            // Note: pgvector distance is 0 for identical vectors, 1 for orthogonal, 2 for opposite.
            // A threshold of 0.5 means fairly similar.
            const results = await prisma.$queryRaw<unknown[]>`
                SELECT 
                    id, 
                    content, 
                    metadata, 
                    (embedding <=> ${vectorString}::vector) as distance
                FROM "KnowledgeChunk"
                WHERE (embedding <=> ${vectorString}::vector) < ${threshold}
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
            logger.error({ err: error, query }, 'Failed to perform semantic search');
            return [];
        }
    }
}

export const vectorService = new VectorService();
