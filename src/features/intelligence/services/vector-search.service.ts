import { prisma } from '../../../lib/prisma.js';
// IA-002: usava lib/ai/embeddings.js (só Google direto, sem fallback — retornava null e a busca
// falhava silenciosamente sem GEMINI_API_KEY configurada). gateway.ts é local-first (embedLocal,
// sem chave nenhuma) com fallback pra LiteLLM/Google — mesma fonte de embedding que VectorService
// já usa, então as duas classes passam a gerar vetores compatíveis pra mesma tabela KnowledgeChunk.
import { generateEmbedding } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface SearchResult {
    id: string;
    content: string;
    metadata: unknown;
    similarity: number;
}

export class VectorSearchService {
    /**
     * Atualiza o embedding de um KnowledgeChunk existente.
     */
    static async updateChunkEmbedding(chunkId: string, content: string, organizationId: string): Promise<boolean> {
        if (!organizationId) return false;
        try {
            // generateEmbedding (gateway.ts) nunca devolve null — ou retorna um vetor válido ou
            // lança, então uma falha real cai direto no catch abaixo.
            const vector = await generateEmbedding(content);

            // pgvector expect a string array like '[0.1, 0.2, ...]'
            const vectorString = `[${vector.join(',')}]`;

            await prisma.$executeRaw`
                UPDATE "KnowledgeChunk"
                SET embedding = ${vectorString}::vector
                WHERE id = ${chunkId}
                  AND "organizationId" = ${organizationId}
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
    static async searchChunks(query: string, organizationId: string, limit: number = 5): Promise<SearchResult[]> {
        if (!organizationId) return [];
        try {
            const vector = await generateEmbedding(query);

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
                  AND "organizationId" = ${organizationId}
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
