/**
 * Cobre a agregação de consumo de IA — a segunda ressalva: a tela só mostraria dados depois que
 * houvesse chamadas gravadas com a coluna de tenant, então nada disso tinha sido exercitado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        aILog: { findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    },
}));

import { prisma } from '@/lib/prisma';
import { usageService } from '@/features/billing/usage.service';

const log = prisma.aILog as unknown as Record<string, ReturnType<typeof vi.fn>>;

const ORG = 'org-1';

function horasAtras(h: number): Date {
    return new Date(Date.now() - h * 3_600_000);
}

beforeEach(() => {
    vi.clearAllMocks();
    log.findMany.mockResolvedValue([]);
    log.groupBy.mockResolvedValue([]);
    log.aggregate.mockResolvedValue({ _sum: { cost: 0 } });
    log.count.mockResolvedValue(0);
});

describe('UsageService.summary', () => {
    it('marca isEmpty e zera os totais quando não houve chamada', async () => {
        const r = await usageService.summary(ORG, 30);

        expect(r.isEmpty).toBe(true);
        expect(r.totalCost).toBe(0);
        expect(r.totalTokens).toBe(0);
        expect(r.avgLatencyMs).toBe(0);
    });

    it('devolve um ponto por dia do período, mesmo sem consumo, para o gráfico não ter buracos', async () => {
        const r = await usageService.summary(ORG, 30);
        expect(r.daily).toHaveLength(30);
        expect(r.daily.every((p) => p.cost === 0 && p.calls === 0)).toBe(true);
        // Em ordem cronológica: o último ponto é hoje.
        expect(r.daily[29].day).toBe(r.daily.at(-1)!.day);
    });

    it('respeita o tamanho do período pedido', async () => {
        expect((await usageService.summary(ORG, 7)).daily).toHaveLength(7);
        expect((await usageService.summary(ORG, 90)).daily).toHaveLength(90);
    });

    it('soma tokens, custo e latência média das chamadas', async () => {
        log.findMany.mockResolvedValue([
            { createdAt: horasAtras(2), tokens: 1000, cost: 0.01, latencyMs: 200 },
            { createdAt: horasAtras(3), tokens: 500, cost: 0.005, latencyMs: 400 },
        ]);

        const r = await usageService.summary(ORG, 30);

        expect(r.totalTokens).toBe(1500);
        expect(r.totalCost).toBeCloseTo(0.015, 6);
        expect(r.totalCalls).toBe(2);
        expect(r.avgLatencyMs).toBe(300);
        expect(r.isEmpty).toBe(false);
    });

    it('joga cada chamada no balde do seu dia', async () => {
        // Ancorado no início de hoje, e não em "N horas atrás": logo após a meia-noite, "2 horas
        // atrás" cai em ontem e o teste falharia por causa do relógio, não do código.
        const inicioDeHoje = new Date();
        inicioDeHoje.setHours(0, 0, 0, 0);

        log.findMany.mockResolvedValue([
            { createdAt: new Date(inicioDeHoje), tokens: 10, cost: 0.001, latencyMs: 100 },
            { createdAt: new Date(inicioDeHoje), tokens: 20, cost: 0.002, latencyMs: 100 },
        ]);

        const r = await usageService.summary(ORG, 30);
        const hoje = r.daily.at(-1)!;

        expect(hoje.calls).toBe(2);
        expect(hoje.tokens).toBe(30);
        expect(hoje.cost).toBeCloseTo(0.003, 6);
    });

    it('ordena os modelos do mais caro para o mais barato', async () => {
        log.groupBy.mockResolvedValue([
            { model: 'local-llama3-fast', _sum: { tokens: 900, cost: 0.002 }, _avg: { latencyMs: 120 }, _count: { _all: 9 } },
            { model: 'local-llama3', _sum: { tokens: 500, cost: 0.05 }, _avg: { latencyMs: 800 }, _count: { _all: 3 } },
        ]);

        const r = await usageService.summary(ORG, 30);

        expect(r.byModel.map((m) => m.model)).toEqual(['local-llama3', 'local-llama3-fast']);
        expect(r.byModel[0].cost).toBeCloseTo(0.05, 6);
        expect(r.byModel[0].avgLatencyMs).toBe(800);
        expect(r.byModel[0].calls).toBe(3);
    });

    it('trata somas nulas do groupBy como zero', async () => {
        log.groupBy.mockResolvedValue([
            { model: 'x', _sum: { tokens: null, cost: null }, _avg: { latencyMs: null }, _count: { _all: 0 } },
        ]);

        const r = await usageService.summary(ORG, 30);
        expect(r.byModel[0]).toMatchObject({ tokens: 0, cost: 0, avgLatencyMs: 0 });
    });

    it('reporta à parte as chamadas sem organização atribuída', async () => {
        log.count.mockResolvedValue(7);
        const r = await usageService.summary(ORG, 30);

        expect(r.unattributedCalls).toBe(7);
        // A consulta dessas chamadas é por organizationId nulo — elas não podem ser somadas a ninguém.
        expect(log.count).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ organizationId: null }) }),
        );
    });

    it('escopa todas as consultas na organização pedida', async () => {
        await usageService.summary(ORG, 30);

        for (const fn of [log.findMany, log.groupBy, log.aggregate]) {
            expect(fn).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
            );
        }
    });

    it('traz o custo do mês corrente separado do total do período', async () => {
        log.aggregate.mockResolvedValue({ _sum: { cost: 1.25 } });
        const r = await usageService.summary(ORG, 90);
        expect(r.costThisMonth).toBe(1.25);
    });
});
