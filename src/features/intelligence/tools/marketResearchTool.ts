import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../../../lib/logger.js';

/**
 * Ferramenta Robusta de Pesquisa de Mercado com Tavily API
 */
export const marketResearchTool = tool(
    async ({ query }: { query: string }) => {
        try {
            logger.info({ query }, 'Iniciando pesquisa de mercado (Tavily API)');
            
            const apiKey = process.env.TAVILY_API_KEY;
            
            if (!apiKey) {
                logger.warn('TAVILY_API_KEY não configurada. A pesquisa de mercado falhará.');
                return 'A ferramenta de pesquisa na web está temporariamente indisponível (Chave da API Tavily não configurada).';
            }

            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    query: query,
                    search_depth: "advanced",
                    include_answer: true,
                    include_images: false,
                    include_raw_content: true,
                    max_results: 3,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error({ status: response.status, errorText }, 'Falha na API da Tavily');
                return `Erro ao realizar a pesquisa na web: Falha na comunicação com o servidor de buscas (Status ${response.status}).`;
            }

            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                return 'A busca na web não retornou nenhum resultado. Tente pesquisar com termos mais amplos.';
            }

            let finalReport = `Resultados da Pesquisa para: "${query}"\n\n`;
            
            if (data.answer) {
                finalReport += `Resposta Direta da IA: ${data.answer}\n\n`;
            }

            for (let i = 0; i < data.results.length; i++) {
                const result = data.results[i];
                finalReport += `--- Fonte ${i + 1}: ${result.title} ---\n`;
                finalReport += `URL: ${result.url}\n`;
                finalReport += `Resumo Rápido: ${result.content}\n\n`;
                
                if (result.raw_content) {
                    // Limita o raw_content para não estourar tokens do contexto do agente
                    const cleanContent = result.raw_content.substring(0, 2000);
                    finalReport += `Conteúdo Extraído da Página:\n${cleanContent}\n\n`;
                }
            }

            return finalReport;
        } catch (error) {
            logger.error({ err: error, query }, 'Erro fatal na pesquisa de mercado');
            return `Erro ao realizar a pesquisa na web: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: 'market_research',
        description: 'Pesquisa DADOS REAIS e ATUAIS na internet. Use esta ferramenta para pesquisar notícias recentes sobre uma empresa, descobrir concorrentes de um lead, buscar o perfil corporativo de um prospect, ou validar informações de mercado que você desconhece. Esta ferramenta LÊ o conteúdo real dos sites encontrados via Tavily.',
        schema: z.object({
            query: z.string().describe('O termo exato de busca, ex: "notícias recentes sobre a empresa Loggi" ou "concorrentes da FedEx no Brasil"'),
        }),
    }
);
