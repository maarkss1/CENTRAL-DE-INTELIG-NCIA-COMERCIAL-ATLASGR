/**
 * Gap de auditoria (05 — Prospecção): `enrichment.service.ts` só tinha cache de 24h em nível de
 * Company inteira — nenhuma chamada individual de decisor/pessoa a Apollo/Hunter tinha cache.
 * Cobre o cache genérico por (provider, operação, parâmetros normalizados) usado por
 * apollo/people.ts e hunter.service.ts: chave estável/determinística, uso do Redis
 * (`cacheConnection`) quando configurado, fallback em memória quando não, e o requisito central —
 * "segunda chamada idêntica não bate o provider de novo" — via `withProviderCache`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let redisConfiguredValue = false;
const cacheGet = vi.fn();
const cacheSet = vi.fn();
vi.mock('@/lib/queue/redis.js', () => ({
    get redisConfigured() {
        return redisConfiguredValue;
    },
    cacheConnection: {
        get: (...args: unknown[]) => cacheGet(...args),
        set: (...args: unknown[]) => cacheSet(...args),
    },
}));

vi.mock('@/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
    buildProviderCacheKey,
    withProviderCache,
    resetProviderCacheForTests,
    DEFAULT_PROVIDER_CACHE_TTL_SECONDS,
} from '../providerCache.js';

beforeEach(async () => {
    vi.clearAllMocks();
    redisConfiguredValue = false;
    await resetProviderCacheForTests();
});

describe('buildProviderCacheKey', () => {
    it('normaliza parâmetros equivalentes (espaço/caixa) para a mesma chave', () => {
        const a = buildProviderCacheKey('apollo', 'people-match', { domain: 'Empresa.COM ', fullName: '  João Silva' });
        const b = buildProviderCacheKey('apollo', 'people-match', { domain: 'empresa.com', fullName: 'joão silva' });
        expect(a).toBe(b);
    });

    it('produz chaves diferentes para parâmetros diferentes', () => {
        const a = buildProviderCacheKey('apollo', 'people-match', { domain: 'a.com' });
        const b = buildProviderCacheKey('apollo', 'people-match', { domain: 'b.com' });
        expect(a).not.toBe(b);
    });

    it('produz chaves diferentes para providers/operações diferentes com os mesmos parâmetros', () => {
        const a = buildProviderCacheKey('apollo', 'op-a', { domain: 'x.com' });
        const b = buildProviderCacheKey('hunter', 'op-a', { domain: 'x.com' });
        const c = buildProviderCacheKey('apollo', 'op-b', { domain: 'x.com' });
        expect(new Set([a, b, c]).size).toBe(3);
    });
});

describe('withProviderCache — fallback em memória (Redis não configurado)', () => {
    it('a segunda chamada idêntica não invoca o fetcher de novo (cache hit real)', async () => {
        const fetcher = vi.fn().mockResolvedValue({ ok: true, value: 42 });
        const key = buildProviderCacheKey('apollo', 'op', { a: 1 });

        const first = await withProviderCache(key, fetcher);
        const second = await withProviderCache(key, fetcher);

        expect(first).toEqual({ ok: true, value: 42 });
        expect(second).toEqual({ ok: true, value: 42 });
        expect(fetcher).toHaveBeenCalledTimes(1);
        // Sem Redis configurado, nunca deve tentar falar com o cacheConnection.
        expect(cacheGet).not.toHaveBeenCalled();
        expect(cacheSet).not.toHaveBeenCalled();
    });

    it('não cacheia quando shouldCache devolve false (ex: resultado de erro) — repete a chamada', async () => {
        const fetcher = vi.fn().mockResolvedValue({ error: 'falhou' });
        const key = buildProviderCacheKey('hunter', 'op', { a: 1 });

        await withProviderCache(key, fetcher, { shouldCache: (r: { error?: string }) => !r.error });
        await withProviderCache(key, fetcher, { shouldCache: (r: { error?: string }) => !r.error });

        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('chaves diferentes não colidem entre si', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce({ v: 1 }).mockResolvedValueOnce({ v: 2 });

        await withProviderCache(buildProviderCacheKey('apollo', 'op', { a: 1 }), fetcher);
        const result = await withProviderCache(buildProviderCacheKey('apollo', 'op', { a: 2 }), fetcher);

        expect(result).toEqual({ v: 2 });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
});

describe('withProviderCache — Redis configurado', () => {
    beforeEach(() => {
        redisConfiguredValue = true;
    });

    it('grava no Redis com o TTL default (segundos) quando não sobrescrito', async () => {
        cacheGet.mockResolvedValue(null);
        cacheSet.mockResolvedValue('OK');
        const fetcher = vi.fn().mockResolvedValue({ v: 'x' });

        const result = await withProviderCache('k1', fetcher);

        expect(result).toEqual({ v: 'x' });
        expect(cacheSet).toHaveBeenCalledWith('k1', JSON.stringify({ v: 'x' }), 'EX', DEFAULT_PROVIDER_CACHE_TTL_SECONDS);
    });

    it('lê do Redis quando já há valor cacheado — a segunda chamada não invoca o fetcher', async () => {
        cacheGet.mockResolvedValue(JSON.stringify({ v: 'cached' }));
        const fetcher = vi.fn();

        const result = await withProviderCache('k2', fetcher);

        expect(result).toEqual({ v: 'cached' });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('uma falha ao ler do Redis é tratada como cache miss (não derruba a chamada real)', async () => {
        cacheGet.mockRejectedValue(new Error('redis down'));
        cacheSet.mockResolvedValue('OK');
        const fetcher = vi.fn().mockResolvedValue({ v: 'fresh' });

        const result = await withProviderCache('k3', fetcher);

        expect(result).toEqual({ v: 'fresh' });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('respeita um ttlSeconds explícito em vez do default', async () => {
        cacheGet.mockResolvedValue(null);
        cacheSet.mockResolvedValue('OK');
        const fetcher = vi.fn().mockResolvedValue({ v: 'y' });

        await withProviderCache('k4', fetcher, { ttlSeconds: 300 });

        expect(cacheSet).toHaveBeenCalledWith('k4', JSON.stringify({ v: 'y' }), 'EX', 300);
    });
});
