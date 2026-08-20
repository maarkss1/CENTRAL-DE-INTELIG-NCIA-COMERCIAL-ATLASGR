import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * AI-006 (onda 35): prova as 9 dimensões do harness de avaliação. Reaproveita `getSwarmSloSnapshot`
 * de verdade (não mockado) contra um `prisma` mockado — testa a composição real entre os dois
 * serviços, não uma versão isolada e potencialmente desalinhada de `getSwarmSloSnapshot`.
 */
const mockEnv: Record<string, unknown> = { SWARM_SCHEDULER_ENABLED: false };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

const pendingActionFindMany = vi.fn();
const aiLogAggregate = vi.fn();
const aiLogCount = vi.fn();
const guardrailEventCount = vi.fn();

vi.mock('../../../../lib/prisma.js', () => ({
    prisma: {
        aIPendingAction: { findMany: (...args: unknown[]) => pendingActionFindMany(...args) },
        aILog: {
            aggregate: (...args: unknown[]) => aiLogAggregate(...args),
            count: (...args: unknown[]) => aiLogCount(...args),
        },
        aIGuardrailEvent: { count: (...args: unknown[]) => guardrailEventCount(...args) },
    },
}));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { getEvaluationMetricsSnapshot } = await import('../evaluationMetrics.service.js');

const NOW = new Date('2026-08-15T12:00:00Z');

function emptyAiLogAggregate() {
    return { _sum: { cost: null, tokens: null }, _avg: { latencyMs: null }, _count: { _all: 0 } };
}

/** `pendingActionFindMany` é chamado 2x: uma vez de dentro de getSwarmSloSnapshot (sem filtro de
 * `action`), outra pelo próprio evaluationMetrics (filtrando `action: 'send_email'`, para fallback
 * rate). Distingue pelo shape do `where`, não pela ordem de chamada. */
function routePendingActionFindMany(sloRows: unknown[], sdrOutboundRows: unknown[]) {
    pendingActionFindMany.mockImplementation((args: { where?: { action?: string } }) =>
        args.where?.action === 'send_email' ? Promise.resolve(sdrOutboundRows) : Promise.resolve(sloRows));
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('getEvaluationMetricsSnapshot — harness de avaliação do enxame (AI-006)', () => {
    it('base vazia: cost/latency/humanOverride/fallbackRate/toolCorrectness/piiLeakageRate nunca fabricam número sobre 0/0', async () => {
        routePendingActionFindMany([], []);
        aiLogAggregate.mockResolvedValue(emptyAiLogAggregate());
        aiLogCount.mockResolvedValue(0);
        guardrailEventCount.mockResolvedValue(0);

        const snapshot = await getEvaluationMetricsSnapshot('org-1', 30, NOW);

        expect(snapshot.organizationId).toBe('org-1');
        expect(snapshot.windowDays).toBe(30);

        const { dimensions } = snapshot;
        expect(dimensions.cost).toEqual({ available: true, value: { totalCostUsd: 0, totalTokens: 0, requestCount: 0 } });
        expect(dimensions.latency).toEqual({ available: true, value: { avgLatencyMs: null } });

        expect(dimensions.humanOverride.available).toBe(true);
        if (dimensions.humanOverride.available) expect(dimensions.humanOverride.value.value).toBeNull();

        expect(dimensions.fallbackRate.available).toBe(true);
        if (dimensions.fallbackRate.available) expect(dimensions.fallbackRate.value.value).toBeNull();

        expect(dimensions.toolCorrectness.available).toBe(true);
        if (dimensions.toolCorrectness.available) expect(dimensions.toolCorrectness.value.value).toBeNull();

        expect(dimensions.piiLeakageRate.available).toBe(true);
        if (dimensions.piiLeakageRate.available) expect(dimensions.piiLeakageRate.value.value).toBeNull();
    });

    it('as 3 dimensões que dependem de AI-005 vêm SEMPRE indisponíveis, com o motivo — nunca um número', async () => {
        routePendingActionFindMany([], []);
        aiLogAggregate.mockResolvedValue(emptyAiLogAggregate());
        aiLogCount.mockResolvedValue(0);
        guardrailEventCount.mockResolvedValue(0);

        const { dimensions } = await getEvaluationMetricsSnapshot('org-1', 30, NOW);

        for (const dim of [dimensions.factuality, dimensions.playbookAdherence, dimensions.hallucination]) {
            expect(dim.available).toBe(false);
            if (!dim.available) expect(dim.reason).toContain('AI-005');
        }
    });

    it('humanOverride e toolCorrectness agregam através dos papéis com ledger (exclui OPS)', async () => {
        routePendingActionFindMany([
            { agentRole: 'SDR', approved: true, discardedAt: null, executed: true, executedAt: new Date('2026-08-10T10:05:00Z'), executionError: null, attempts: 1, createdAt: new Date('2026-08-10T10:00:00Z') },
            { agentRole: 'SDR', approved: false, discardedAt: new Date('2026-08-10T11:00:00Z'), executed: false, executedAt: null, executionError: null, attempts: 0, createdAt: new Date('2026-08-10T10:30:00Z') },
            { agentRole: 'CRM', approved: true, discardedAt: null, executed: false, executedAt: null, executionError: 'SMTP indisponível', attempts: 1, createdAt: new Date('2026-08-11T09:00:00Z') },
        ], []);
        aiLogAggregate.mockResolvedValue(emptyAiLogAggregate());
        aiLogCount.mockResolvedValue(0);
        guardrailEventCount.mockResolvedValue(0);

        const { dimensions } = await getEvaluationMetricsSnapshot('org-1', 30, NOW);

        // humanOverride: 1 descarte / 3 decisões revisadas (aprovada OU descartada) — SDR row1
        // (aprovada) + SDR row2 (descartada) + CRM row (aprovada, mesmo com erro de execução).
        expect(dimensions.humanOverride.available).toBe(true);
        if (dimensions.humanOverride.available) {
            expect(dimensions.humanOverride.value).toEqual({ value: 1 / 3, numerator: 1, denominator: 3 });
        }

        // toolCorrectness (proxy = 1 - errorRate): 2 tentativas (attempts>0: SDR row1 + CRM row),
        // 1 erro (CRM) → 1 sucesso / 2 tentativas.
        expect(dimensions.toolCorrectness.available).toBe(true);
        if (dimensions.toolCorrectness.available) {
            expect(dimensions.toolCorrectness.value).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
        }
    });

    it('fallbackRate: só conta AIPendingAction de send_email com structuredOutputValid no payload', async () => {
        routePendingActionFindMany([], [
            { payload: { structuredOutputValid: true } },
            { payload: { structuredOutputValid: false } },
            { payload: { structuredOutputValid: false } },
            { payload: { leadId: 'x' } }, // sem o campo — registro anterior ao AI-004, não entra na base.
        ]);
        aiLogAggregate.mockResolvedValue(emptyAiLogAggregate());
        aiLogCount.mockResolvedValue(0);
        guardrailEventCount.mockResolvedValue(0);

        const { dimensions } = await getEvaluationMetricsSnapshot('org-1', 30, NOW);

        expect(dimensions.fallbackRate.available).toBe(true);
        if (dimensions.fallbackRate.available) {
            expect(dimensions.fallbackRate.value).toEqual({ value: 2 / 3, numerator: 2, denominator: 3 });
            expect(dimensions.fallbackRate.note).toContain('SDR Outbound');
        }
    });

    it('piiLeakageRate: proporção de AILog cuja resposta precisou de redação de PII (AIGuardrailEvent)', async () => {
        routePendingActionFindMany([], []);
        aiLogAggregate.mockResolvedValue(emptyAiLogAggregate());
        aiLogCount.mockResolvedValue(50);
        guardrailEventCount.mockResolvedValue(2);

        const { dimensions } = await getEvaluationMetricsSnapshot('org-1', 30, NOW);

        expect(dimensions.piiLeakageRate.available).toBe(true);
        if (dimensions.piiLeakageRate.available) {
            expect(dimensions.piiLeakageRate.value).toEqual({ value: 2 / 50, numerator: 2, denominator: 50 });
        }
        expect(guardrailEventCount).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organizationId: 'org-1', type: 'pii_redacted' }),
        }));
    });

    it('cost/latency reais vêm do mesmo agregado de AILog usado por getSwarmSloSnapshot', async () => {
        routePendingActionFindMany([], []);
        aiLogAggregate.mockResolvedValue({ _sum: { cost: 4.5, tokens: 12_000 }, _avg: { latencyMs: 850 }, _count: { _all: 20 } });
        aiLogCount.mockResolvedValue(20);
        guardrailEventCount.mockResolvedValue(0);

        const { dimensions } = await getEvaluationMetricsSnapshot('org-1', 30, NOW);

        expect(dimensions.cost).toEqual({ available: true, value: { totalCostUsd: 4.5, totalTokens: 12_000, requestCount: 20 } });
        expect(dimensions.latency).toEqual({ available: true, value: { avgLatencyMs: 850 } });
    });
});
