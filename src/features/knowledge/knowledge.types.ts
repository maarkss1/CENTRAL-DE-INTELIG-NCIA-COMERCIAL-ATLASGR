/**
 * Tipos compartilhados entre `search.service.ts` e `services/reranker.service.ts`. Extraído para
 * cá (Onda 42, DEC-11) porque `search.service.ts` chama `rerankerService` em runtime e
 * `reranker.service.ts` precisava do tipo `SearchHit` de `search.service.ts` — as duas direções
 * juntas formavam um ciclo de import (dependency-cruiser `no-circular`). Um módulo de tipos puro,
 * sem valor nenhum exportado, nunca pode participar de um ciclo de import em runtime.
 */
export interface SearchHit {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    content: string;
    chunkIndex: number;
    /** De onde veio o resultado: só semântico, só palavra-chave, ou ambos. */
    matchedBy: Array<'semantic' | 'keyword'>;
    /** Similaridade de cosseno (0..1) quando o trecho veio da busca vetorial. */
    similarity: number | null;
    /** Score final de fusão (RRF) — só faz sentido comparado aos outros hits da mesma consulta. */
    score: number;
    /**
     * Pontuação de relevância (0-100) atribuída pelo estágio de reranking via LLM (DEC-11), quando
     * habilitado (`KNOWLEDGE_RERANK_ENABLED`) e a chamada teve sucesso para este trecho. `undefined`
     * quando o reranking está desligado, falhou (fallback fail-safe para a ordem do RRF), ou o
     * trecho caiu fora da janela de candidatos re-rankeados (`KNOWLEDGE_RERANK_CANDIDATES`) — nesses
     * casos `score` (RRF) continua sendo o único critério de ordenação real.
     */
    rerankScore?: number;
}

export interface SearchResponse {
    hits: SearchHit[];
    /** `false` quando o provedor de embeddings falhou e caímos só em palavra-chave. */
    semanticAvailable: boolean;
    query: string;
}
