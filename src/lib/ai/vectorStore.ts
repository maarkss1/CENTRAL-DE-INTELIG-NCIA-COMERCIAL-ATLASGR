import { prisma } from '../prisma.js';
import { generateEmbedding } from './gateway.js';

export interface SearchResult {
    id: string;
    content: string;
    documentId: string;
    similarity: number;
}

export const vectorStore = {
    /**
     * Gera o embedding para um texto e salva um novo chunk no banco de dados.
     */
    async addDocumentChunk(documentId: string, content: string): Promise<void> {
        // Gera o vetor numérico (768 dimensões Gemini) a partir do texto
        const vector = await generateEmbedding(content);
        
        // Formata o vetor no padrão aceito pelo pgvector '[0.1, 0.2, ...]'
        const vectorString = `[${vector.join(',')}]`;

        // Inserção usando raw query por causa do tipo Unsupported("vector")
        await prisma.$executeRaw`
            INSERT INTO "DocumentChunk" (id, "documentId", content, vector)
            VALUES (gen_random_uuid()::text, ${documentId}, ${content}, ${vectorString}::vector)
        `;
    },

    /**
     * Realiza uma busca vetorial (Cosine Similarity) para achar os trechos mais relevantes do playbook.
     */
    async similaritySearch(query: string, limit: number = 3): Promise<SearchResult[]> {
        const vector = await generateEmbedding(query);
        const vectorString = `[${vector.join(',')}]`;

        // Operador <=> calcula o Cosine Distance no pgvector.
        // A similaridade é (1 - distância).
        const results = await prisma.$queryRaw<SearchResult[]>`
            SELECT 
                id, 
                content, 
                "documentId",
                1 - (vector <=> ${vectorString}::vector) as similarity
            FROM "DocumentChunk"
            ORDER BY vector <=> ${vectorString}::vector
            LIMIT ${limit}
        `;

        return results;
    }
};
