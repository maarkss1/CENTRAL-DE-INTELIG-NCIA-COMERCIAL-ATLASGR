import { logger } from '../../../lib/logger';
import { fetchWithProviderRetry } from '../../../lib/enrichment/providerFetch.js';
import { withProviderCache, buildProviderCacheKey } from './providerCache.js';

/**
 * YouTube oEmbed (endpoint público oficial, sem chave de API) — devolve metadados de UM vídeo já
 * conhecido (título, canal, thumbnail). Diferente de Google Places/Apollo/Hunter, isto NÃO é uma
 * busca por palavra-chave: a Data API v3 do YouTube (que faz busca por termo) exige uma chave
 * própria (YOUTUBE_API_KEY), fora do escopo "sem chave" desta ferramenta — ver
 * NotConfiguredBanner/comentário em YoutubeTool.tsx. Documentado aqui em vez de simulado com
 * scraping de HTML (frágil, contra os termos de uso, e quebraria sem aviso).
 */

const YOUTUBE_OEMBED_URL = 'https://www.youtube.com/oembed';

export interface YoutubeVideoInfo {
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  videoUrl: string;
}

interface YoutubeOEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

function isYoutubeUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return /(^|\.)(youtube\.com|youtu\.be)$/i.test(hostname);
  } catch {
    return false;
  }
}

export async function getYoutubeVideoInfo(
  url: string,
): Promise<{ info: YoutubeVideoInfo | null; error?: string }> {
  const trimmed = url.trim();
  if (!trimmed) return { info: null };
  if (!isYoutubeUrl(trimmed)) {
    return { info: null, error: 'Informe uma URL do YouTube (youtube.com ou youtu.be).' };
  }

  const cacheKey = buildProviderCacheKey('youtube', 'oembed', { url: trimmed });
  return withProviderCache(cacheKey, () => getYoutubeVideoInfoUncached(trimmed), {
    shouldCache: (result) => !result.error,
  });
}

async function getYoutubeVideoInfoUncached(
  url: string,
): Promise<{ info: YoutubeVideoInfo | null; error?: string }> {
  try {
    const params = new URLSearchParams({ url, format: 'json' });
    const res = await fetchWithProviderRetry(
      `${YOUTUBE_OEMBED_URL}?${params.toString()}`,
      {},
      { timeoutMs: 8_000, providerName: 'YouTube-oEmbed', allowedHosts: ['www.youtube.com'] },
    );
    if (!res.ok) {
      if (res.status === 404 || res.status === 401) {
        return { info: null, error: 'Vídeo não encontrado, privado ou removido.' };
      }
      const text = await res.text().catch(() => '');
      return {
        info: null,
        error: `YouTube oEmbed respondeu ${res.status}: ${text.slice(0, 150)}`,
      };
    }
    const data = (await res.json()) as YoutubeOEmbedResponse;
    if (!data.title)
      return { info: null, error: 'Resposta do YouTube sem título — tente outro link.' };
    return {
      info: {
        title: data.title,
        authorName: data.author_name || '',
        authorUrl: data.author_url || '',
        thumbnailUrl: data.thumbnail_url || '',
        videoUrl: url,
      },
    };
  } catch (error) {
    logger.error({ err: error, url }, 'Error querying YouTube oEmbed');
    return {
      info: null,
      error: error instanceof Error ? error.message : 'Falha ao consultar o YouTube',
    };
  }
}
