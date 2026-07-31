import { logger } from '../../../lib/logger.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';

// Playwright é opcional em produção: pode não estar instalado no container mínimo.
// Importamos de forma assíncrona e defensiva para não quebrar o boot da aplicação.
type PlaywrightChromium = typeof import('playwright').chromium;
let _chromium: PlaywrightChromium | null = null;

async function getChromium(): Promise<PlaywrightChromium | null> {
    if (_chromium !== null) return _chromium;
    try {
        // 'playwright' é o pacote de produção; '@playwright/test' é só para testes.
        const pw = await import('playwright');
        _chromium = pw.chromium;
        return _chromium;
    } catch {
        logger.warn('Playwright não está instalado — IcebreakerService funcionará sem scraping.');
        _chromium = null;
        return null;
    }
}

export class IcebreakerService {
    /**
     * Busca recortes públicos avançados (via Playwright headless) e usa a IA
     * para gerar um quebra-gelo comercial denso e personalizado.
     * Retorna string vazia se Playwright não estiver disponível ou se não houver
     * contexto relevante sobre a empresa.
     */
    async generateIcebreaker(companyName: string): Promise<string> {
        if (!companyName) return '';

        const chromium = await getChromium();
        if (!chromium) return '';

        let browser;
        try {
            // Scraping headless robusto para contornar bloqueios de bots simples
            browser = await chromium.launch({ headless: true });
            const context = await browser.newContext();
            const page = await context.newPage();

            const q = encodeURIComponent(`"${companyName}" notícias recentes logística transporte`);
            await page.goto(`https://duckduckgo.com/html/?q=${q}`, { timeout: 10000 });

            // Extrai as descrições dos resultados reais no DuckDuckGo
            const snippets = await page.evaluate(() => {
                const results = document.querySelectorAll('.result__snippet');
                return Array.from(results).map(el => el.textContent?.trim()).filter(Boolean);
            });

            if (!snippets || snippets.length === 0) {
                return '';
            }

            const topContext = snippets.slice(0, 5).join('\n\n');

            const model = getAiModel('gemini-flash', 0.5, 'icebreaker');
            const startTime = Date.now();

            const systemPrompt = `Você é um SDR B2B sênior hiper-personalizado.
Os recortes de busca abaixo são contexto externo.
Escreva UM parágrafo curto (máx. 2-3 frases) de quebra-gelo somente se houver um fato positivo ou desafio logístico claro sobre a empresa alvo.
Não chame o fato de "recente" sem data. Não invente dados.
Se não tiver contexto forte, responda APENAS com a palavra VAZIO.`;

            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Empresa alvo: ${companyName}\n\nRecortes extraídos da Web:\n${topContext}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
            });

            const icebreaker = (response.content as string).trim();
            if (icebreaker.toUpperCase() === 'VAZIO') {
                return '';
            }

            return icebreaker;
        } catch (error) {
            logger.error({ err: error, companyName }, 'Falha ao gerar quebra-gelo via Playwright');
            return '';
        } finally {
            if (browser) await browser.close();
        }
    }
}
