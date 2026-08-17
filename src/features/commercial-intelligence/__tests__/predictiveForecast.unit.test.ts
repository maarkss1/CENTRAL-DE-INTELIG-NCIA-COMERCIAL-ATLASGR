import { describe, it, expect } from 'vitest';
import { buildForecastRange, computeTrendMomentum, TREND_MOMENTUM_THRESHOLD_PP } from '../application/predictiveForecast';
import type { ExecutiveOverview, HistoricalTrendsReport } from '../domain/CommercialIntelligence';

const EMPTY_COVERAGE = { coverage: null, coverageRecommended: null, pipelineEligible: 0, remainingGoal: 0 };

function overview(overrides: Partial<ExecutiveOverview> = {}): ExecutiveOverview {
    return {
        period: '2026-08',
        goal: { period: '2026-08', metric: 'NEW_MRR', amount: 100000, currency: 'BRL', updatedAt: new Date().toISOString(), createdBy: 'user-1' },
        closedAmount: 10000,
        closedCount: 2,
        pctOfGoal: 10,
        commitAmount: 20000,
        commitCount: 3,
        bestCaseAmount: 15000,
        bestCaseCount: 2,
        upsideAmount: 5000,
        upsideCount: 1,
        forecastAmount: 35000,
        gapForecast: 65000,
        gapCommit: 70000,
        pipelineTotal: 60000,
        pipelineTotalCount: 8,
        pipelineEligible: 40000,
        pipelineEligibleCount: 6,
        coverageMonth: EMPTY_COVERAGE,
        coverage30: EMPTY_COVERAGE,
        coverage60: EMPTY_COVERAGE,
        coverage90: EMPTY_COVERAGE,
        coverageProtection: [],
        previousPeriod: null,
        forecastConfidence: { score: 70, classification: 'atencao', sampleSize: 6, fieldCompletenessScore: 70, stageHistoryCoverage: 50, sampleSizePenaltyApplied: false },
        isEmpty: false,
        dataAsOf: new Date().toISOString(),
        ...overrides,
    };
}

function trends(points: Array<Partial<HistoricalTrendsReport['points'][number]>>): HistoricalTrendsReport {
    return {
        points: points.map((p, i) => ({
            period: `2026-0${i + 1}`,
            label: `M${i + 1}`,
            winRate: null,
            salesCycleMeanDays: null,
            averageTicketWon: null,
            pipelineCreatedAmount: null,
            closedSampleSize: 0,
            ...p,
        })),
    };
}

describe('predictiveForecast', () => {
    describe('buildForecastRange', () => {
        it('conservador = fechado + commit; provável = forecast já calculado; otimista = fechado + pipeline total', () => {
            const range = buildForecastRange(overview());
            expect(range.conservative.amount).toBe(30000);
            expect(range.likely.amount).toBe(35000);
            expect(range.optimistic.amount).toBe(70000);
        });

        it('otimista nunca é menor que provável — bug real encontrado via QA: somar só os tiers Commit/BestCase/Upside deixava de fora negócios tier "Pipeline" que o forecast ponderado já conta parcialmente', () => {
            // Negócio de probabilidade média (tier "Pipeline") pesa no forecast ponderado mas não
            // teria seu valor cheio contado por commit/bestCase/upside — cenário que reproduziu o bug.
            const range = buildForecastRange(overview({
                closedAmount: 45000, commitAmount: 210000, bestCaseAmount: 95000, upsideAmount: 60000,
                forecastAmount: 413000, pipelineTotal: 545000,
            }));
            expect(range.optimistic.amount).toBeGreaterThanOrEqual(range.likely.amount);
            expect(range.optimistic.amount).toBe(590000);
        });

        it('gapToGoal null quando não há meta cadastrada', () => {
            const range = buildForecastRange(overview({ goal: null }));
            expect(range.conservative.gapToGoal).toBeNull();
            expect(range.likely.gapToGoal).toBeNull();
            expect(range.optimistic.gapToGoal).toBeNull();
        });

        it('gapToGoal nunca negativo — cenário que já bate a meta vira 0, não negativo', () => {
            const range = buildForecastRange(overview({ goal: { period: '2026-08', metric: 'NEW_MRR', amount: 40000, currency: 'BRL', updatedAt: new Date().toISOString(), createdBy: null } }));
            expect(range.optimistic.gapToGoal).toBe(0);
            expect(range.conservative.gapToGoal).toBe(10000);
        });

        it('funciona com todos os tiers zerados (sem negócio aberto)', () => {
            const range = buildForecastRange(overview({ closedAmount: 0, commitAmount: 0, bestCaseAmount: 0, upsideAmount: 0, forecastAmount: 0, pipelineTotal: 0 }));
            expect(range.conservative.amount).toBe(0);
            expect(range.likely.amount).toBe(0);
            expect(range.optimistic.amount).toBe(0);
        });

        it('usa a moeda da meta cadastrada, ou BRL como padrão sem meta', () => {
            expect(buildForecastRange(overview()).currency).toBe('BRL');
            expect(buildForecastRange(overview({ goal: null })).currency).toBe('BRL');
        });
    });

    describe('computeTrendMomentum', () => {
        it('null com menos de 2 pontos com amostra avaliável', () => {
            expect(computeTrendMomentum(trends([]))).toBeNull();
            expect(computeTrendMomentum(trends([{ winRate: 50, closedSampleSize: 3 }]))).toBeNull();
        });

        it('ignora pontos sem amostra (closedSampleSize 0) ao calcular a média anterior', () => {
            const result = computeTrendMomentum(trends([
                { winRate: 40, closedSampleSize: 0 },
                { winRate: 50, closedSampleSize: 4 },
                { winRate: 60, closedSampleSize: 5 },
            ]));
            expect(result?.previousAverageWinRate).toBe(50);
            expect(result?.latestWinRate).toBe(60);
        });

        it(`classifica 'melhorando' quando o delta é >= ${TREND_MOMENTUM_THRESHOLD_PP}pp`, () => {
            const result = computeTrendMomentum(trends([
                { winRate: 40, closedSampleSize: 4 },
                { winRate: 50, closedSampleSize: 5 },
            ]));
            expect(result?.direction).toBe('melhorando');
            expect(result?.deltaPercentagePoints).toBe(10);
        });

        it(`classifica 'piorando' quando o delta é <= -${TREND_MOMENTUM_THRESHOLD_PP}pp`, () => {
            const result = computeTrendMomentum(trends([
                { winRate: 60, closedSampleSize: 4 },
                { winRate: 50, closedSampleSize: 5 },
            ]));
            expect(result?.direction).toBe('piorando');
        });

        it('classifica \'estavel\' dentro do limiar', () => {
            const result = computeTrendMomentum(trends([
                { winRate: 50, closedSampleSize: 4 },
                { winRate: 51, closedSampleSize: 5 },
            ]));
            expect(result?.direction).toBe('estavel');
        });
    });
});
