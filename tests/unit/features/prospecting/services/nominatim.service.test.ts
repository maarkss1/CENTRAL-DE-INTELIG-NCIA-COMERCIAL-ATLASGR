import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';
import {
    searchNominatimCandidates,
    searchNominatimPlace,
} from '../../../../../src/features/prospecting/services/nominatim.service';

afterEach(() => {
    vi.restoreAllMocks();
    server.resetHandlers();
});

describe('Nominatim prospecting provider', () => {
    it('maps open data candidates including public contact tags', async () => {
        let callCount = 0;
        server.use(
            http.get('https://nominatim.openstreetmap.org/search', () => {
                callCount += 1;
                return HttpResponse.json([
                    {
                        osm_type: 'node',
                        osm_id: 123,
                        display_name: 'Transportadora Exemplo, Ribeirão Preto, São Paulo',
                        namedetails: { name: 'Transportadora Exemplo' },
                        address: { city: 'Ribeirão Preto', state: 'São Paulo' },
                        extratags: {
                            website: 'https://example.com.br',
                            phone: '+55 16 3000-0000',
                        },
                    },
                ]);
            }),
        );

        const result = await searchNominatimCandidates(
            'transportadora em Ribeirão Preto',
            10
        );

        expect(result).toEqual([
            expect.objectContaining({
                tradeName: 'Transportadora Exemplo',
                city: 'Ribeirão Preto',
                state: 'São Paulo',
                website: 'https://example.com.br',
                phone: '+55 16 3000-0000',
            }),
        ]);
        expect(callCount).toBe(1);
    });

    it('returns a place result suitable for free enrichment', async () => {
        server.use(
            http.get('https://nominatim.openstreetmap.org/search', () =>
                HttpResponse.json([
                    {
                        osm_type: 'way',
                        osm_id: 456,
                        display_name: 'Empresa Atlas, São Paulo, Brasil',
                        namedetails: { name: 'Empresa Atlas' },
                        extratags: { website: 'https://atlas.example' },
                    },
                ]),
            ),
        );

        await expect(searchNominatimPlace('Empresa Atlas', 'São Paulo')).resolves.toEqual(
            expect.objectContaining({
                id: 'osm:way:456',
                displayName: 'Empresa Atlas',
                websiteUri: 'https://atlas.example',
            })
        );
    });
});
