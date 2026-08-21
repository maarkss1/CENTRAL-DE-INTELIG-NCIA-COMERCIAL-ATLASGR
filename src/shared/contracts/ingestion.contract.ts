/**
 * Fonte única de verdade para `IngestResult` — o resumo de uma ingestão de conhecimento (RAG)
 * devolvido tanto por `ingestion.service.ts` (backend) quanto consumido por `knowledge.api.ts`
 * (cliente HTTP do frontend). Até esta unificação as duas declarações eram independentes, sem
 * import compartilhado (achado do handoff
 * `.agents/handoffs/onda-8/18-para-00-varredura-duplicacao-contratos.md`, item 2).
 */
export interface IngestResult {
    id: string;
    title: string;
    chunkCount: number;
    /** Trechos que ficaram sem vetor porque o provedor de embeddings falhou. */
    embeddingFailures: number;
}
