import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';
import { searchCompanyNews } from '../../../../../src/features/prospecting/services/news.service';

afterEach(() => {
    vi.restoreAllMocks();
    server.resetHandlers();
});

describe('GDELT news provider', () => {
    it('returns nothing for a company name too short to search safely', async () => {
        const result = await searchCompanyNews('Ok');
        expect(result).toEqual([]);
    });

    it('maps GDELT articles into news mentions', async () => {
        server.use(
            http.get('https://api.gdeltproject.org/api/v2/doc/doc', () =>
                HttpResponse.json({
                    articles: [
                        {
                            title: 'Transportadora Exemplo expande frota',
                            url: 'https://noticias.example.com/transportadora-exemplo',
                            domain: 'noticias.example.com',
                            seendate: '20260115T120000Z',
                        },
                        // artigo sem título/url/domínio deve ser descartado, não quebrar o mapeamento
                        { seendate: '20260110T120000Z' },
                    ],
                })
            )
        );

        const result = await searchCompanyNews('Transportadora Exemplo');

        expect(result).toEqual([
            {
                title: 'Transportadora Exemplo expande frota',
                url: 'https://noticias.example.com/transportadora-exemplo',
                domain: 'noticias.example.com',
                seenAt: '20260115T120000Z',
            },
        ]);
    });

    it('treats an empty response body as "no mentions" instead of throwing', async () => {
        server.use(
            http.get('https://api.gdeltproject.org/api/v2/doc/doc', () => new HttpResponse('', { status: 200 }))
        );

        await expect(searchCompanyNews('Transportadora Exemplo')).resolves.toEqual([]);
    });

    it('fails safe (empty array) on upstream error', async () => {
        server.use(
            http.get('https://api.gdeltproject.org/api/v2/doc/doc', () => new HttpResponse(null, { status: 500 }))
        );

        await expect(searchCompanyNews('Transportadora Exemplo')).resolves.toEqual([]);
    });
});
