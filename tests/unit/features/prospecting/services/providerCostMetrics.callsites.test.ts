/**
 * Gap de auditoria (05 — Prospecção): prova, nos pontos de chamada reais (não só no módulo de
 * métrica isolado — ver providerCostMetrics.test.ts), que `prospecting_provider_cost_usd_total`
 * só incrementa quando uma chamada de rede real e bem-sucedida acontece:
 * - chamada bem-sucedida → incrementa pelo valor estimado por chamada documentado do provider;
 * - chamada que falha (HTTP não-ok) → não incrementa;
 * - chamada bloqueada pelo rate limiter interno (nunca sai pela rede) → não incrementa;
 * - segunda chamada idêntica servida do cache (providerCache.ts) → não incrementa de novo — cache
 *   hit não deveria contar custo de novo, já que não bateu o provider.
 *
 * `enrichOrganizationByDomain` (Apollo, sem cache) cobre sucesso/falha/rate-limit-bloqueado.
 * `findEmailViaHunter` (Hunter, com cache) cobre o caso de cache hit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import client from 'prom-client';

vi.mock('@/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { enrichOrganizationByDomain } from '@/features/prospecting/services/apollo/organizationEnrich.js';
import { findEmailViaHunter } from '@/features/prospecting/services/hunter.service.js';
import { resetProviderRateLimitersForTests } from '@/features/prospecting/services/providerRateLimit.js';
import { resetProviderCacheForTests } from '@/features/prospecting/services/providerCache.js';
import { DEFAULT_PROVIDER_COST_PER_CALL_USD } from '@/features/prospecting/services/providerCostMetrics.js';

function jsonResponse(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status });
}

async function getProviderCostValue(provider: 'apollo' | 'hunter'): Promise<number> {
    const metrics = await client.register.getMetricsAsJSON();
    const metric = metrics.find((m) => m.name === 'prospecting_provider_cost_usd_total');
    const values = (metric as unknown as { values?: Array<{ value: number; labels: Record<string, string> }> } | undefined)?.values;
    return values?.find((v) => v.labels.provider === provider)?.value ?? 0;
}

const originalEnv = { ...process.env };

beforeEach(async () => {
    process.env.PROSPECTING_PROVIDER_MODE = 'hybrid';
    process.env.APOLLO_API_KEY = 'test-apollo-key';
    process.env.HUNTER_API_KEY = 'test-hunter-key';
    delete process.env.APOLLO_RATE_LIMIT_PER_MINUTE;
    resetProviderRateLimitersForTests();
    await resetProviderCacheForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
});

describe('prospecting_provider_cost_usd_total — chamada bem-sucedida vs. falha (Apollo Organization Enrich)', () => {
    it('incrementa pelo custo estimado do Apollo numa chamada bem-sucedida', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { organization: { name: 'Empresa X' } }));
        vi.stubGlobal('fetch', fetchMock);

        const before = await getProviderCostValue('apollo');
        const result = await enrichOrganizationByDomain('empresa-x.com.br');
        const after = await getProviderCostValue('apollo');

        expect(result.error).toBeUndefined();
        expect(after - before).toBeCloseTo(DEFAULT_PROVIDER_COST_PER_CALL_USD.apollo, 6);
    });

    it('NÃO incrementa quando a chamada falha (Apollo respondeu erro)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' }));
        vi.stubGlobal('fetch', fetchMock);

        const before = await getProviderCostValue('apollo');
        const result = await enrichOrganizationByDomain('empresa-falha.com.br');
        const after = await getProviderCostValue('apollo');

        expect(result.error).toBeDefined();
        expect(after - before).toBe(0);
    });
});

describe('prospecting_provider_cost_usd_total — bloqueado pelo rate limiter interno (Apollo Organization Enrich)', () => {
    it('NÃO incrementa quando o rate limiter interno bloqueia a chamada antes de sair pela rede', async () => {
        // Teto de 1 chamada/minuto: a primeira consome o único token (sucesso real, incrementa
        // custo); a segunda é bloqueada pelo bucket antes de qualquer fetch — não deve incrementar.
        process.env.APOLLO_RATE_LIMIT_PER_MINUTE = '1';
        resetProviderRateLimitersForTests();

        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { organization: { name: 'Empresa Y' } }));
        vi.stubGlobal('fetch', fetchMock);

        const before = await getProviderCostValue('apollo');
        await enrichOrganizationByDomain('empresa-y.com.br');
        const afterFirstCall = await getProviderCostValue('apollo');

        const blockedResult = await enrichOrganizationByDomain('empresa-z.com.br');
        const afterBlockedCall = await getProviderCostValue('apollo');

        expect(afterFirstCall - before).toBeCloseTo(DEFAULT_PROVIDER_COST_PER_CALL_USD.apollo, 6);
        expect(blockedResult.error).toContain('Rate limit');
        expect(fetchMock).toHaveBeenCalledTimes(1); // a segunda chamada nunca saiu pela rede
        expect(afterBlockedCall - afterFirstCall).toBe(0);
    });
});

describe('prospecting_provider_cost_usd_total — cache hit não conta custo de novo (Hunter Email Finder)', () => {
    it('a segunda chamada idêntica (servida do cache) não incrementa o custo de novo', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { email: 'joao@empresa.com.br', score: 90 } }));
        vi.stubGlobal('fetch', fetchMock);

        const before = await getProviderCostValue('hunter');
        const first = await findEmailViaHunter('empresa.com.br', 'João Silva');
        const afterFirstCall = await getProviderCostValue('hunter');

        const second = await findEmailViaHunter('empresa.com.br', 'João Silva');
        const afterCacheHit = await getProviderCostValue('hunter');

        expect(first.email).toBe('joao@empresa.com.br');
        expect(second).toEqual(first);
        expect(fetchMock).toHaveBeenCalledTimes(1); // segunda chamada veio do cache, não da rede
        expect(afterFirstCall - before).toBeCloseTo(DEFAULT_PROVIDER_COST_PER_CALL_USD.hunter, 6);
        expect(afterCacheHit - afterFirstCall).toBe(0);
    });
});
