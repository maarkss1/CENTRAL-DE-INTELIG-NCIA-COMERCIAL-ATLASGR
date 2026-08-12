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

            const model = getAiModel('local-llama3-fast', 0.5, 'icebreaker');
            const startTime = Date.now();

            const systemPrompt = `Você é um SDR Outbound B2B de Ultra-Performance.
Os recortes de busca abaixo são contexto externo da empresa alvo.
Escreva UM GATILHO DE ABORDAGEM (Hook) brutalmente personalizado de no máximo 2 frases para ser usado na abertura de um Cold E-mail ou Cold WhatsApp.
- O gatilho DEVE conectar uma informação encontrada sobre a empresa com uma dor potencial de logística (ex: roubo de carga, custo de frete, ineficiência de frota).
- Nunca diga "Vi que recentemente..." ou "Gostaria de falar sobre...". Comece direto com o insight ou a pergunta de impacto.
- Não invente dados. Se não houver contexto útil nos recortes, responda EXATAMENTE com a palavra VAZIO.`;

            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Empresa alvo: ${companyName}\n\nRecortes da Web (DuckDuckGo):\n${topContext}`),
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
