import { describe, expect, it } from 'vitest';
import type { DealRow, ForecastTier } from '../domain/CommercialIntelligence';
import { buildStageDurationStats, currentStageEntry, riskImpactValue, type ScoredDeal, type StageHistoryRow } from '../application/scoring/dealScoring';
import { applyScope } from '../application/scoring/scopeFilter';
import { computeHistoricalStageReach, countAdvancedTransitions } from '../application/scoring/stageHistoryAnalytics';

/**
 * Testes de domínio isolados para os módulos extraídos de `CommercialIntelligenceUseCases.ts`
 * (ITEM-08) — não passam por nenhum repositório/relatório, só pelas funções puras de
 * `application/scoring/*`. O comportamento ponta a ponta desses mesmos cálculos continua coberto
 * por `CommercialIntelligenceUseCases.unit.test.ts` através da fachada.
 */

function deal(overrides: Partial<DealRow> & { id: string }): DealRow {
    return {
        title: overrides.id,
        amount: 0,
        owner: null,
        source: null,
        companyId: null,
        companyName: null,
        companyCnpj: null,
        contactId: null,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
        closedAt: null,
        expectedCloseAt: null,
        lastInteraction: null,
        nextAction: null,
        lossReason: null,
        lossObservation: null,
        status: 'Nova_Oportunidade',
        bitrixLeadId: null,
        bitrixDealId: null,
        bitrixSyncStatus: null,
        bitrixSyncError: null,
        bitrixSyncedAt: null,
        pipelineId: null,
        pipelineStageId: null,
        stageName: null,
        stageSortOrder: null,
        stageProbability: null,
        stageIsWon: false,
        stageIsLost: false,
        productSkus: [],
        icp: null,
        ...overrides,
    };
}

function scoredDeal(dealOverrides: Partial<DealRow> & { id: string }, tier: ForecastTier = 'Pipeline', probability = 20): ScoredDeal {
    return {
        deal: deal(dealOverrides),
        forecast: { probability, weightedValue: 0, tier, positiveFactors: [], negativeFactors: [] },
        daysInCurrentStage: null,
        agingDays: 0,
    };
}

describe('scopeFilter.applyScope', () => {
    it('sem filtro algum, mantém todos os negócios', () => {
        const scored = [scoredDeal({ id: 'a', owner: 'ana' }), scoredDeal({ id: 'b', owner: 'bruno' })];
        expect(applyScope(scored, { month: '2026-08' })).toHaveLength(2);
    });

    it('filtra por owner exato', () => {
        const scored = [scoredDeal({ id: 'a', owner: 'ana' }), scoredDeal({ id: 'b', owner: 'bruno' })];
        const result = applyScope(scored, { month: '2026-08', owner: 'ana' });
        expect(result.map((s) => s.deal.id)).toEqual(['a']);
    });

    it('filtra por produto: exige que productSkus contenha o SKU informado', () => {
        const scored = [scoredDeal({ id: 'a', productSkus: ['SKU-1', 'SKU-2'] }), scoredDeal({ id: 'b', productSkus: ['SKU-3'] })];
        const result = applyScope(scored, { month: '2026-08', product: 'SKU-2' });
        expect(result.map((s) => s.deal.id)).toEqual(['a']);
    });

    it('filtra por empresa: compara companyName exato', () => {
        const scored = [scoredDeal({ id: 'a', companyName: 'Empresa A' }), scoredDeal({ id: 'b', companyName: 'Empresa B' })];
        const result = applyScope(scored, { month: '2026-08', company: 'Empresa B' });
        expect(result.map((s) => s.deal.id)).toEqual(['b']);
    });

    it('combina múltiplos filtros (AND, não OR)', () => {
        const scored = [
            scoredDeal({ id: 'a', owner: 'ana', source: 'Indicação' }),
            scoredDeal({ id: 'b', owner: 'ana', source: 'Site' }),
            scoredDeal({ id: 'c', owner: 'bruno', source: 'Indicação' }),
        ];
        const result = applyScope(scored, { month: '2026-08', owner: 'ana', source: 'Indicação' });
        expect(result.map((s) => s.deal.id)).toEqual(['a']);
    });
});

describe('dealScoring.riskImpactValue', () => {
    it('valor em risco = valor × (1 − probabilidade/100)', () => {
        const s = scoredDeal({ id: 'a', amount: 100_000 }, 'Commit', 80);
        expect(riskImpactValue(s)).toBeCloseTo(100_000 * 0.2, 6);
    });

    it('probabilidade 100% não deixa nenhum valor em risco', () => {
        const s = scoredDeal({ id: 'a', amount: 50_000 }, 'Commit', 100);
        expect(riskImpactValue(s)).toBe(0);
    });
});

describe('dealScoring.buildStageDurationStats', () => {
    it('ignora segmentos ainda abertos (exitedAt null) — só mede o que já concluiu', () => {
        const history: StageHistoryRow[] = [
            { leadId: 'lead-1', stageId: 'stage-a', stageName: 'A', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: new Date('2026-08-05T00:00:00Z') },
            { leadId: 'lead-2', stageId: 'stage-a', stageName: 'A', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: null },
        ];
        const stats = buildStageDurationStats(history);
        expect(stats.get('stage-a')).toBe(4);
    });

    it('calcula a média quando há múltiplos segmentos concluídos na mesma etapa', () => {
        const history: StageHistoryRow[] = [
            { leadId: 'lead-1', stageId: 'stage-a', stageName: 'A', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: new Date('2026-08-03T00:00:00Z') },
            { leadId: 'lead-2', stageId: 'stage-a', stageName: 'A', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: new Date('2026-08-07T00:00:00Z') },
        ];
        expect(buildStageDurationStats(history).get('stage-a')).toBe(4);
    });
});

describe('dealScoring.currentStageEntry', () => {
    it('devolve a linha em aberto mais recente do lead naquela etapa', () => {
        const history: StageHistoryRow[] = [
            { leadId: 'lead-1', stageId: 'stage-a', stageName: 'A', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: null },
            { leadId: 'lead-1', stageId: 'stage-a', stageName: 'A', enteredAt: new Date('2026-08-10T00:00:00Z'), exitedAt: null },
        ];
        const entry = currentStageEntry(history, 'lead-1', 'stage-a');
        expect(entry?.enteredAt.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    });

    it('sem stageId, devolve null', () => {
        expect(currentStageEntry([], 'lead-1', null)).toBeNull();
    });
});

describe('stageHistoryAnalytics.countAdvancedTransitions', () => {
    it('a primeira linha de histórico de um lead nunca conta como avanço', () => {
        const history: StageHistoryRow[] = [{ leadId: 'lead-1', stageId: 'stage-a', stageName: 'A', enteredAt: new Date('2026-08-05T00:00:00Z'), exitedAt: null }];
        const count = countAdvancedTransitions(history, new Date('2026-08-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z'));
        expect(count).toBe(0);
    });

    it('a 2ª+ transição dentro da janela conta como avanço', () => {
        const history: StageHistoryRow[] = [
            { leadId: 'lead-1', stageId: 'stage-a', stageName: 'A', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: new Date('2026-08-05T00:00:00Z') },
            { leadId: 'lead-1', stageId: 'stage-b', stageName: 'B', enteredAt: new Date('2026-08-05T00:00:00Z'), exitedAt: null },
        ];
        const count = countAdvancedTransitions(history, new Date('2026-08-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z'));
        expect(count).toBe(1);
    });
});

describe('stageHistoryAnalytics.computeHistoricalStageReach', () => {
    const openStages = [
        { id: 'stage-nova', sortOrder: 0 },
        { id: 'stage-proposta', sortOrder: 1 },
    ];

    it('negócio perdido cedo não conta como tendo alcançado uma etapa posterior', () => {
        const lost = scoredDeal({ id: 'lost-1', stageIsLost: true, stageSortOrder: 3 });
        const history: StageHistoryRow[] = [
            { leadId: 'lost-1', stageId: 'stage-nova', stageName: 'Nova', enteredAt: new Date('2026-08-01T00:00:00Z'), exitedAt: new Date('2026-08-02T00:00:00Z') },
        ];
        const reach = computeHistoricalStageReach([lost], history, openStages);
        expect(reach.get('stage-nova')?.count).toBe(1);
        expect(reach.get('stage-proposta')?.count).toBe(0);
    });

    it('negócio aberto sem histórico usa a etapa atual como alcançada (registro legado)', () => {
        const open = scoredDeal({ id: 'open-1', stageSortOrder: 1 });
        const reach = computeHistoricalStageReach([open], [], openStages);
        expect(reach.get('stage-nova')?.count).toBe(1);
        expect(reach.get('stage-proposta')?.count).toBe(1);
    });

    it('negócio fechado sem nenhuma linha de histórico não é contado em nenhuma etapa', () => {
        const won = scoredDeal({ id: 'won-1', stageIsWon: true, stageSortOrder: 2 });
        const reach = computeHistoricalStageReach([won], [], openStages);
        expect(reach.get('stage-nova')?.count).toBe(0);
        expect(reach.get('stage-proposta')?.count).toBe(0);
    });
});
