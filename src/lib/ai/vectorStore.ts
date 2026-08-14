import { withRlsContext } from '../prisma.js';
import { generateEmbedding } from './gateway.js';
import { getTenantId } from '../async-context.js';
import { logger } from '../logger.js';

export interface SearchResult {
    id: string;
    content: string;
    documentId: string;
    similarity: number;
}

/**
 * RLS/tenant scoping desta busca (playbook RAG do enxame de IA, ver playbookTool.ts):
 *
 * `DocumentChunk` não tem coluna `organizationId` própria — o isolamento por tenant depende do
 * join com `Document` (dono do `organizationId`) e das policies de RLS em
 * `prisma/migrations/20260731170000_knowledge_base_tenant_scope/migration.sql`. Como
 * `$executeRaw`/`$queryRaw` não passam pela extensão `$allOperations` de `src/lib/prisma.ts`, as
 * duas funções abaixo rodam via `withRlsContext` (seta `app.current_tenant_id` na transação —
 * sem isso, a policy com FORCE ROW LEVEL SECURITY devolve silenciosamente zero linhas em toda
 * leitura, e bloqueia toda escrita) E também filtram `organizationId` explicitamente por um join
 * com `Document` no WHERE da busca — a mesma dupla camada usada em
 * `src/features/knowledge/search.service.ts` (semanticSearch/keywordSearch): a RLS cobre o caso
 * de um bug futuro no contexto de tenant, o WHERE explícito cobre o caso de a conexão rodar sob
 * um papel de banco que ignora RLS (ex.: superusuário/owner da tabela).
 */

export const vectorStore = {
    /**
     * Gera o embedding para um texto e salva um novo chunk no banco de dados.
     *
     * `documentId` precisa pertencer ao tenant do `requestContext` atual: a policy de RLS de
     * `DocumentChunk` (FOR ALL, com WITH CHECK implícito igual ao USING) rejeita a inserção caso
     * o `Document` referenciado seja de outra organização, então não há necessidade de repetir a
     * checagem aqui — apenas de garantir que o contexto de tenant esteja de fato setado.
     */
    async addDocumentChunk(documentId: string, content: string): Promise<void> {
        // Gera o vetor numérico (768 dimensões Gemini) a partir do texto
        const vector = await generateEmbedding(content);

        // Formata o vetor no padrão aceito pelo pgvector '[0.1, 0.2, ...]'
        const vectorString = `[${vector.join(',')}]`;

        // Inserção usando raw query por causa do tipo Unsupported("vector")
        await withRlsContext((tx) => tx.$executeRaw`
            INSERT INTO "DocumentChunk" (id, "documentId", content, vector)
            VALUES (gen_random_uuid()::text, ${documentId}, ${content}, ${vectorString}::vector)
        `);
    },

    /**
     * Realiza uma busca vetorial (Cosine Similarity) para achar os trechos mais relevantes do
     * playbook, restrita à organização do `requestContext` atual (defesa em profundidade: filtro
     * explícito de `organizationId` via join com `Document`, além da RLS).
     *
     * Sem tenant conhecido no contexto (ex.: chamada fora de uma requisição autenticada ou de um
     * job sem `requestContext.run`), retorna vazio em vez de arriscar rodar sem nenhum filtro de
     * organização.
     */
    async similaritySearch(query: string, limit: number = 3): Promise<SearchResult[]> {
        const organizationId = getTenantId();
        if (!organizationId) {
            logger.warn('vectorStore.similaritySearch chamado sem tenant no requestContext; retornando vazio.');
            return [];
        }

        const vector = await generateEmbedding(query);
        const vectorString = `[${vector.join(',')}]`;

        // Operador <=> calcula o Cosine Distance no pgvector.
        // A similaridade é (1 - distância).
        const results = await withRlsContext((tx) => tx.$queryRaw<SearchResult[]>`
            SELECT
                c.id,
                c.content,
                c."documentId",
                1 - (c.vector <=> ${vectorString}::vector) as similarity
            FROM "DocumentChunk" c
            JOIN "Document" d ON d.id = c."documentId"
            WHERE d."organizationId" = ${organizationId}
            ORDER BY c.vector <=> ${vectorString}::vector
            LIMIT ${limit}
        `);

        return results;
    }
};
