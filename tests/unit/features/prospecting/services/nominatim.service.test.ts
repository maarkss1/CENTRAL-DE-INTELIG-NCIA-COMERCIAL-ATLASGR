import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    searchNominatimCandidates,
    searchNominatimPlace,
} from '../../../../../src/features/prospecting/services/nominatim.service';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Nominatim prospecting provider', () => {
    it('maps open data candidates including public contact tags', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify([
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
            ]), { status: 200 })
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
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('returns a place result suitable for free enrichment', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify([
                {
                    osm_type: 'way',
                    osm_id: 456,
                    display_name: 'Empresa Atlas, São Paulo, Brasil',
                    namedetails: { name: 'Empresa Atlas' },
                    extratags: { website: 'https://atlas.example' },
                },
            ]), { status: 200 })
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
