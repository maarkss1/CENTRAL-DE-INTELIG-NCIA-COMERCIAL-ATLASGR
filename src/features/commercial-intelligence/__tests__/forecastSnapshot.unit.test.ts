import { describe, it, expect } from 'vitest';
import { buildForecastSnapshot } from '../application/forecastSnapshot';
import { FORECAST_RULES_VERSION } from '../application/forecastEngine';
import { InMemoryForecastSnapshotStore } from '../infra/InMemoryForecastSnapshotStore';
import type { ExecutiveOverview } from '../domain/CommercialIntelligence';

const ORG = 'org-1';
const NOW = new Date('2026-08-15T12:00:00Z');

function minimalOverview(overrides: Partial<ExecutiveOverview> = {}): ExecutiveOverview {
    return {
        period: '2026-08',
        goal: { period: '2026-08', metric: 'NEW_MRR', amount: 100_000, currency: 'BRL', updatedAt: NOW.toISOString(), createdBy: 'user-1' },
        closedAmount: 10_000,
        closedCount: 1,
        pctOfGoal: 10,
        commitAmount: 40_000,
        commitCount: 2,
        bestCaseAmount: 20_000,
        bestCaseCount: 1,
        upsideAmount: 5_000,
        upsideCount: 1,
        forecastAmount: 75_000,
        gapForecast: 25_000,
        gapCommit: 50_000,
        pipelineTotal: 150_000,
        pipelineTotalCount: 5,
        pipelineEligible: 90_000,
        pipelineEligibleCount: 3,
        coverageMonth: { coverage: 2, coverageRecommended: 3, pipelineEligible: 90_000, remainingGoal: 90_000 },
        coverage30: { coverage: null, coverageRecommended: null, pipelineEligible: 0, remainingGoal: 0 },
        coverage60: { coverage: null, coverageRecommended: null, pipelineEligible: 0, remainingGoal: 0 },
        coverage90: { coverage: null, coverageRecommended: null, pipelineEligible: 0, remainingGoal: 0 },
        coverageProtection: [],
        previousPeriod: null,
        forecastConfidence: { score: null, classification: null, sampleSize: 0, fieldCompletenessScore: null, stageHistoryCoverage: null, sampleSizePenaltyApplied: false },
        isEmpty: false,
        dataAsOf: NOW.toISOString(),
        ...overrides,
    };
}

describe('forecastSnapshot.buildForecastSnapshot — cópia append-only, sem cálculo novo', () => {
    it('copia Commit/Best Case/Forecast de ExecutiveOverview e carrega a versão vigente das regras', () => {
        const overview = minimalOverview();
        const record = buildForecastSnapshot(ORG, overview, NOW);

        expect(record.organizationId).toBe(ORG);
        expect(record.period).toBe('2026-08');
        expect(record.snapshotAt).toBe(NOW.toISOString());
        expect(record.rulesVersion).toBe(FORECAST_RULES_VERSION);
        expect(record.commitAmount).toBe(40_000);
        expect(record.bestCaseAmount).toBe(20_000);
        expect(record.forecastAmount).toBe(75_000);
        expect(record.currency).toBe('BRL');
    });

    it('usa BRL como fallback de moeda quando não há meta cadastrada para o período', () => {
        const overview = minimalOverview({ goal: null });
        const record = buildForecastSnapshot(ORG, overview, NOW);
        expect(record.currency).toBe('BRL');
    });

    it('cada chamada gera um id novo — nunca reaproveita/colide id entre snapshots', () => {
        const overview = minimalOverview();
        const a = buildForecastSnapshot(ORG, overview, NOW);
        const b = buildForecastSnapshot(ORG, overview, NOW);
        expect(a.id).not.toBe(b.id);
    });
});

describe('InMemoryForecastSnapshotStore — protótipo append-only (persistência real pendente de handoff de schema)', () => {
    it('save nunca sobrescreve — dois snapshots do mesmo período convivem', async () => {
        const store = new InMemoryForecastSnapshotStore();
        const first = buildForecastSnapshot(ORG, minimalOverview({ forecastAmount: 70_000 }), new Date('2026-08-01T00:00:00Z'));
        const second = buildForecastSnapshot(ORG, minimalOverview({ forecastAmount: 75_000 }), new Date('2026-08-08T00:00:00Z'));
        await store.save(first);
        await store.save(second);

        const byPeriod = await store.findByPeriod(ORG, '2026-08');
        expect(byPeriod).toHaveLength(2);
        // ordenado por snapshotAt crescente (o mais antigo primeiro)
        expect(byPeriod[0].forecastAmount).toBe(70_000);
        expect(byPeriod[1].forecastAmount).toBe(75_000);
    });

    it('isola por organizationId — snapshot de uma organização nunca aparece em outra', async () => {
        const store = new InMemoryForecastSnapshotStore();
        await store.save(buildForecastSnapshot('org-a', minimalOverview(), NOW));
        await store.save(buildForecastSnapshot('org-b', minimalOverview(), NOW));

        expect(await store.findAll('org-a')).toHaveLength(1);
        expect(await store.findAll('org-b')).toHaveLength(1);
    });

    it('findByPeriod não retorna nada para um período sem nenhum snapshot salvo', async () => {
        const store = new InMemoryForecastSnapshotStore();
        await store.save(buildForecastSnapshot(ORG, minimalOverview({ period: '2026-08' }), NOW));
        expect(await store.findByPeriod(ORG, '2026-09')).toEqual([]);
    });
});
