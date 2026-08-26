/**
 * `places.service.ts` não tinha teste dedicado. Cobre o achado corrigido (Onda 2, Agente 05):
 * `searchGooglePlace` devolvia `null` tanto para "não achamos esse lugar" quanto para "a Google
 * Places quebrou" (401/500/timeout) — indistinguível para quem chama. `searchGooglePlaceDetailed`
 * (usado por `enrichmentCascade.service.ts`) separa os dois casos via `.error`; `searchGooglePlace`
 * é mantido por compatibilidade com `enrichment.service.ts` e continua devolvendo `null` nos dois
 * casos (verificado abaixo para não quebrar o chamador existente).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { searchGooglePlace, searchGooglePlaceDetailed } from '@/features/prospecting/services/places.service.js';

function jsonResponse(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status });
}

const originalEnv = { ...process.env };

beforeEach(() => {
    process.env.PROSPECTING_PROVIDER_MODE = 'hybrid';
    process.env.GOOGLE_MAPS_API_KEY = 'test-places-key';
});

afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
});

describe('searchGooglePlaceDetailed', () => {
    it('devolve o lugar encontrado, sem error', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, { places: [{ id: 'place-1', displayName: { text: 'Transportadora Exemplo' }, rating: 4.5 }] })
        );
        vi.stubGlobal('fetch', fetchMock);

        const { place, error } = await searchGooglePlaceDetailed('Transportadora Exemplo', 'São Paulo, SP');

        expect(error).toBeUndefined();
        expect(place).toMatchObject({ id: 'place-1', displayName: 'Transportadora Exemplo', rating: 4.5 });
    });

    it('nenhum resultado: place null, sem error (busca válida, só não achou)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { places: [] }));
        vi.stubGlobal('fetch', fetchMock);

        const { place, error } = await searchGooglePlaceDetailed('Empresa Inexistente', 'São Paulo, SP');

        expect(place).toBeNull();
        expect(error).toBeUndefined();
    });

    it('achado corrigido: resposta não-ok preenche `.error` em vez de ficar indistinguível de "não achou"', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: { message: 'API key revoked' } }));
        vi.stubGlobal('fetch', fetchMock);

        const { place, error } = await searchGooglePlaceDetailed('Transportadora Exemplo', 'São Paulo, SP');

        expect(place).toBeNull();
        expect(error).toBeDefined();
        expect(error).toContain('403');
    });

    it('achado corrigido: falha de rede também preenche `.error`', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const { place, error } = await searchGooglePlaceDetailed('Transportadora Exemplo', 'São Paulo, SP');

        expect(place).toBeNull();
        expect(error).toBe('network down');
    });
});

describe('searchGooglePlace — compatibilidade com enrichment.service.ts', () => {
    it('continua devolvendo null tanto para "não achou" quanto para erro real (não muda o contrato dos chamadores existentes)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, {}));
        vi.stubGlobal('fetch', fetchMock);

        const place = await searchGooglePlace('Transportadora Exemplo', 'São Paulo, SP');

        expect(place).toBeNull();
    }, 15_000);
});
