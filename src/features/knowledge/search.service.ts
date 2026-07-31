import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { generateEmbedding } from '../../lib/ai/gateway.js';
import { toVectorLiteral } from './ingestion.service.js';
import { hasVectorSupport } from './vector-support.js';

/** Constante de suavização do Reciprocal Rank Fusion. 60 é o valor do paper original (Cormack et al.). */
const RRF_K = 60;

/** Quantos candidatos cada estratégia traz antes da fusão. Maior que o `limit` final de propósito. */
const CANDIDATES_PER_STRATEGY = 20;

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
    /** Score final de fusão — só faz sentido comparado aos outros hits da mesma consulta. */
    score: number;
}

export interface SearchResponse {
    hits: SearchHit[];
    /** `false` quando o provedor de embeddings falhou e caímos só em palavra-chave. */
    semanticAvailable: boolean;
    query: string;
}

interface RawRow {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    content: string;
    chunkIndex: number;
    similarity?: number;
}

export class SearchService {
    /**
     * Busca híbrida na Base de Conhecimento do tenant.
     *
     * Combina similaridade vetorial (pgvector, cosseno) com casamento textual do Postgres e funde
     * os dois rankings por RRF. As duas metades se cobrem: o vetorial acha "como reduzir sinistro"
     * num texto que fala de "roubo de carga", e o textual acha código de produto e CNPJ, que o
     * embedding costuma errar.
     *
     * Importante: as queries abaixo são cruas, e a extensão de RLS do Prisma só intercepta operações
     * de model — por isso o `organizationId` entra explicitamente no WHERE de cada uma. Sem isso a
     * busca vazaria documentos entre organizações.
     */
    async hybridSearch(organizationId: string, query: string, limit = 8): Promise<SearchResponse> {
        const trimmed = query.trim();
        if (!trimmed) {
            return { hits: [], semanticAvailable: true, query: trimmed };
        }

        const [semanticRows, keywordRows] = await Promise.all([
            this.semanticSearch(organizationId, trimmed),
            this.keywordSearch(organizationId, trimmed),
        ]);

        const semanticAvailable = semanticRows !== null;
        const fused = this.fuse(semanticRows ?? [], keywordRows);

        return {
            hits: fused.slice(0, limit),
            semanticAvailable,
            query: trimmed,
        };
    }

    /**
     * Busca vetorial. Retorna `null` (e não `[]`) quando o provedor de embeddings falha, para que o
     * chamador consiga distinguir "não achei nada" de "a busca semântica está fora do ar".
     */
    private async semanticSearch(organizationId: string, query: string): Promise<RawRow[] | null> {
        // Banco sem pgvector: nem gera o embedding, que custa uma chamada paga para nada.
        if (!(await hasVectorSupport())) return null;

        let embedding: number[];
        try {
            embedding = await generateEmbedding(query);
        } catch (err) {
            logger.warn({ err }, 'Busca semântica indisponível; usando apenas palavra-chave');
            return null;
        }

        try {
            // `<=>` é a distância de cosseno do pgvector (0 = idêntico, 2 = oposto), então a
            // similaridade é `1 - distância`.
            return await prisma.$queryRaw<RawRow[]>`
                SELECT
                    c."id"         AS "chunkId",
                    c."documentId" AS "documentId",
                    d."title"      AS "documentTitle",
                    c."content"    AS "content",
                    c."chunkIndex" AS "chunkIndex",
                    1 - (c."vector" <=> ${toVectorLiteral(embedding)}::vector) AS "similarity"
                FROM "DocumentChunk" c
                JOIN "Document" d ON d."id" = c."documentId"
                WHERE d."organizationId" = ${organizationId}
                  AND c."vector" IS NOT NULL
                ORDER BY c."vector" <=> ${toVectorLiteral(embedding)}::vector
                LIMIT ${CANDIDATES_PER_STRATEGY}
            `;
        } catch (err) {
            logger.error({ err }, 'Falha na consulta vetorial da Base de Conhecimento');
            return null;
        }
    }

    /**
     * Busca textual via full-text search do Postgres, com fallback para ILIKE.
     *
     * Usamos a configuração `portuguese` para que radicalização e stopwords funcionem no idioma dos
     * documentos. `websearch_to_tsquery` aceita a sintaxe que o usuário já conhece de buscador
     * (aspas para frase exata, `-` para excluir) sem quebrar em entrada malformada.
     */
    private async keywordSearch(organizationId: string, query: string): Promise<RawRow[]> {
        try {
            return await prisma.$queryRaw<RawRow[]>`
                SELECT
                    c."id"         AS "chunkId",
                    c."documentId" AS "documentId",
                    d."title"      AS "documentTitle",
                    c."content"    AS "content",
                    c."chunkIndex" AS "chunkIndex"
                FROM "DocumentChunk" c
                JOIN "Document" d ON d."id" = c."documentId"
                WHERE d."organizationId" = ${organizationId}
                  AND to_tsvector('portuguese', d."title" || ' ' || c."content")
                      @@ websearch_to_tsquery('portuguese', ${query})
                ORDER BY ts_rank(
                    to_tsvector('portuguese', d."title" || ' ' || c."content"),
                    websearch_to_tsquery('portuguese', ${query})
                ) DESC
                LIMIT ${CANDIDATES_PER_STRATEGY}
            `;
        } catch (err) {
            logger.warn({ err }, 'Full-text search falhou; caindo para ILIKE');
            try {
                return await prisma.$queryRaw<RawRow[]>`
                    SELECT
                        c."id"         AS "chunkId",
                        c."documentId" AS "documentId",
                        d."title"      AS "documentTitle",
                        c."content"    AS "content",
                        c."chunkIndex" AS "chunkIndex"
                    FROM "DocumentChunk" c
                    JOIN "Document" d ON d."id" = c."documentId"
                    WHERE d."organizationId" = ${organizationId}
                      AND (c."content" ILIKE ${'%' + query + '%'} OR d."title" ILIKE ${'%' + query + '%'})
                    LIMIT ${CANDIDATES_PER_STRATEGY}
                `;
            } catch (fallbackErr) {
                logger.error({ err: fallbackErr }, 'Busca por palavra-chave falhou');
                return [];
            }
        }
    }

    /**
     * Reciprocal Rank Fusion: cada lista contribui `1 / (K + posição)` para o score do trecho.
     * A vantagem sobre somar os scores brutos é não precisar normalizar escalas incomparáveis
     * (similaridade de cosseno vs. ts_rank), que é exatamente o caso aqui.
     */
    private fuse(semantic: RawRow[], keyword: RawRow[]): SearchHit[] {
        const merged = new Map<string, SearchHit>();

        const absorb = (rows: RawRow[], source: 'semantic' | 'keyword') => {
            rows.forEach((row, index) => {
                const existing = merged.get(row.chunkId);
                const contribution = 1 / (RRF_K + index + 1);

                if (existing) {
                    existing.score += contribution;
                    if (!existing.matchedBy.includes(source)) existing.matchedBy.push(source);
                    if (source === 'semantic' && row.similarity != null) {
                        existing.similarity = row.similarity;
                    }
                    return;
                }

                merged.set(row.chunkId, {
                    chunkId: row.chunkId,
                    documentId: row.documentId,
                    documentTitle: row.documentTitle,
                    content: row.content,
                    chunkIndex: row.chunkIndex,
                    matchedBy: [source],
                    similarity: source === 'semantic' && row.similarity != null ? row.similarity : null,
                    score: contribution,
                });
            });
        };

        absorb(semantic, 'semantic');
        absorb(keyword, 'keyword');

        return [...merged.values()].sort((a, b) => b.score - a.score);
    }
}

export const searchService = new SearchService();
