import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, unknown> = { SWARM_SCHEDULER_ENABLED: false };
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

const pendingActionFindMany = vi.fn();
const aiLogAggregate = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        aIPendingAction: { findMany: (...args: unknown[]) => pendingActionFindMany(...args) },
        aILog: { aggregate: (...args: unknown[]) => aiLogAggregate(...args) },
    },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { getSwarmSloSnapshot } = await import(
    '../../../../../src/features/intelligence/services/swarmScheduler.service'
);

const NOW = new Date('2026-08-15T12:00:00Z');

function emptyAiLogAggregate() {
    return { _sum: { cost: null, tokens: null }, _avg: { latencyMs: null }, _count: { _all: 0 } };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('getSwarmSloSnapshot — painel de SLO por agente', () => {
    it('base vazia: nenhuma métrica de taxa é fabricada — tudo vem como estado vazio explícito, cobertura como 0 real', async () => {
        pendingActionFindMany.mockResolvedValue([]);
        aiLogAggregate.mockResolvedValue(emptyAiLogAggregate());

        const snapshot = await getSwarmSloSnapshot('org-1', 30, NOW);

        expect(snapshot.organizationId).toBe('org-1');
        expect(snapshot.windowDays).toBe(30);
        expect(snapshot.agents).toHaveLength(5);

        for (const agent of snapshot.agents) {
            // Cobertura é uma CONTAGEM: zero real é um fato honesto (ninguém foi acionado), não uma
            // lacuna — por isso não vira estado vazio.
            expect(agent.coverage).toBe(0);
            // Já as TAXAS (conversão/override/erro) dependem de um denominador > 0 — sem base, nunca
            // viram "0%" fabricado.
            expect(agent.conversion.value).toBeNull();
            expect(agent.conversion.emptyReason).toBeTruthy();
            expect(agent.humanOverride.value).toBeNull();
            expect(agent.humanOverride.emptyReason).toBeTruthy();
            expect(agent.errorRate.value).toBeNull();
            expect(agent.errorRate.emptyReason).toBeTruthy();
            expect(agent.avgExecutionLatencyMs).toBeNull();
        }

        // Custo/consumo real: soma de zero linhas é 0 de verdade (não fabricado) — mas nunca
        // aparece atribuído a um agente específico.
        expect(snapshot.cost.totalCostUsd).toBe(0);
        expect(snapshot.cost.requestCount).toBe(0);
        expect(snapshot.cost.avgLatencyMs).toBeNull();
        expect(snapshot.cost.note).toContain('não fatiado por agente');
    });

    it('OPS sempre aparece como estado vazio explicado — não usa o ledger AIPendingAction', async () => {
        pendingActionFindMany.mockResolvedValue([]);
        aiLogAggregate.mockResolvedValue(emptyAiLogAggregate());

        const snapshot = await getSwarmSloSnapshot('org-1', 30, NOW);
        const ops = snapshot.agents.find((agent) => agent.role === 'OPS')!;

        expect(ops.dataSourceNote).toContain('AIPendingAction');
        expect(ops.conversion.emptyReason).toBeTruthy();
    });

    it('com dados reais, calcula cobertura/conversão/override/erro por papel a partir de AIPendingAction', async () => {
        pendingActionFindMany.mockResolvedValue([
            // SDR: 2 propostas, 1 executada, 1 aprovada (executada) + 1 descartada (override humano), sem erro.
            { agentRole: 'SDR', approved: true, discardedAt: null, executed: true, executedAt: new Date('2026-08-10T10:05:00Z'), executionError: null, attempts: 1, createdAt: new Date('2026-08-10T10:00:00Z') },
            { agentRole: 'SDR', approved: false, discardedAt: new Date('2026-08-10T11:00:00Z'), executed: false, executedAt: null, executionError: null, attempts: 0, createdAt: new Date('2026-08-10T10:30:00Z') },
            // CRM: 1 recomendação, tentativa de execução falhou.
            { agentRole: 'CRM', approved: true, discardedAt: null, executed: false, executedAt: null, executionError: 'SMTP indisponível', attempts: 1, createdAt: new Date('2026-08-11T09:00:00Z') },
        ]);
        aiLogAggregate.mockResolvedValue({
            _sum: { cost: 4.5, tokens: 12_000 },
            _avg: { latencyMs: 850 },
            _count: { _all: 20 },
        });

        const snapshot = await getSwarmSloSnapshot('org-1', 30, NOW);

        const sdr = snapshot.agents.find((agent) => agent.role === 'SDR')!;
        expect(sdr.coverage).toBe(2);
        expect(sdr.conversion).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
        expect(sdr.humanOverride).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
        expect(sdr.avgExecutionLatencyMs).toBe(5 * 60 * 1000);

        const crm = snapshot.agents.find((agent) => agent.role === 'CRM')!;
        expect(crm.coverage).toBe(1);
        expect(crm.errorRate).toEqual({ value: 1, numerator: 1, denominator: 1 });

        const bdr = snapshot.agents.find((agent) => agent.role === 'BDR')!;
        expect(bdr.coverage).toBe(0);
        expect(bdr.conversion.value).toBeNull();

        expect(snapshot.cost.totalCostUsd).toBe(4.5);
        expect(snapshot.cost.requestCount).toBe(20);
        expect(snapshot.cost.avgLatencyMs).toBe(850);
    });

    it('isola por organização e por janela de tempo ao consultar o banco', async () => {
        pendingActionFindMany.mockResolvedValue([]);
        aiLogAggregate.mockResolvedValue(emptyAiLogAggregate());

        await getSwarmSloSnapshot('org-42', 7, NOW);

        expect(pendingActionFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                organizationId: 'org-42',
                createdAt: { gte: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000) },
            }),
        }));
        expect(aiLogAggregate).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organizationId: 'org-42' }),
        }));
    });
});
