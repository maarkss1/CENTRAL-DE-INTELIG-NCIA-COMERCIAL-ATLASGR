import { prisma } from '../../../lib/prisma.js';
import { generateEmbedding } from '../../../lib/ai/embeddings.js';
import { logger } from '../../../lib/logger.js';

export interface SearchResult {
    id: string;
    content: string;
    metadata: any;
    similarity: number;
}

export class VectorSearchService {
    /**
     * Atualiza o embedding de um KnowledgeChunk existente.
     */
    static async updateChunkEmbedding(chunkId: string, content: string): Promise<boolean> {
        try {
            const vector = await generateEmbedding(content);
            if (!vector) return false;

            // pgvector expect a string array like '[0.1, 0.2, ...]'
            const vectorString = `[${vector.join(',')}]`;

            await prisma.$executeRaw`
                UPDATE "KnowledgeChunk" 
                SET embedding = ${vectorString}::vector
                WHERE id = ${chunkId}
            `;
            return true;
        } catch (error) {
            logger.error({ err: error, chunkId }, 'Falha ao atualizar embedding do chunk');
            return false;
        }
    }

    /**
     * Busca semântica por similaridade de Cosseno nos KnowledgeChunks.
     */
    static async searchChunks(query: string, limit: number = 5): Promise<SearchResult[]> {
        try {
            const vector = await generateEmbedding(query);
            if (!vector) return [];

            const vectorString = `[${vector.join(',')}]`;

            // <=> é o operador do pgvector para distância de Cosseno (menor é mais próximo)
            const results = await prisma.$queryRaw<SearchResult[]>`
                SELECT 
                    id, 
                    content, 
                    metadata, 
                    1 - (embedding <=> ${vectorString}::vector) as similarity
                FROM "KnowledgeChunk"
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> ${vectorString}::vector
                LIMIT ${limit}
            `;

            return results;
        } catch (error) {
            logger.error({ err: error, query }, 'Erro ao realizar busca vetorial');
            return [];
        }
    }
}
