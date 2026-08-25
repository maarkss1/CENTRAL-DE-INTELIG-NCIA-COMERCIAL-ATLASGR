/**
 * Eficiência (Fase 4) — Win Rate, ticket médio, ciclo de venda e funil de conversão (snapshot atual
 * + alcance histórico real via `LeadStageHistory`, seção 12).
 */

import type { CommercialIntelligenceFilter, CommercialIntelligenceRepository, FunnelStageConversion, PerformanceMetrics } from '../../domain/CommercialIntelligence';
import { STAGE_AGING_CRITICAL_DAYS, checkEligibility, isDealOpen } from '../pipelineEligibility';
import { daysBetween, mean, median, roundMoney } from '../shared/mathUtils';
import { monthRange } from '../shared/period';
import { buildStageDurationStats, loadScoredDeals, type ScoredDeal } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';
import { computeHistoricalStageReach, countAdvancedTransitions } from '../scoring/stageHistoryAnalytics';

export async function buildPerformance(
    repository: CommercialIntelligenceRepository,
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now: Date
): Promise<PerformanceMetrics> {
    const { start, end } = monthRange(filter.month);
    const { scored, stages, history } = await loadScoredDeals(repository, organizationId, now);
    const inScope = applyScope(scored, filter);

    const createdInPeriod = inScope.filter((s) => s.deal.createdAt >= start && s.deal.createdAt < end);
    const closedInPeriod = inScope.filter((s) => (s.deal.stageIsWon || s.deal.stageIsLost) && s.deal.closedAt && s.deal.closedAt >= start && s.deal.closedAt < end);
    const won = closedInPeriod.filter((s) => s.deal.stageIsWon);
    const lost = closedInPeriod.filter((s) => s.deal.stageIsLost);
    const open = inScope.filter((s) => isDealOpen(s.deal));
    const eligible = open.filter((s) => checkEligibility(s.deal, now, s.daysInCurrentStage).eligible);
    const stalled = open.filter((s) => s.agingDays > STAGE_AGING_CRITICAL_DAYS);
    const atRisk = open.filter((s) => s.forecast.tier === 'Upside' || s.forecast.negativeFactors.length >= 2);

    const advanced = countAdvancedTransitions(history, start, end);

    const winRate = won.length + lost.length > 0 ? roundMoney((won.length / (won.length + lost.length)) * 100) : null;

    const avg = (rows: ScoredDeal[]) => (rows.length > 0 ? roundMoney(rows.reduce((s, r) => s + r.deal.amount, 0) / rows.length) : null);

    const cycleDays = closedInPeriod
        .filter((s) => s.deal.closedAt)
        .map((s) => daysBetween(s.deal.createdAt, s.deal.closedAt as Date))
        .filter((d) => d >= 0);

    const durationStats = buildStageDurationStats(history);
    const openStages = stages.filter((stage) => !stage.isWon && !stage.isLost).sort((a, b) => a.sortOrder - b.sortOrder);
    const wonCount = scored.filter((s) => s.deal.stageIsWon).length;
    const wonAmount = roundMoney(scored.filter((s) => s.deal.stageIsWon).reduce((sum, s) => sum + s.deal.amount, 0));

    const countByStage = new Map<string, { count: number; amount: number }>();
    for (const s of open) {
        if (!s.deal.pipelineStageId) continue;
        const entry = countByStage.get(s.deal.pipelineStageId) ?? { count: 0, amount: 0 };
        entry.count += 1;
        entry.amount += s.deal.amount;
        countByStage.set(s.deal.pipelineStageId, entry);
    }

    const historicalReach = computeHistoricalStageReach(inScope, history, openStages);

    const cumulative: FunnelStageConversion[] = openStages.map((stage, index) => {
        const downstream = openStages.slice(index).reduce(
            (sum, s2) => {
                const bucket = countByStage.get(s2.id) ?? { count: 0, amount: 0 };
                return { count: sum.count + bucket.count, amount: sum.amount + bucket.amount };
            },
            { count: 0, amount: 0 }
        );
        const reach = historicalReach.get(stage.id) ?? { count: 0, amount: 0 };
        return {
            stageId: stage.id,
            label: stage.name,
            sortOrder: stage.sortOrder,
            count: downstream.count + wonCount,
            amount: roundMoney(downstream.amount + wonAmount),
            conversionFromPrevious: null,
            averageDaysInStage: durationStats.get(stage.id) != null ? roundMoney(durationStats.get(stage.id) as number) : null,
            historicalReachedCount: reach.count,
            historicalReachedAmount: reach.amount,
            historicalConversionFromPrevious: null,
        };
    });
    for (let i = 1; i < cumulative.length; i++) {
        cumulative[i].conversionFromPrevious = cumulative[i - 1].count > 0 ? roundMoney((cumulative[i].count / cumulative[i - 1].count) * 100) : null;
        cumulative[i].historicalConversionFromPrevious = cumulative[i - 1].historicalReachedCount > 0
            ? roundMoney((cumulative[i].historicalReachedCount / cumulative[i - 1].historicalReachedCount) * 100)
            : null;
    }

    const funnelHistoricalTrackingSince = history.length > 0
        ? history.reduce((min, h) => (h.enteredAt < min ? h.enteredAt : min), history[0].enteredAt).toISOString()
        : null;

    return {
        period: filter.month,
        winRate,
        wonCount: won.length,
        lostCount: lost.length,
        opportunities: {
            open: open.length,
            createdInPeriod: createdInPeriod.length,
            won: won.length,
            lost: lost.length,
            advanced,
            stalled: stalled.length,
            eligible: eligible.length,
            commit: open.filter((s) => s.forecast.tier === 'Commit').length,
            bestCase: open.filter((s) => s.forecast.tier === 'BestCase').length,
            atRisk: atRisk.length,
        },
        averageTicket: {
            created: avg(createdInPeriod),
            open: avg(open),
            won: avg(won),
            lost: avg(lost),
        },
        salesCycle: {
            meanDays: mean(cycleDays),
            medianDays: median(cycleDays),
            sampleSize: cycleDays.length,
        },
        funnel: cumulative,
        funnelHistoricalTrackingSince,
    };
}
