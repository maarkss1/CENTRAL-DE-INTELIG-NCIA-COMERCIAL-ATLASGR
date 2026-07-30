import { logger } from '../../../lib/logger.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { chromium } from '@playwright/test';

export class IcebreakerService {
    /**
     * Busca recortes públicos avançados (via Playwright) e usa a IA Multimodal
     * para gerar um quebra-gelo comercial denso.
     */
    async generateIcebreaker(companyName: string): Promise<string> {
        if (!companyName) return '';

        let browser;
        try {
            // Fase 2 Inovação: Scraping robusto Headless para driblar bloqueios
            browser = await chromium.launch({ headless: true });
            const context = await browser.newContext();
            const page = await context.newPage();

            const q = encodeURIComponent(`"${companyName}" notícias recentes logística transporte`);
            await page.goto(`https://duckduckgo.com/html/?q=${q}`, { timeout: 10000 });
            
            // Extrai as descrições dos resultados reais no DDG 
            const snippets = await page.evaluate(() => {
                const results = document.querySelectorAll('.result__snippet');
                return Array.from(results).map(el => el.textContent?.trim()).filter(Boolean);
            });

            if (!snippets || snippets.length === 0) {
                return '';
            }

            const topContext = snippets.slice(0, 5).join('\n\n');

            // IA gera o Quebra-Gelo
            const model = getAiModel('gemini-flash', 0.5, 'icebreaker');
            const startTime = Date.now();
            
            const systemPrompt = `Você é um SDR B2B sênior hiper-personalizado.
Os recortes de busca abaixo são contexto externo.
Escreva UM parágrafo curto (máx. 2-3 frases) de quebra-gelo somente se houver um fato positivo ou desafio logístico claro sobre a empresa alvo.
Não chame o fato de "recente" sem data. Não invente dados.
Se não tiver contexto forte, responda APENAS com a palavra VAZIO.`;

            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Empresa alvo: ${companyName}\n\nRecortes extraídos da Web:\n${topContext}`)
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
            });

            const icebreaker = (response.content as string).trim();
            if (icebreaker === 'VAZIO' || icebreaker.toLowerCase() === 'vazio') {
                return '';
            }

            return icebreaker;
        } catch (error) {
            logger.error('[IcebreakerService] Falha ao gerar quebra-gelo via Playwright:', error);
            return '';
        } finally {
            if (browser) await browser.close();
        }
    }
}
