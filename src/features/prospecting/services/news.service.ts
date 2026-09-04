import { logger } from '../../../lib/logger';
import { fetchWithTimeout } from '../../../lib/http.js';

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

export interface NewsMention {
  title: string;
  url: string;
  domain: string;
  seenAt: string;
}

interface GdeltArticle {
  title?: string;
  url?: string;
  domain?: string;
  seendate?: string;
}

interface GdeltDocResponse {
  articles?: GdeltArticle[];
}

/**
 * Busca notícias e fatos relevantes usando SearXNG (metabuscador open-source auto-hospedável).
 */
export async function searchSearXNG(query: string, maxRecords = 5): Promise<NewsMention[]> {
  const searxngUrl = process.env.SEARXNG_URL || 'http://127.0.0.1:8080';
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      language: 'pt-BR',
    });
    const res = await fetchWithTimeout(
      `${searxngUrl}/search?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
      4_000,
      // Host vem de env var (decisão do operador, não de um request) — validamos contra o
      // próprio valor configurado, não uma lista fixa (instância auto-hospedada, endereço varia).
      [new URL(searxngUrl).hostname],
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    return (data.results || [])
      .slice(0, maxRecords)
      .filter((r): r is { title: string; url: string } => Boolean(r.title && r.url))
      .map((r) => {
        let domain = 'searxng';
        try {
          domain = new URL(r.url).hostname;
        } catch {
          /* ignore */
        }
        return {
          title: r.title,
          url: r.url,
          domain,
          seenAt: new Date().toISOString(),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Busca menções recentes da empresa na imprensa via SearXNG ou GDELT (índice global de notícias, gratuito,
 * sem chave, atualizado a cada 15min). `sourcelang:por` restringe a fontes em português — o
 * público-alvo é o mercado brasileiro.
 */
export async function searchCompanyNews(companyName: string): Promise<NewsMention[]> {
  const name = (companyName || '').trim();
  if (name.length < 5) return [];

  // Tenta primeiro a instância de metabusca SearXNG (se configurada / disponível)
  if (process.env.SEARXNG_URL) {
    const searxResults = await searchSearXNG(`"${name}" notícias transporte logística`, 5);
    if (searxResults.length > 0) return searxResults;
  }

  const params = new URLSearchParams({
    query: `"${name}" sourcelang:por`,
    mode: 'artlist',
    format: 'json',
    maxrecords: '5',
    sort: 'hybridrel',
    timespan: '6m',
  });

  try {
    const res = await fetchWithTimeout(
      `${GDELT_DOC_API}?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
      10_000,
      ['api.gdeltproject.org'],
    );

    if (!res.ok) {
      logger.error({ status: res.status, companyName }, 'GDELT news search error');
      return [];
    }

    // O GDELT devolve corpo vazio (não `{"articles":[]}`) quando não há nenhuma menção —
    // `JSON.parse('')` derrubaria o enriquecimento inteiro se não tratássemos isso antes.
    const text = await res.text();
    if (!text.trim()) return [];

    const data = JSON.parse(text) as GdeltDocResponse;
    return (data.articles || [])
      .filter((a): a is Required<GdeltArticle> => Boolean(a.title && a.url && a.domain))
      .map((a) => ({
        title: a.title,
        url: a.url,
        domain: a.domain,
        seenAt: a.seendate || '',
      }));
  } catch (error) {
    logger.error({ err: error, companyName }, 'Error searching GDELT news');
    return [];
  }
}
