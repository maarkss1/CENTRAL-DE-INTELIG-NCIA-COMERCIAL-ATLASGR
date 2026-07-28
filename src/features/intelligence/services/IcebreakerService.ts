import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';

export class IcebreakerService {
    /**
     * Busca as últimas notícias sobre a empresa na web e usa a IA para gerar um quebra-gelo comercial.
     */
    async generateIcebreaker(companyName: string): Promise<string> {
        if (!companyName) return '';

        try {
            // Passo 1: Buscar notícias via DuckDuckGo HTML
            const q = encodeURIComponent(`"${companyName}" notícias OR news`);
            const url = `https://html.duckduckgo.com/html/?q=${q}`;
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
                },
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (!res.ok) {
                return ''; // Falha silenciosa para não travar o enriquecimento
            }

            const html = await res.text();
            
            // Extrair os snippets dos resultados da busca (classe genérica no DDG HTML)
            const snippetMatches = [...html.matchAll(/class="result__snippet[^>]*>([\s\S]*?)<\/a>/g)];
            let snippets = snippetMatches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
            
            if (snippets.length === 0) {
                // Tenta outro padrão comum no DDG HTML mais recente
                const altMatches = [...html.matchAll(/class="result__snippet[^>]*>([\s\S]*?)<\/div>/g)];
                snippets = altMatches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
            }

            if (snippets.length === 0) {
                return ''; // Nenhuma notícia encontrada
            }

            // Usar apenas os primeiros 5 resultados para não sobrecarregar o token limit
            const topContext = snippets.slice(0, 5).join('\n\n');

            // Passo 2: Gerar o quebra-gelo com a IA (Groq/Gemini via litellm)
            const model = getAiModel('gemini-flash', 0.5, 'icebreaker');
            const startTime = Date.now();
            
            const systemPrompt = `Você é um SDR B2B sênior. 
Com base nos recortes de notícias recentes abaixo sobre a empresa "${companyName}", escreva UM parágrafo curto (máx 2-3 frases) de "quebra-gelo" para ser usado no início de um e-mail de prospecção. 
O quebra-gelo deve ser natural, parabenizando ou comentando sobre um fato positivo recente.
SE os recortes não contiverem nenhuma notícia positiva ou útil (apenas informações genéricas ou negativas de reclamações), responda APENAS com a palavra VAZIO. Não invente notícias.`;

            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Recortes de busca web:\n${topContext}`)
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
            });

            const icebreaker = response.content.trim();
            if (icebreaker === 'VAZIO' || icebreaker.toLowerCase() === 'vazio') {
                return '';
            }

            return icebreaker;
        } catch (error) {
            console.error('[IcebreakerService] Falha ao gerar quebra-gelo:', error);
            return '';
        }
    }
}
