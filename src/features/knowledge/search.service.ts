import { withRlsContext } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { generateEmbedding } from '../../lib/ai/gateway.js';
import { fetchWithTimeout } from '../../lib/http.js';
import { toVectorLiteral } from './ingestion.service.js';
import { hasVectorSupport } from './vector-support.js';
import { env } from '../../config/env.js';
import { rerankerService } from './services/reranker.service.js';
import type { SearchHit, SearchResponse } from './knowledge.types.js';

export type { SearchHit, SearchResponse } from './knowledge.types.js';

/** Constante de suavização do Reciprocal Rank Fusion. 60 é o valor do paper original (Cormack et al.). */
const RRF_K = 60;

/** Quantos candidatos cada estratégia traz antes da fusão. Maior que o `limit` final de propósito. */
const CANDIDATES_PER_STRATEGY = 20;

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
   * de model — por isso rodam via `withRlsContext` (seta app.current_tenant_id na transação) E
   * também filtram `organizationId` explicitamente no WHERE. As duas camadas são redundantes de
   * propósito: sem a primeira, a RLS com FORCE simplesmente devolve zero linhas sempre (silencioso,
   * sem erro) mesmo com o WHERE certo; sem a segunda, um bug futuro no contexto de tenant vazaria
   * documentos entre organizações.
   */
  async hybridSearch(organizationId: string, query: string, limit = 8): Promise<SearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { hits: [], semanticAvailable: true, query: trimmed };
    }

    // Tenta primeiro o Meilisearch (engine open-source ultrarrápida <10ms) se MEILISEARCH_URL estiver configurada.
    // DEC-11: o reranking (`applyReranking` abaixo) roda só sobre o resultado do RRF de propósito
    // — este ramo é um motor de retrieval totalmente diferente (BM25 do Meilisearch, sem RRF) que
    // já busca exatamente `limit` resultados, não uma janela de candidatos maior para reordenar.
    if (process.env.MEILISEARCH_URL) {
      const meiliHits = await this.searchMeilisearch(organizationId, trimmed, limit);
      if (meiliHits && meiliHits.length > 0) {
        return { hits: meiliHits, semanticAvailable: true, query: trimmed };
      }
    }

    const [semanticRows, keywordRows] = await Promise.all([
      this.semanticSearch(organizationId, trimmed),
      this.keywordSearch(organizationId, trimmed),
    ]);

    const semanticAvailable = semanticRows !== null;
    const fused = this.fuse(semanticRows ?? [], keywordRows);
    const reordered = await this.applyReranking(trimmed, fused);

    return {
      hits: reordered.slice(0, limit),
      semanticAvailable,
      query: trimmed,
    };
  }

  /**
   * DEC-11 (dossiê CPI, opção A): reordena os top-N candidatos já fundidos pelo RRF via
   * `rerankerService` (ver `./services/reranker.service.ts` para a justificativa LLM vs.
   * cross-encoder e o fallback fail-safe interno). Só a janela de `KNOWLEDGE_RERANK_CANDIDATES`
   * primeiros candidatos paga o custo de IA — o restante (além dessa janela) mantém a ordem do
   * RRF sem chamada adicional, porque `hybridSearch` normalmente já corta bem antes disso
   * (`limit` default 8 < janela padrão 20).
   *
   * Se o reranking estiver desligado (`KNOWLEDGE_RERANK_ENABLED=false`, o padrão) ou a chamada
   * falhar, `rerankerService.rerank` já devolve a janela na ordem original do RRF — este método
   * nunca lança, então uma falha de reranking nunca derruba a busca inteira.
   */
  private async applyReranking(query: string, fused: SearchHit[]): Promise<SearchHit[]> {
    if (fused.length === 0) return fused;

    const window = fused.slice(0, env.KNOWLEDGE_RERANK_CANDIDATES);
    const remainder = fused.slice(env.KNOWLEDGE_RERANK_CANDIDATES);
    const reranked = await rerankerService.rerank(query, window, window.length);
    return [...reranked, ...remainder];
  }

  /**
   * Busca ultrarrápida via Meilisearch (engine open-source auto-hospedável), se MEILISEARCH_URL estiver configurada.
   */
  private async searchMeilisearch(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<SearchHit[] | null> {
    const meilisearchUrl = process.env.MEILISEARCH_URL;
    if (!meilisearchUrl) return null;
    try {
      const apiKey = process.env.MEILISEARCH_KEY || '';
      const res = await fetchWithTimeout(
        `${meilisearchUrl}/indexes/knowledge_chunks/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ q: query, filter: `organizationId = "${organizationId}"`, limit }),
        },
        3_000,
        // Host vem de env var (decisão do operador, não de um request) — validamos contra o
        // próprio valor configurado, não uma lista fixa (instância auto-hospedada, endereço varia).
        [new URL(meilisearchUrl).hostname],
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        hits?: Array<{
          chunkId?: string;
          documentId?: string;
          documentTitle?: string;
          content?: string;
          chunkIndex?: number;
        }>;
      };
      if (!data.hits || data.hits.length === 0) return null;
      return data.hits.map((h, i) => ({
        chunkId: h.chunkId || `meili-${i}`,
        documentId: h.documentId || `doc-${i}`,
        documentTitle: h.documentTitle || 'Documento Meilisearch',
        content: h.content || '',
        chunkIndex: h.chunkIndex || 0,
        matchedBy: ['semantic', 'keyword'],
        similarity: 0.95 - i * 0.05,
        score: 1 / (RRF_K + i + 1),
      }));
    } catch {
      return null;
    }
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
      // 'query' e não 'passage': o modelo e5 distingue os dois papéis e a recuperação piora
      // sensivelmente se a consulta for embedada como se fosse um documento.
      embedding = await generateEmbedding(query, 'query');
    } catch (err) {
      logger.warn({ err }, 'Busca semântica indisponível; usando apenas palavra-chave');
      return null;
    }

    try {
      // `<=>` é a distância de cosseno do pgvector (0 = idêntico, 2 = oposto), então a
      // similaridade é `1 - distância`.
      return await withRlsContext(
        (tx) => tx.$queryRaw<RawRow[]>`
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
            `,
      );
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
      return await withRlsContext(
        (tx) => tx.$queryRaw<RawRow[]>`
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
            `,
      );
    } catch (err) {
      logger.warn({ err }, 'Full-text search falhou; caindo para ILIKE');
      try {
        return await withRlsContext(
          (tx) => tx.$queryRaw<RawRow[]>`
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
                `,
        );
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
