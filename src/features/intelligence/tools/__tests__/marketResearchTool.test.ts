import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketResearchTool } from '../marketResearchTool.js';

describe('marketResearchTool', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.TAVILY_API_KEY;
        delete process.env.SERPER_API_KEY;
    });

    it('retorna aviso quando termo de busca é vazio', async () => {
        const result = await marketResearchTool.invoke({ query: '   ' });
        expect(result).toContain('Por favor, forneça um termo válido');
    });

    it('executa busca com Tavily quando TAVILY_API_KEY está configurada', async () => {
        process.env.TAVILY_API_KEY = 'mock-tavily-key';

        const mockResponse = {
            answer: 'A Loggi é uma empresa de tecnologia focada em soluções de logística.',
            results: [
                {
                    title: 'Loggi - Entregas para todo o Brasil',
                    url: 'https://www.loggi.com',
                    content: 'Soluções de transporte e frete expresso para e-commerce.',
                    raw_content: 'A Loggi conecta empresas a entregadores parceiros...',
                },
            ],
        };

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        } as Response);

        const result = await marketResearchTool.invoke({ query: 'Loggi tecnologia logística' });

        expect(fetchSpy).toHaveBeenCalledWith('https://api.tavily.com/search', expect.anything());
        expect(result).toContain('Tavily Search Intelligence');
        expect(result).toContain('A Loggi é uma empresa de tecnologia');
        expect(result).toContain('Loggi - Entregas para todo o Brasil');
        expect(result).toContain('https://www.loggi.com');
    });

    it('aciona fallback DuckDuckGo quando Tavily não está configurada', async () => {
        const mockHtml = `
            <div class="result results_links">
                <h2><a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.fedex.com%2Fbr">FedEx Brasil</a></h2>
                <a class="result__snippet" href="#">Serviços de transporte expresso internacional e nacional.</a>
            </div>
        `;

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            text: async () => mockHtml,
        } as Response);

        const result = await marketResearchTool.invoke({ query: 'FedEx Brasil' });

        expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('duckduckgo.com'), expect.anything());
        expect(result).toContain('DuckDuckGo Web Engine');
        expect(result).toContain('FedEx Brasil');
        expect(result).toContain('https://www.fedex.com/br');
    });

    it('retorna mensagem defensiva quando nenhum resultado é encontrado', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            text: async () => '<html><body>Sem resultados</body></html>',
        } as Response);

        const result = await marketResearchTool.invoke({ query: 'termo_super_estranho_123456' });
        expect(result).toContain('não retornou fontes indexadas no momento');
    });
});
