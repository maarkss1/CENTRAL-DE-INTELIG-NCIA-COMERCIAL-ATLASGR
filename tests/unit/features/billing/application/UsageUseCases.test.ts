/**
 * Cobre a agregação de consumo de IA — a segunda ressalva: a tela só mostraria dados depois que
 * houvesse chamadas gravadas com a coluna de tenant, então nada disso tinha sido exercitado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageUseCases } from '@/features/billing/application/UsageUseCases';
import type { UsageRepository, UsageLogRow, UsageByModelRow, UsageByPromptRow } from '@/features/billing/domain/Usage';

function buildFakeRepository(overrides: Partial<UsageRepository> = {}): UsageRepository {
    const base: UsageRepository = {
        findLogsSince: vi.fn().mockResolvedValue([] as UsageLogRow[]),
        groupByModel: vi.fn().mockResolvedValue([] as UsageByModelRow[]),
        groupByPrompt: vi.fn().mockResolvedValue([] as UsageByPromptRow[]),
        sumCostSince: vi.fn().mockResolvedValue(0),
        countUnattributed: vi.fn().mockResolvedValue(0),
    };
    return { ...base, ...overrides };
}

const ORG = 'org-1';

function horasAtras(h: number): Date {
    return new Date(Date.now() - h * 3_600_000);
}

let repo: UsageRepository;
let useCases: UsageUseCases;

beforeEach(() => {
    repo = buildFakeRepository();
    useCases = new UsageUseCases(repo);
});

describe('UsageUseCases.summary', () => {
    it('marca isEmpty e zera os totais quando não houve chamada', async () => {
        const r = await useCases.summary(ORG, 30);

        expect(r.isEmpty).toBe(true);
        expect(r.totalCost).toBe(0);
        expect(r.totalTokens).toBe(0);
        expect(r.avgLatencyMs).toBe(0);
    });

    it('devolve um ponto por dia do período, mesmo sem consumo, para o gráfico não ter buracos', async () => {
        const r = await useCases.summary(ORG, 30);
        expect(r.daily).toHaveLength(30);
        expect(r.daily.every((p) => p.cost === 0 && p.calls === 0)).toBe(true);
        // Em ordem cronológica: o último ponto é hoje.
        expect(r.daily[29].day).toBe(r.daily.at(-1)!.day);
    });

    it('respeita o tamanho do período pedido', async () => {
        expect((await useCases.summary(ORG, 7)).daily).toHaveLength(7);
        expect((await useCases.summary(ORG, 90)).daily).toHaveLength(90);
    });

    it('soma tokens, custo e latência média das chamadas', async () => {
        repo = buildFakeRepository({
            findLogsSince: vi.fn().mockResolvedValue([
                { createdAt: horasAtras(2), tokens: 1000, cost: 0.01, latencyMs: 200 },
                { createdAt: horasAtras(3), tokens: 500, cost: 0.005, latencyMs: 400 },
            ]),
        });
        useCases = new UsageUseCases(repo);

        const r = await useCases.summary(ORG, 30);

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

        repo = buildFakeRepository({
            findLogsSince: vi.fn().mockResolvedValue([
                { createdAt: new Date(inicioDeHoje), tokens: 10, cost: 0.001, latencyMs: 100 },
                { createdAt: new Date(inicioDeHoje), tokens: 20, cost: 0.002, latencyMs: 100 },
            ]),
        });
        useCases = new UsageUseCases(repo);

        const r = await useCases.summary(ORG, 30);
        const hoje = r.daily.at(-1)!;

        expect(hoje.calls).toBe(2);
        expect(hoje.tokens).toBe(30);
        expect(hoje.cost).toBeCloseTo(0.003, 6);
    });

    it('ordena os modelos do mais caro para o mais barato', async () => {
        repo = buildFakeRepository({
            groupByModel: vi.fn().mockResolvedValue([
                { model: 'local-llama3-fast', tokens: 900, cost: 0.002, avgLatencyMs: 120, calls: 9 },
                { model: 'local-llama3', tokens: 500, cost: 0.05, avgLatencyMs: 800, calls: 3 },
            ]),
        });
        useCases = new UsageUseCases(repo);

        const r = await useCases.summary(ORG, 30);

        expect(r.byModel.map((m) => m.model)).toEqual(['local-llama3', 'local-llama3-fast']);
        expect(r.byModel[0].cost).toBeCloseTo(0.05, 6);
        expect(r.byModel[0].avgLatencyMs).toBe(800);
        expect(r.byModel[0].calls).toBe(3);
    });

    it('reporta à parte as chamadas sem organização atribuída', async () => {
        repo = buildFakeRepository({ countUnattributed: vi.fn().mockResolvedValue(7) });
        useCases = new UsageUseCases(repo);

        const r = await useCases.summary(ORG, 30);

        expect(r.unattributedCalls).toBe(7);
    });

    it('escopa todas as consultas na organização pedida', async () => {
        await useCases.summary(ORG, 30);

        expect(repo.findLogsSince).toHaveBeenCalledWith(ORG, expect.any(Date));
        expect(repo.groupByModel).toHaveBeenCalledWith(ORG, expect.any(Date));
        expect(repo.groupByPrompt).toHaveBeenCalledWith(ORG, expect.any(Date));
        expect(repo.sumCostSince).toHaveBeenCalledWith(ORG, expect.any(Date));
    });

    it('traz o custo do mês corrente separado do total do período', async () => {
        repo = buildFakeRepository({ sumCostSince: vi.fn().mockResolvedValue(1.25) });
        useCases = new UsageUseCases(repo);

        const r = await useCases.summary(ORG, 90);
        expect(r.costThisMonth).toBe(1.25);
    });

    it('rotula prompts não identificados em vez de somem do relatório', async () => {
        repo = buildFakeRepository({
            groupByPrompt: vi.fn().mockResolvedValue([
                { promptId: null, tokens: 100, cost: 0.01, calls: 1 },
            ]),
        });
        useCases = new UsageUseCases(repo);

        const r = await useCases.summary(ORG, 30);
        expect(r.byPrompt[0].promptId).toBe('Não identificado');
    });
});
