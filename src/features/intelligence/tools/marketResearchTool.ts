import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../../lib/logger.js';

interface SearchResultItem {
    title: string;
    url: string;
    snippet: string;
    content?: string;
    source: 'tavily' | 'duckduckgo' | 'serper';
}

function cleanHtmlText(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Busca de mercado via Tavily API (quando configurada).
 */
async function searchViaTavily(query: string, apiKey: string): Promise<{ answer?: string; results: SearchResultItem[] }> {
    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: 'advanced',
            include_answer: true,
            include_images: false,
            include_raw_content: true,
            max_results: 5,
        }),
        signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
        throw new Error(`Tavily API HTTP ${response.status}`);
    }

    const data = await response.json() as {
        answer?: string;
        results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string }>;
    };

    const results: SearchResultItem[] = (data.results || []).map((r) => ({
        title: r.title || 'Sem título',
        url: r.url || '',
        snippet: r.content || '',
        content: r.raw_content ? r.raw_content.slice(0, 1500) : undefined,
        source: 'tavily' as const,
    }));

    return { answer: data.answer, results };
}

/**
 * Busca de mercado via Serper Google API (quando configurada).
 */
async function searchViaSerper(query: string, apiKey: string): Promise<{ results: SearchResultItem[] }> {
    const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num: 5 }),
        signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
        throw new Error(`Serper API HTTP ${response.status}`);
    }

    const data = await response.json() as {
        organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };

    const results: SearchResultItem[] = (data.organic || []).map((r) => ({
        title: r.title || 'Sem título',
        url: r.link || '',
        snippet: r.snippet || '',
        source: 'serper' as const,
    }));

    return { results };
}

/**
 * Busca web pública e gratuita via DuckDuckGo HTML — fallback zero-configuracao e resiliente.
 */
async function searchViaDuckDuckGo(query: string): Promise<{ results: SearchResultItem[] }> {
    const encoded = encodeURIComponent(query);
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `q=${encoded}&b=`,
        signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
        throw new Error(`DuckDuckGo HTTP ${response.status}`);
    }

    const html = await response.text();
    const results: SearchResultItem[] = [];

    // Extrai links e snippets dos blocos <div class="result ...">
    const resultBlocks = html.split(/<div\s+class="[^"]*result\s+results_links[^"]*"[^>]*>/i).slice(1);

    for (const block of resultBlocks.slice(0, 5)) {
        // Título e URL
        const titleMatch = block.match(/<a\s+class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
            || block.match(/<a\s+class="result__snippet"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
            || block.match(/<a\s+href="([^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/i);

        const headingMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
        const snippetMatch = block.match(/<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
            || block.match(/<div\s+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);

        let url = titleMatch ? titleMatch[1] : '';
        // Trata redirecionamento do DuckDuckGo (//duckduckgo.com/l/?uddg=URL)
        if (url.includes('uddg=')) {
            const uddgMatch = url.match(/uddg=([^&]+)/);
            if (uddgMatch) {
                try {
                    url = decodeURIComponent(uddgMatch[1]);
                } catch {
                    // Mantém URL original se falhar decode
                }
            }
        }
        if (url.startsWith('//')) url = 'https:' + url;

        const title = cleanHtmlText(headingMatch ? headingMatch[1] : (titleMatch ? titleMatch[2] : 'Sem título'));
        const snippet = cleanHtmlText(snippetMatch ? snippetMatch[1] : '');

        if (snippet || title) {
            results.push({
                title: title || 'Resultado Web',
                url,
                snippet,
                source: 'duckduckgo',
            });
        }
    }

    return { results };
}

/**
 * Ferramenta Robusta de Pesquisa de Mercado com arquitetura Multi-Engine e Fallback Automático:
 * 1. Tavily API (profunda, estruturada e enriquecida)
 * 2. Serper / Google API (se configurada)
 * 3. DuckDuckGo Web Engine (fallback zero-config, público e resiliente)
 */
export const marketResearchTool = tool(
    async ({ query }: { query: string }) => {
        const cleanQuery = query.trim();
        if (!cleanQuery) {
            return 'Por favor, forneça um termo válido para pesquisa.';
        }

        logger.info({ query: cleanQuery }, 'Iniciando pesquisa de mercado inteligente (Multi-Engine)');

        let answer: string | undefined;
        let results: SearchResultItem[] = [];
        let engineUsed = '';

        // 1. Tavily (Prioridade máxima se chave presente)
        const tavilyKey = process.env.TAVILY_API_KEY;
        if (tavilyKey) {
            try {
                const res = await searchViaTavily(cleanQuery, tavilyKey);
                if (res.results.length > 0) {
                    results = res.results;
                    answer = res.answer;
                    engineUsed = 'Tavily Search Intelligence';
                }
            } catch (err) {
                logger.warn({ err }, 'Tavily falhou; acionando fallback de busca');
            }
        }

        // 2. Serper / Google (Se Tavily não retornou e Serper configurado)
        const serperKey = process.env.SERPER_API_KEY;
        if (results.length === 0 && serperKey) {
            try {
                const res = await searchViaSerper(cleanQuery, serperKey);
                if (res.results.length > 0) {
                    results = res.results;
                    engineUsed = 'Google Serper Engine';
                }
            } catch (err) {
                logger.warn({ err }, 'Serper falhou; acionando fallback DuckDuckGo');
            }
        }

        // 3. DuckDuckGo Web Fallback (Zero-config)
        if (results.length === 0) {
            try {
                const res = await searchViaDuckDuckGo(cleanQuery);
                if (res.results.length > 0) {
                    results = res.results;
                    engineUsed = 'DuckDuckGo Web Engine';
                }
            } catch (err) {
                logger.error({ err }, 'DuckDuckGo fallback também falhou');
            }
        }

        if (results.length === 0) {
            return `A busca na web por "${cleanQuery}" não retornou fontes indexadas no momento. Recomenda-se pesquisar com termos mais amplos (ex.: "notícias da empresa ${cleanQuery}").`;
        }

        // Monta relatório executivo de inteligência comercial
        let finalReport = `### 🌐 Inteligência de Mercado: "${cleanQuery}" (Motor: ${engineUsed})\n\n`;

        if (answer) {
            finalReport += `> **Síntese Direta de IA:** ${answer}\n\n`;
        }

        finalReport += `**Fontes Reais Encontradas (${results.length}):**\n\n`;

        results.slice(0, 4).forEach((res, i) => {
            finalReport += `**${i + 1}. ${res.title}**\n`;
            if (res.url) finalReport += `- **Link:** ${res.url}\n`;
            if (res.snippet) finalReport += `- **Resumo:** ${res.snippet}\n`;
            if (res.content) finalReport += `- **Contexto Extraído:** ${res.content.slice(0, 600)}...\n`;
            finalReport += '\n';
        });

        return finalReport.trim();
    },
    {
        name: 'market_research',
        description: 'Pesquisa DADOS REAIS e ATUAIS na internet. Use esta ferramenta para pesquisar notícias recentes sobre uma empresa, descobrir concorrentes de um lead, buscar o perfil corporativo de um prospect, validar CNPJ/segmento ou encontrar informações de mercado. Conta com múltiplos motores de busca com contingência automática.',
        schema: z.object({
            query: z.string().describe('O termo exato de busca, ex: "notícias recentes sobre a empresa Loggi" ou "concorrentes da FedEx no Brasil"'),
        }),
    }
);
