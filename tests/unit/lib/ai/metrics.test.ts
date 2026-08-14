import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import client from 'prom-client';

/**
 * Handoff: .agents/handoffs/onda-4/10-para-07-metricas-fila-orcamento-ia.md — o alerta
 * AIBudgetOverrun (infrastructure/observability/alert.rules.yml) referencia
 * ai_usage_cost_usd_total/ai_usage_budget_usd_total, que não existiam até este módulo.
 */
describe('src/lib/ai/metrics.ts', () => {
    beforeEach(() => {
        client.register.clear();
        vi.resetModules();
    });

    afterEach(() => {
        client.register.clear();
        vi.resetModules();
        vi.doUnmock('../../../../src/config/env.js');
    });

    it('records estimated AI cost labeled by provider and tenant', async () => {
        vi.doMock('../../../../src/config/env.js', () => ({ env: {} }));
        const { recordAiUsageCost } = await import('../../../../src/lib/ai/metrics.js');

        recordAiUsageCost('groq', 'org-1', 0.0042);
        recordAiUsageCost('groq', 'org-1', 0.0008);
        recordAiUsageCost('openai', 'org-2', 0.01);

        const metrics = await client.register.getMetricsAsJSON();
        const cost = metrics.find((m) => m.name === 'ai_usage_cost_usd_total');
        const values = (cost as unknown as { values: Array<{ value: number; labels: Record<string, string> }> })?.values;

        const groqOrg1 = values?.find((v) => v.labels.provider === 'groq' && v.labels.tenant === 'org-1');
        const openaiOrg2 = values?.find((v) => v.labels.provider === 'openai' && v.labels.tenant === 'org-2');
        expect(groqOrg1?.value).toBeCloseTo(0.005, 6);
        expect(openaiOrg2?.value).toBeCloseTo(0.01, 6);
    });

    it('falls back to "unattributed" tenant outside an HTTP request (worker/script calls)', async () => {
        vi.doMock('../../../../src/config/env.js', () => ({ env: {} }));
        const { recordAiUsageCost } = await import('../../../../src/lib/ai/metrics.js');

        recordAiUsageCost('groq', null, 0.001);
        recordAiUsageCost('groq', undefined, 0.001);

        const metrics = await client.register.getMetricsAsJSON();
        const cost = metrics.find((m) => m.name === 'ai_usage_cost_usd_total');
        const values = (cost as unknown as { values: Array<{ value: number; labels: Record<string, string> }> })?.values;
        const unattributed = values?.find((v) => v.labels.provider === 'groq' && v.labels.tenant === 'unattributed');
        expect(unattributed?.value).toBeCloseTo(0.002, 6);
    });

    it('ignores non-finite or negative cost values instead of corrupting the counter', async () => {
        vi.doMock('../../../../src/config/env.js', () => ({ env: {} }));
        const { recordAiUsageCost } = await import('../../../../src/lib/ai/metrics.js');

        recordAiUsageCost('groq', 'org-1', Number.NaN);
        recordAiUsageCost('groq', 'org-1', -5);

        const metrics = await client.register.getMetricsAsJSON();
        const cost = metrics.find((m) => m.name === 'ai_usage_cost_usd_total');
        expect((cost as unknown as { values: unknown[] } | undefined)?.values ?? []).toHaveLength(0);
    });

    it('publishes ai_usage_budget_usd_total only when AI_MONTHLY_BUDGET_USD is configured', async () => {
        vi.doMock('../../../../src/config/env.js', () => ({ env: { AI_MONTHLY_BUDGET_USD: 500 } }));
        const metricsModule = await import('../../../../src/lib/ai/metrics.js');
        void metricsModule;

        const metrics = await client.register.getMetricsAsJSON();
        const budget = metrics.find((m) => m.name === 'ai_usage_budget_usd_total');
        expect((budget as unknown as { values: Array<{ value: number }> } | undefined)?.values[0]?.value).toBe(500);
    });

    it('does not publish ai_usage_budget_usd_total when no budget is configured (avoids a fabricated 0 that would turn cost/0 into +Inf)', async () => {
        vi.doMock('../../../../src/config/env.js', () => ({ env: {} }));
        const metricsModule = await import('../../../../src/lib/ai/metrics.js');
        void metricsModule;

        const metrics = await client.register.getMetricsAsJSON();
        const budget = metrics.find((m) => m.name === 'ai_usage_budget_usd_total');
        expect(budget).toBeUndefined();
    });
});
