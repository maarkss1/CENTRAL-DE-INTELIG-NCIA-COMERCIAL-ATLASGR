import { describe, it, expect, vi } from 'vitest';
import { AnalyticsUseCases } from '@/features/analytics/application/AnalyticsUseCases';
import type { AnalyticsRepository, ClosedLead, GroupCount } from '@/features/analytics/domain/Analytics';

// Auditoria de forecast/BI (Onda 7, Agente 04): prova, no nível da camada realmente conectada à
// rota `/api/analytics/dashboard` (AnalyticsUseCases + PrismaAnalyticsRepository via DI, ver
// shared/di/setup.ts), que nenhum número de forecast/pipeline é fabricado, e que os widgets que
// antes vinham sempre vazios (tmqMetric/lostReasons/callHeatmap/performanceReport) passam a
// refletir dado real do repositório em vez de zero/[] hardcoded.

function buildFakeRepository(overrides: Partial<AnalyticsRepository> = {}): AnalyticsRepository {
    const base: AnalyticsRepository = {
        countCompanies: vi.fn().mockResolvedValue(0),
        countContacts: vi.fn().mockResolvedValue(0),
        countOpenLeads: vi.fn().mockResolvedValue(0),
        countAllLeads: vi.fn().mockResolvedValue(0),
        countActivities: vi.fn().mockResolvedValue(0),
        countPendingActivities: vi.fn().mockResolvedValue(0),
        countOverdueActivities: vi.fn().mockResolvedValue(0),
        countLeadsByStatusSince: vi.fn().mockResolvedValue(0),
        countLeadsByStatus: vi.fn().mockResolvedValue(0),
        averageOpenLeadScore: vi.fn().mockResolvedValue(null),
        sumOpenPipelineValue: vi.fn().mockResolvedValue({ total: 0, count: 0 }),
        groupLeadsByStatus: vi.fn().mockResolvedValue([] as GroupCount[]),
        findLeadsCreatedSince: vi.fn().mockResolvedValue([]),
        findLeadsClosedSince: vi.fn().mockResolvedValue([] as ClosedLead[]),
        groupLeadsByTemperature: vi.fn().mockResolvedValue([] as GroupCount[]),
        groupLeadsBySource: vi.fn().mockResolvedValue([] as GroupCount[]),
        groupLeadsByOwner: vi.fn().mockResolvedValue([] as GroupCount[]),
        groupQualifiedLeadsByOwner: vi.fn().mockResolvedValue([] as GroupCount[]),
        groupActivitiesByType: vi.fn().mockResolvedValue([] as GroupCount[]),
        groupActivitiesByStatus: vi.fn().mockResolvedValue([] as GroupCount[]),
        groupLostLeadsByReason: vi.fn().mockResolvedValue([] as GroupCount[]),
        findCallActivityTimestamps: vi.fn().mockResolvedValue([]),
    };
    return { ...base, ...overrides };
}

const ORG = 'org-1';

describe('AnalyticsUseCases.overview — pipelineValue', () => {
    it('devolve null (não 0) quando nenhum lead em aberto tem amount preenchido', async () => {
        const repo = buildFakeRepository({
            sumOpenPipelineValue: vi.fn().mockResolvedValue({ total: 0, count: 0 }),
        });
        const useCases = new AnalyticsUseCases(repo);

        const overview = await useCases.overview(ORG);

        expect(overview.pipelineValue).toBeNull();
    });

    it('devolve a soma real quando há leads em aberto com amount', async () => {
        const repo = buildFakeRepository({
            sumOpenPipelineValue: vi.fn().mockResolvedValue({ total: 125000, count: 3 }),
        });
        const useCases = new AnalyticsUseCases(repo);

        const overview = await useCases.overview(ORG);

        expect(overview.pipelineValue).toBe(125000);
    });
});

describe('AnalyticsUseCases.dashboard — tmqMetric nunca fabricado', () => {
    it('tmqMetric é sempre null — não existe timestamp real de qualificação para o funil Lead', async () => {
        const repo = buildFakeRepository();
        const useCases = new AnalyticsUseCases(repo);

        const dashboard = await useCases.dashboard(ORG);

        expect(dashboard.tmqMetric).toBeNull();
    });
});

describe('AnalyticsUseCases.dashboard — widgets antes hardcoded para vazio agora usam dado real', () => {
    it('lostReasons reflete o agrupamento real do repositório, com rótulo de ausência explícito', async () => {
        const repo = buildFakeRepository({
            groupLostLeadsByReason: vi.fn().mockResolvedValue([
                { value: 'Preço', count: 4 },
                { value: null, count: 2 },
            ]),
        });
        const useCases = new AnalyticsUseCases(repo);

        const dashboard = await useCases.dashboard(ORG);

        expect(dashboard.lostReasons).toEqual([
            { label: 'Preço', count: 4 },
            { label: 'Sem motivo registrado', count: 2 },
        ]);
    });

    it('callHeatmap agrupa os timestamps reais de ligação em (dia da semana, hora)', async () => {
        // Quarta-feira (getDay()===3), 14h — fixado por data literal para não depender de timezone do CI.
        const wednesday14h = new Date('2026-08-12T14:30:00');
        const repo = buildFakeRepository({
            findCallActivityTimestamps: vi.fn().mockResolvedValue([wednesday14h, wednesday14h]),
        });
        const useCases = new AnalyticsUseCases(repo);

        const dashboard = await useCases.dashboard(ORG);

        expect(dashboard.callHeatmap).toEqual([
            { dayOfWeek: wednesday14h.getDay(), hour: 14, count: 2 },
        ]);
    });

    it('performanceReport calcula leadsQualified/conversionRate a partir de dois agrupamentos reais (atribuídos x qualificados)', async () => {
        const repo = buildFakeRepository({
            groupLeadsByOwner: vi.fn((_org: string, status?: string) => {
                if (status) return Promise.resolve([]); // wonByOwnerRows não é usado neste teste
                return Promise.resolve([{ value: 'user-1', count: 10 }] as GroupCount[]);
            }),
            groupQualifiedLeadsByOwner: vi.fn().mockResolvedValue([{ value: 'user-1', count: 4 }] as GroupCount[]),
        });
        const useCases = new AnalyticsUseCases(repo);

        const dashboard = await useCases.dashboard(ORG);

        expect(dashboard.performanceReport).toEqual([
            { agent: 'user-1', isAi: false, leadsAssigned: 10, leadsQualified: 4, conversionRate: 40 },
        ]);
    });

    it('owner vazio no relatório de performance vira "Sem Dono", nunca um nome inventado', async () => {
        const repo = buildFakeRepository({
            groupLeadsByOwner: vi.fn((_org: string, status?: string) => {
                if (status) return Promise.resolve([]);
                return Promise.resolve([{ value: null, count: 5 }] as GroupCount[]);
            }),
        });
        const useCases = new AnalyticsUseCases(repo);

        const dashboard = await useCases.dashboard(ORG);

        expect(dashboard.performanceReport[0].agent).toBe('Sem Dono');
    });
});
