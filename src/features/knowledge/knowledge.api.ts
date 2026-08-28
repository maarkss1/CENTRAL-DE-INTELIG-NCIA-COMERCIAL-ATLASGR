import { api } from '../../lib/api';
import type { IngestResult } from '../../shared/contracts/ingestion.contract';

export type { IngestResult };

export interface KnowledgeDocumentSummary {
    id: string;
    title: string;
    sourceType: string;
    sourceName: string | null;
    chunkCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface KnowledgeSearchHit {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    content: string;
    chunkIndex: number;
    matchedBy: Array<'semantic' | 'keyword'>;
    similarity: number | null;
    score: number;
    /** Pontuação (0-100) do estágio de reranking via LLM (DEC-11), quando habilitado no backend. */
    rerankScore?: number;
}

export interface KnowledgeSearchResponse {
    hits: KnowledgeSearchHit[];
    semanticAvailable: boolean;
    query: string;
}

/**
 * Extensões aceitas pelo backend (ver `extractText` em knowledge.routes.ts). `.doc` binário
 * legado fica de fora por decisão deliberada (onda 42, CPI DEC-10 opção A) — ver o comentário de
 * `extractText` e o handoff `.agents/handoffs/onda-42/04-para-00-dependencias-parsing-pdf-docx.md`.
 */
export const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json', '.docx', '.pdf', '.html', '.htm'];

export const knowledgeApi = {
    list: () => api.get<KnowledgeDocumentSummary[]>('/api/knowledge'),

    // Mesmo pipeline de chunking + embedding do /upload (1 embedding por trecho) — texto colado
    // grande pode gerar tantos trechos quanto um arquivo, então precisa da mesma folga de timeout.
    ingestText: (title: string, content: string) =>
        api.post<IngestResult>('/api/knowledge', { title, content }, { timeoutMs: 180_000 }),

    /**
     * Ingestão a partir de arquivo. O upload vai como base64 num JSON comum porque o servidor não
     * tem middleware de multipart — o limite do `express.json` (`JSON_BODY_LIMIT` em
     * `src/config/env.ts`, hoje 2mb por padrão) é o teto efetivo, já apertado o bastante para conter
     * um PDF/DOCX gigante travando o parsing no servidor (ver `MAX_PDF_PAGES` em
     * `knowledge.routes.ts` para a defesa adicional contra PDFs com páginas em excesso).
     */
    upload: (fileName: string, base64: string, title?: string) =>
        api.post<IngestResult>('/api/knowledge/upload', { fileName, data: base64, title }, {
            // Ingestão gera um embedding por trecho; o timeout padrão de 15s não cobre um documento
            // grande, então damos folga apenas nesta chamada.
            timeoutMs: 180_000,
        }),

    search: (query: string, limit?: number) =>
        api.post<KnowledgeSearchResponse>('/api/knowledge/search', { query, limit }, {
            timeoutMs: 45_000,
        }),

    reembed: (id: string) =>
        api.post<{ repaired: number; remaining: number }>(`/api/knowledge/${id}/reembed`, undefined, {
            timeoutMs: 180_000,
        }),

    remove: (id: string) => api.delete<void>(`/api/knowledge/${id}`),
};

/** Lê um File como base64 puro (sem o prefixo `data:...;base64,`). */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(',');
            resolve(comma === -1 ? result : result.slice(comma + 1));
        };
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        reader.readAsDataURL(file);
    });
}
