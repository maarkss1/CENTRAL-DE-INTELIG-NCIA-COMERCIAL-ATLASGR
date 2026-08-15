import { logger } from '../logger.js';
import { getTenantId } from '../async-context.js';
import { searchService } from '../../features/knowledge/search.service.js';

export interface SearchResult {
    id: string;
    content: string;
    documentId: string;
    /** Título do documento de origem — obrigatório para toda resposta de RAG citar a fonte real. */
    documentTitle: string;
    /** Posição do trecho dentro do documento (0-based) — permite citar "trecho N de <título>". */
    chunkIndex: number;
    /** `null` quando o trecho só bateu por palavra-chave (sem embedding ou match semântico). */
    similarity: number | null;
    /** De onde veio o resultado: só semântico, só palavra-chave, ou ambos. */
    matchedBy: Array<'semantic' | 'keyword'>;
}

/**
 * RAG-001 (ver também vector.service.ts/vector-search.service.ts, mesmo bug): este módulo lia e
 * escrevia direto em "DocumentChunk" via SQL cru, num pipeline paralelo ao motor real de busca da
 * Base de Conhecimento (`src/features/knowledge/search.service.ts`). Dois problemas reais:
 *
 * 1. Pipeline duplicado: a mesma tabela, consultada por dois caminhos de código diferentes — exatamente
 *    o que a missão de RAG da Onda 2 (e a reafirmação na Onda 7: "evitar múltiplos pipelines
 *    conflitantes") proíbe. `addDocumentChunk` nunca teve nenhum chamador real no app inteiro (dead
 *    code desde sempre), então nenhum documento era ingerido por este caminho — só a Base de
 *    Conhecimento real (`ingestionService.ingestText`) grava chunks de verdade.
 * 2. Sem proveniência: a busca original só devolvia `content`/`documentId` (um UUID cru, não citável
 *    a um humano) e nenhum `documentTitle`. `search_playbook` (playbookTool.ts) apresentava cada
 *    trecho como "Trecho N (Score: X%)" — sem nenhuma indicação de QUAL documento originou o trecho.
 *    Isso viola a exigência de proveniência ponta a ponta da Onda 7: toda resposta baseada em RAG
 *    precisa citar de onde veio (documento/chunk), nunca só apresentar o texto cru como se fosse
 *    conhecimento do próprio modelo.
 * 3. Só semântico, sem busca por palavra-chave: um termo exato (nome de produto, sigla) que o
 *    embedding erra não tinha nenhum fallback, diferente do motor real (`hybridSearch`, RRF entre
 *    semântico e full-text).
 *
 * `similaritySearch` agora delega para `searchService.hybridSearch` — o mesmo motor (semântico +
 * palavra-chave, RLS por tenant, fusão RRF) que alimenta a Base de Conhecimento real — e devolve
 * `documentTitle`/`chunkIndex`/`matchedBy` para que quem consome o resultado (playbookTool.ts) possa
 * sempre citar a fonte real, nunca afirmar ter encontrado algo que não existe.
 */
export const vectorStore = {
    /**
     * @deprecated Sem chamador no código (RAG-001), assim como estava antes desta correção. Ingestão
     * real é `ingestionService.ingestText` (`src/features/knowledge/ingestion.service.ts`), que grava
     * em "Document"/"DocumentChunk" com RLS, chunking e citação de origem. Mantido só para não
     * quebrar um import externo eventual — não usar.
     */
    async addDocumentChunk(): Promise<void> {
        throw new Error(
            'vectorStore.addDocumentChunk está desativado (RAG-001): use ingestionService.ingestText '
            + '(src/features/knowledge/ingestion.service.ts) para indexar na Base de Conhecimento real.',
        );
    },

    /**
     * Busca híbrida (RAG-001) restrita ao tenant do `requestContext` atual — necessário porque as
     * ferramentas de IA que chamam isto (`search_playbook`) rodam fora de uma rota HTTP direta, sem
     * acesso a `req.user`.
     *
     * Sem tenant conhecido no contexto (ex.: chamada fora de uma requisição autenticada ou de um job
     * sem `requestContext.run`), retorna vazio em vez de arriscar rodar sem nenhum filtro de
     * organização — nunca teria como citar uma fonte legítima de qualquer forma.
     */
    async similaritySearch(query: string, limit: number = 3): Promise<SearchResult[]> {
        const organizationId = getTenantId();
        if (!organizationId) {
            logger.warn('vectorStore.similaritySearch chamado sem tenant no requestContext; retornando vazio.');
            return [];
        }

        try {
            const response = await searchService.hybridSearch(organizationId, query, limit);
            return response.hits.map((hit) => ({
                id: hit.chunkId,
                content: hit.content,
                documentId: hit.documentId,
                documentTitle: hit.documentTitle,
                chunkIndex: hit.chunkIndex,
                similarity: hit.similarity,
                matchedBy: hit.matchedBy,
            }));
        } catch (error) {
            logger.error({ err: error, query }, 'Falha na busca híbrida do playbook (vectorStore)');
            return [];
        }
    },
};
