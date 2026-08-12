import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { search } from 'duck-duck-scrape';
import { logger } from '../../../lib/logger.js';

/**
 * Busca o conteúdo textual de uma URL e limpa o HTML desnecessário.
 */
async function scrapeUrlContent(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        
        if (!response.ok) {
            return `Falha ao carregar a página: Status ${response.status}`;
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Remove scripts, styles, navegação, rodapé, etc.
        $('script, style, noscript, iframe, img, svg, nav, footer, header, aside').remove();
        
        // Extrai o texto limpo
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        
        // Limita o tamanho para não estourar o limite de tokens do LLM (aprox 3000 caracteres)
        return text.substring(0, 3000);
    } catch (error) {
        logger.error({ err: error, url }, 'Falha ao realizar web scraping');
        return 'Erro ao acessar a página da web.';
    }
}

/**
 * Ferramenta Robusta de Pesquisa de Mercado (Web Search + Scrape)
 */
export const marketResearchTool = tool(
    async ({ query }: { query: string }) => {
        try {
            logger.info({ query }, 'Iniciando pesquisa de mercado (DuckDuckGo)');
            
            // Passo 1: Busca na web usando DuckDuckGo
            const searchResults = await search(query);
            
            if (!searchResults.results || searchResults.results.length === 0) {
                return 'A busca na web não retornou nenhum resultado. Tente pesquisar com termos mais amplos.';
            }

            // Pega os 2 primeiros resultados relevantes
            const topResults = searchResults.results.slice(0, 2);
            
            let finalReport = `Resultados da Pesquisa para: "${query}"\n\n`;
            
            // Passo 2: Faz o scrape profundo das URLs principais
            for (let i = 0; i < topResults.length; i++) {
                const result = topResults[i];
                finalReport += `--- Fonte ${i + 1}: ${result.title} ---\n`;
                finalReport += `URL: ${result.url}\n`;
                finalReport += `Resumo Rápido: ${result.description}\n\n`;
                
                // Extrai o conteúdo real da página para contexto profundo
                const scrapedContent = await scrapeUrlContent(result.url);
                finalReport += `Conteúdo da Página (Extração):\n${scrapedContent}\n\n`;
            }

            return finalReport;
        } catch (error) {
            logger.error({ err: error, query }, 'Erro fatal na pesquisa de mercado');
            return `Erro ao realizar a pesquisa na web: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: 'market_research',
        description: 'Pesquisa DADOS REAIS e ATUAIS na internet. Use esta ferramenta para pesquisar notícias recentes sobre uma empresa, descobrir concorrentes de um lead, buscar o perfil corporativo de um prospect, ou validar informações de mercado que você desconhece. Esta ferramenta LÊ o conteúdo real dos sites encontrados.',
        schema: z.object({
            query: z.string().describe('O termo exato de busca, ex: "notícias recentes sobre a empresa Loggi" ou "concorrentes da FedEx no Brasil"'),
        }),
    }
);
