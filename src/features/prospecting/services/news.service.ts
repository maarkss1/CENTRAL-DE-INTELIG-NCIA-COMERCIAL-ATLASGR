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
 * Busca menções recentes da empresa na imprensa via GDELT (índice global de notícias, gratuito,
 * sem chave, atualizado a cada 15min). `sourcelang:por` restringe a fontes em português — o
 * público-alvo é o mercado brasileiro. Nomes muito curtos são ignorados: a API já faz busca por
 * frase exata (entre aspas), mas nomes de 1-4 letras ainda geram ruído demais para servir de sinal.
 */
export async function searchCompanyNews(companyName: string): Promise<NewsMention[]> {
    const name = (companyName || '').trim();
    if (name.length < 5) return [];

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
            10_000
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
