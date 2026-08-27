/**
 * Gap de auditoria (05 — Prospecção): `providerRateLimit.ts`/`providerCache.ts` já limitam
 * quantidade de chamadas e latência por provider, mas nenhum contador rastreava CUSTO monetário
 * real acumulado — mesmo gap que `ai_usage_cost_usd_total` (src/lib/ai/metrics.ts) já fechou para
 * IA. Cobre o núcleo do módulo: valor default por provider, override por env var e rejeição de
 * valores inválidos/negativos — mesmo padrão de teste já usado em tests/unit/lib/ai/metrics.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import client from 'prom-client';

describe('src/features/prospecting/services/providerCostMetrics.ts', () => {
    beforeEach(() => {
        client.register.clear();
        vi.resetModules();
    });

    afterEach(() => {
        client.register.clear();
        vi.resetModules();
    });

    it('getCostPerCallUsd devolve a estimativa default documentada quando nenhuma env var está setada', async () => {
        const { getCostPerCallUsd, DEFAULT_PROVIDER_COST_PER_CALL_USD } = await import(
            '../../../../../src/features/prospecting/services/providerCostMetrics.js'
        );

        expect(getCostPerCallUsd('apollo', {})).toBe(DEFAULT_PROVIDER_COST_PER_CALL_USD.apollo);
        expect(getCostPerCallUsd('hunter', {})).toBe(DEFAULT_PROVIDER_COST_PER_CALL_USD.hunter);
    });

    it('getCostPerCallUsd respeita override por env var por provider', async () => {
        const { getCostPerCallUsd } = await import(
            '../../../../../src/features/prospecting/services/providerCostMetrics.js'
        );

        expect(getCostPerCallUsd('apollo', { PROSPECTING_APOLLO_COST_PER_CALL_USD: '0.05' })).toBe(0.05);
        expect(getCostPerCallUsd('hunter', { PROSPECTING_HUNTER_COST_PER_CALL_USD: '0.1' })).toBe(0.1);
    });

    it('getCostPerCallUsd ignora env var inválida/negativa e cai para o default', async () => {
        const { getCostPerCallUsd, DEFAULT_PROVIDER_COST_PER_CALL_USD } = await import(
            '../../../../../src/features/prospecting/services/providerCostMetrics.js'
        );

        expect(getCostPerCallUsd('apollo', { PROSPECTING_APOLLO_COST_PER_CALL_USD: 'not-a-number' })).toBe(
            DEFAULT_PROVIDER_COST_PER_CALL_USD.apollo
        );
        expect(getCostPerCallUsd('apollo', { PROSPECTING_APOLLO_COST_PER_CALL_USD: '-1' })).toBe(
            DEFAULT_PROVIDER_COST_PER_CALL_USD.apollo
        );
    });

    it('recordProviderCallCost incrementa prospecting_provider_cost_usd_total com o valor certo, rotulado por provider', async () => {
        const { recordProviderCallCost } = await import(
            '../../../../../src/features/prospecting/services/providerCostMetrics.js'
        );

        recordProviderCallCost('apollo', {});
        recordProviderCallCost('apollo', {});
        recordProviderCallCost('hunter', {});

        const metrics = await client.register.getMetricsAsJSON();
        const cost = metrics.find((m) => m.name === 'prospecting_provider_cost_usd_total');
        const values = (cost as unknown as { values: Array<{ value: number; labels: Record<string, string> }> })?.values;

        const apollo = values?.find((v) => v.labels.provider === 'apollo');
        const hunter = values?.find((v) => v.labels.provider === 'hunter');
        expect(apollo?.value).toBeCloseTo(0.02, 6); // 2x default apollo (0.01)
        expect(hunter?.value).toBeCloseTo(0.02, 6); // 1x default hunter (0.02)
    });

    it('recordProviderCallCost com custo 0/negativo (env var explicitamente zerada) não incrementa a métrica', async () => {
        const { recordProviderCallCost } = await import(
            '../../../../../src/features/prospecting/services/providerCostMetrics.js'
        );

        recordProviderCallCost('apollo', { PROSPECTING_APOLLO_COST_PER_CALL_USD: '0' });

        const metrics = await client.register.getMetricsAsJSON();
        const cost = metrics.find((m) => m.name === 'prospecting_provider_cost_usd_total');
        expect((cost as unknown as { values: unknown[] } | undefined)?.values ?? []).toHaveLength(0);
    });
});
