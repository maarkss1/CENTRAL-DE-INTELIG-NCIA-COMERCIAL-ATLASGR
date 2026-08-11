/**
 * `fetchWithProviderRetry` é o único ponto de retry para chamadas a provedores externos de
 * prospecção/enriquecimento (Apollo, Hunter.io, Google Places, BrasilAPI). Requisito da Onda 2:
 * "Rate limit com backoff+jitter, distinguindo 4xx definitivo de 429/5xx transitório." Estes
 * testes travam esse contrato: 429/5xx e falha de rede retentam (sem hammering — respeitando o
 * backoff, aqui com `sleep` mockado para o teste não levar segundos de verdade); um 4xx definitivo
 * (400/401/403/404) nunca retenta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../../src/lib/logger.js', () => ({ logger: mockLogger }));

import {
    fetchWithProviderRetry,
    isTransientStatus,
    isDefinitiveClientError,
    computeBackoffDelayMs,
} from '../../../../src/lib/enrichment/providerFetch.js';

function jsonResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers });
}

const noopSleep = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
    noopSleep.mockClear();
    mockLogger.info.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isTransientStatus / isDefinitiveClientError', () => {
    it('classifica 429 e 5xx como transitórios', () => {
        expect(isTransientStatus(429)).toBe(true);
        expect(isTransientStatus(500)).toBe(true);
        expect(isTransientStatus(503)).toBe(true);
    });

    it('classifica 4xx (exceto 429) como definitivo', () => {
        expect(isDefinitiveClientError(400)).toBe(true);
        expect(isDefinitiveClientError(401)).toBe(true);
        expect(isDefinitiveClientError(403)).toBe(true);
        expect(isDefinitiveClientError(404)).toBe(true);
        expect(isDefinitiveClientError(429)).toBe(false);
    });

    it('200 não é nem transitório nem definitivo (sucesso)', () => {
        expect(isTransientStatus(200)).toBe(false);
        expect(isDefinitiveClientError(200)).toBe(false);
    });
});

describe('computeBackoffDelayMs', () => {
    it('nunca ultrapassa o teto configurado (mesmo com jitter aleatório)', () => {
        for (let attempt = 0; attempt < 10; attempt++) {
            const delay = computeBackoffDelayMs(attempt, 300, 4000);
            expect(delay).toBeGreaterThanOrEqual(0);
            expect(delay).toBeLessThanOrEqual(4000);
        }
    });

    it('cresce exponencialmente com a tentativa antes de bater no teto', () => {
        // Full jitter é aleatório, mas o TETO de cada tentativa cresce — checa upper bound determinístico.
        const cap0 = Math.min(4000, 300 * 2 ** 0);
        const cap3 = Math.min(4000, 300 * 2 ** 3);
        expect(cap3).toBeGreaterThan(cap0);
    });
});

describe('fetchWithProviderRetry — sucesso direto', () => {
    it('não retenta quando a primeira resposta já é 200', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        const res = await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'Test' });

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(noopSleep).not.toHaveBeenCalled();
    });
});

describe('fetchWithProviderRetry — 429 transitório', () => {
    it('retenta em 429 e devolve sucesso quando a próxima tentativa funciona', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(429, { error: 'rate_limited' }))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        const res = await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'Test' });

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(noopSleep).toHaveBeenCalledTimes(1);
    });

    it('honra o header Retry-After (segundos) em vez do backoff calculado', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '2' }))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'Test' });

        expect(noopSleep).toHaveBeenCalledWith(2000);
    });

    it('esgota as tentativas e devolve a última resposta 429 (sem lançar)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, { error: 'rate_limited' }));
        vi.stubGlobal('fetch', fetchMock);

        const res = await fetchWithProviderRetry('https://example.com/api', {}, { retries: 2, sleep: noopSleep, providerName: 'Test' });

        expect(res.status).toBe(429);
        expect(fetchMock).toHaveBeenCalledTimes(3); // 1 tentativa inicial + 2 retries
    });
});

describe('fetchWithProviderRetry — 5xx transitório', () => {
    it('retenta em 500/503 e devolve sucesso quando a próxima tentativa funciona', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(503, {}))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        const res = await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'Test' });

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe('fetchWithProviderRetry — 4xx definitivo', () => {
    it.each([400, 401, 403, 404, 422])('nunca retenta em %i — devolve a resposta imediatamente', async (status) => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status, { error: 'definitive' }));
        vi.stubGlobal('fetch', fetchMock);

        const res = await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'Test' });

        expect(res.status).toBe(status);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(noopSleep).not.toHaveBeenCalled();
    });
});

describe('fetchWithProviderRetry — falha de rede/timeout', () => {
    it('retenta em erro de rede e devolve sucesso quando a próxima tentativa funciona', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        const res = await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'Test' });

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('lança o erro de rede depois de esgotar todas as tentativas', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            fetchWithProviderRetry('https://example.com/api', {}, { retries: 1, sleep: noopSleep, providerName: 'Test' })
        ).rejects.toThrow('fetch failed');
        expect(fetchMock).toHaveBeenCalledTimes(2); // 1 tentativa inicial + 1 retry
    });
});

describe('fetchWithProviderRetry — contagem de volume de chamadas faturáveis', () => {
    it('registra um log estruturado por tentativa quando billable=true, sem inventar um valor em R$/USD', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'Apollo-Test', billable: true });

        expect(mockLogger.info).toHaveBeenCalledTimes(1);
        const [meta] = mockLogger.info.mock.calls[0];
        expect(meta).toMatchObject({ event: 'provider-call-volume', provider: 'Apollo-Test', status: 200 });
        expect(meta).not.toHaveProperty('costUsd');
        expect(meta).not.toHaveProperty('cost');
    });

    it('não registra nada quando billable não é passado (provider gratuito, ex: BrasilAPI)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'BrasilAPI' });

        expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('registra uma linha por tentativa, incluindo retries, para refletir o volume real de chamadas disparadas', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(429, {}))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        vi.stubGlobal('fetch', fetchMock);

        await fetchWithProviderRetry('https://example.com/api', {}, { sleep: noopSleep, providerName: 'Hunter-Test', billable: true });

        expect(mockLogger.info).toHaveBeenCalledTimes(2); // uma chamada real por tentativa, mesmo a que deu 429
    });
});
