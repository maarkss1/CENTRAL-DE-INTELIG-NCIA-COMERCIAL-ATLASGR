import type {
    CommercialIntelligenceFilter,
    CommercialIntelligenceRepository,
    CommercialGoalDTO,
    CoverageSnapshot,
    CoverageProtectionEntry,
    CoverageProtectionStatus,
    PreviousPeriodComparison,
    ForecastConfidence,
    DataReadinessScore,
    DataReadinessField,
    DealRow,
    ExecutiveOverview,
    PipelineCreation,
    PerformanceMetrics,
    FunnelStageConversion,
    AgingReport,
    AgingBucket,
    StageAging,
    LossAnalysis,
    LeadingIndicatorsReport,
    LeadingIndicatorPoint,
    ExecutiveAlert,
    CrmQualityIndex,
    BitrixSyncHealth,
    DealDrillDownQuery,
    DealDrillDownResult,
    DealDrillDownRow,
    ForecastTier,
    GoalMetric,
    FilterOptions,
    HistoricalTrendsReport,
    HistoricalTrendPoint,
} from '../domain/CommercialIntelligence';
import { scoreOpportunity, type ForecastResult } from './forecastEngine';
import { checkEligibility, isDealOpen, agingInStageDays, STAGE_AGING_CRITICAL_DAYS } from './pipelineEligibility';
import { classifyLossReason } from './lossTaxonomy';
import { shiftMonth, monthLabelPt, countBusinessDays } from './executiveCalendar';
import {
    DATA_READINESS_OPEN_FIELD_WEIGHTS,
    DATA_READINESS_LOSS_FIELD_WEIGHT,
    FORECAST_CONFIDENCE_FIELDS,
    DEAL_FIELD_TESTS,
    weightedCompletenessScore,
    classifyCompleteness,
} from './dataReadiness';

/**
 * Limiares-padrão de "Proteção 90 dias" (seção 11) quando ainda não há Win Rate histórico
 * calculável para derivar `coverageRecommended` (1 / Win Rate). Política inicial documentada —
 * mesmo espírito de `STAGE_AGING_CRITICAL_DAYS` — não uma medição. Quando há Win Rate real, os
 * limiares saudável/atenção usam `coverageRecommended` no lugar destes.
 */
export const COVERAGE_PROTECTION_FALLBACK_HEALTHY = 3;
export const COVERAGE_PROTECTION_FALLBACK_WARNING = 1.5;

export function classifyCoverageProtection(hasGoal: boolean, coverage: number | null, coverageRecommended: number | null): CoverageProtectionStatus {
    if (!hasGoal || coverage == null) return 'sem_dados';
    if (coverageRecommended != null && coverageRecommended > 0) {
        if (coverage >= coverageRecommended) return 'saudavel';
        if (coverage >= coverageRecommended * 0.6) return 'atencao';
        return 'critico';
    }
    if (coverage >= COVERAGE_PROTECTION_FALLBACK_HEALTHY) return 'saudavel';
    if (coverage >= COVERAGE_PROTECTION_FALLBACK_WARNING) return 'atencao';
    return 'critico';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const result = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return Math.round(result * 100) / 100;
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function monthRange(period: string): { start: Date; end: Date; daysInMonth: number } {
    const [year, month] = period.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    return { start, end, daysInMonth };
}

export function currentPeriod(now = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

type StageHistoryRow = { leadId: string; stageId: string | null; stageName: string; enteredAt: Date; exitedAt: Date | null };

/** Duração média (dias) de segmentos JÁ CONCLUÍDOS (`exitedAt` preenchido) por etapa — usada tanto pelo forecast (estagnação) quanto pelo aging por etapa. */
function buildStageDurationStats(history: StageHistoryRow[]): Map<string, number> {
    const byStage = new Map<string, number[]>();
    for (const row of history) {
        if (!row.stageId || !row.exitedAt) continue;
        const days = daysBetween(row.enteredAt, row.exitedAt);
        if (!byStage.has(row.stageId)) byStage.set(row.stageId, []);
        byStage.get(row.stageId)!.push(days);
    }
    const result = new Map<string, number>();
    for (const [stageId, durations] of byStage) {
        const avg = durations.reduce((s, v) => s + v, 0) / durations.length;
        result.set(stageId, avg);
    }
    return result;
}

/** Linha de histórico "em aberto" (exitedAt null) mais recente para um lead numa etapa específica — é a entrada na etapa atual. */
function currentStageEntry(history: StageHistoryRow[], leadId: string, stageId: string | null): StageHistoryRow | null {
    if (!stageId) return null;
    const rows = history
        .filter((row) => row.leadId === leadId && row.stageId === stageId && row.exitedAt == null)
        .sort((a, b) => b.enteredAt.getTime() - a.enteredAt.getTime());
    return rows[0] ?? null;
}

interface ScoredDeal {
    deal: DealRow;
    forecast: ForecastResult;
    daysInCurrentStage: number | null;
    agingDays: number;
}

/** Filtro comum a quase todo relatório: só o funil "Negócio". `findDeals` já devolve só esse funil (ver o repositório Prisma). */
export class CommercialIntelligenceUseCases {
    constructor(private repository: CommercialIntelligenceRepository) {}

    private async loadScoredDeals(organizationId: string, now: Date): Promise<{ scored: ScoredDeal[]; stages: Awaited<ReturnType<CommercialIntelligenceRepository['findDealPipelineStages']>>; history: StageHistoryRow[] }> {
        const [deals, stages, history] = await Promise.all([
            this.repository.findDeals(organizationId),
            this.repository.findDealPipelineStages(organizationId),
            this.repository.findStageHistory(organizationId),
        ]);

        const durationStats = buildStageDurationStats(history);

        const scored: ScoredDeal[] = deals.map((deal) => {
            const entry = currentStageEntry(history, deal.id, deal.pipelineStageId);
            const daysInCurrentStage = entry ? daysBetween(entry.enteredAt, now) : null;
            const stageAverageDurationDays = deal.pipelineStageId ? durationStats.get(deal.pipelineStageId) ?? null : null;

            const forecast = scoreOpportunity({
                amount: deal.amount,
                stageProbability: deal.stageProbability ?? 0,
                now,
                createdAt: deal.createdAt,
                expectedCloseAt: deal.expectedCloseAt,
                lastInteraction: deal.lastInteraction,
                nextAction: deal.nextAction,
                daysInCurrentStage,
                stageAverageDurationDays,
            });

            return {
                deal,
                forecast,
                daysInCurrentStage,
                agingDays: agingInStageDays(deal, now, daysInCurrentStage),
            };
        });

        return { scored, stages, history };
    }

    // ─── Metas ──────────────────────────────────────────────────────────────

    async getGoal(organizationId: string, period: string, metric: GoalMetric = 'NEW_MRR'): Promise<CommercialGoalDTO | null> {
        return this.repository.getGoal(organizationId, period, metric);
    }

    async setGoal(organizationId: string, period: string, amount: number, createdBy: string, currency = 'BRL', metric: GoalMetric = 'NEW_MRR'): Promise<CommercialGoalDTO> {
        return this.repository.upsertGoal(organizationId, period, metric, amount, currency, createdBy);
    }

    private applyScope(scored: ScoredDeal[], filter: CommercialIntelligenceFilter): ScoredDeal[] {
        return scored.filter((s) => {
            if (filter.owner && s.deal.owner !== filter.owner) return false;
            if (filter.source && s.deal.source !== filter.source) return false;
            // O ICP / Produto ainda não estão em DealRow, precisaremos adicioná-los no findDeals.
            if (filter.icp && s.deal.icp !== filter.icp) return false;
            if (filter.product && !s.deal.productSkus?.includes(filter.product)) return false;
            return true;
        });
    }

    // ─── Fase 2 + 3 — Cockpit executivo ─────────────────────────────────────

    async executiveOverview(organizationId: string, filter: CommercialIntelligenceFilter, now = new Date()): Promise<ExecutiveOverview> {
        const { start, end, daysInMonth } = monthRange(filter.month);
        const { scored, history } = await this.loadScoredDeals(organizationId, now);
        const inScope = this.applyScope(scored, filter);
        const historyLeadIds = new Set(history.map((h) => h.leadId));

        const goal = await this.repository.getGoal(organizationId, filter.month, 'NEW_MRR');

        const closed = inScope.filter((s) => (s.deal.stageIsWon || s.deal.stageIsLost) && s.deal.closedAt && s.deal.closedAt >= start && s.deal.closedAt < end);
        const won = closed.filter((s) => s.deal.stageIsWon);
        const lost = closed.filter((s) => s.deal.stageIsLost);
        const closedAmount = roundMoney(won.reduce((sum, s) => sum + s.deal.amount, 0));

        const open = inScope.filter((s) => isDealOpen(s.deal));
        const commit = open.filter((s) => s.forecast.tier === 'Commit');
        const bestCase = open.filter((s) => s.forecast.tier === 'BestCase');
        const pipelineTier = open.filter((s) => s.forecast.tier === 'Pipeline');
        const upside = open.filter((s) => s.forecast.tier === 'Upside');

        const commitAmount = roundMoney(commit.reduce((sum, s) => sum + s.deal.amount, 0));
        const bestCaseAmount = roundMoney(bestCase.reduce((sum, s) => sum + s.deal.amount, 0));
        const pipelineWeighted = roundMoney(pipelineTier.reduce((sum, s) => sum + s.forecast.weightedValue, 0));
        const upsideAmount = roundMoney(upside.reduce((sum, s) => sum + s.deal.amount, 0));

        const forecastAmount = roundMoney(closedAmount + commitAmount + bestCaseAmount + pipelineWeighted);

        const winRate = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : null;

        const eligible = open.filter((s) => checkEligibility(s.deal, now, s.daysInCurrentStage).eligible);
        const pipelineTotal = roundMoney(open.reduce((sum, s) => sum + s.deal.amount, 0));
        const pipelineEligible = roundMoney(eligible.reduce((sum, s) => sum + s.deal.amount, 0));

        const eligibleInRange = (from: Date, to: Date) =>
            roundMoney(
                eligible
                    .filter((s) => s.deal.expectedCloseAt && s.deal.expectedCloseAt >= from && s.deal.expectedCloseAt < to)
                    .reduce((sum, s) => sum + s.deal.amount, 0)
            );

        const coverageFor = (windowDays: number, pipelineInWindow: number, closedInWindow: number): CoverageSnapshot => {
            if (!goal) return { coverage: null, coverageRecommended: null, pipelineEligible: pipelineInWindow, remainingGoal: 0 };
            const proportionalGoal = windowDays === daysInMonth ? goal.amount : (goal.amount / daysInMonth) * windowDays;
            const remainingGoal = Math.max(0, roundMoney(proportionalGoal - closedInWindow));
            const coverage = remainingGoal > 0 ? roundMoney(pipelineInWindow / remainingGoal) : null;
            const coverageRecommended = winRate && winRate > 0 ? roundMoney(1 / (winRate / 100)) : null;
            return { coverage, coverageRecommended, pipelineEligible: pipelineInWindow, remainingGoal };
        };

        const in90 = new Date(now.getTime() + 90 * DAY_MS);
        const in60 = new Date(now.getTime() + 60 * DAY_MS);
        const in30 = new Date(now.getTime() + 30 * DAY_MS);

        const coverageMonth = coverageFor(daysInMonth, eligibleInRange(start, end), closedAmount);
        const coverage30 = coverageFor(30, eligibleInRange(now, in30), 0);
        const coverage60 = coverageFor(60, eligibleInRange(now, in60), 0);
        const coverage90 = coverageFor(90, eligibleInRange(now, in90), 0);

        // ─── Proteção 90 dias (seção 11): mês do filtro + M+1 + M+2 + M+3, em meses de calendário ──
        const coverageProtection: CoverageProtectionEntry[] = [];
        for (let i = 0; i <= 3; i++) {
            const period = shiftMonth(filter.month, i);
            const range = monthRange(period);
            const periodGoal = i === 0 ? goal : await this.repository.getGoal(organizationId, period, 'NEW_MRR');
            const pipelineEligibleInPeriod = eligibleInRange(range.start, range.end);
            const closedInPeriod = i === 0 ? closedAmount : 0;
            const remainingGoal = periodGoal ? Math.max(0, roundMoney(periodGoal.amount - closedInPeriod)) : null;
            const coverage = remainingGoal != null && remainingGoal > 0 ? roundMoney(pipelineEligibleInPeriod / remainingGoal) : null;
            const coverageRecommended = winRate && winRate > 0 ? roundMoney(1 / (winRate / 100)) : null;
            // Meta já batida (remainingGoal === 0): melhor status possível, não "sem_dados" — a meta
            // do mês foi coberta, mesmo que `coverage` fique null (nada mais precisa ser dividido).
            const status: CoverageProtectionStatus = periodGoal && remainingGoal === 0
                ? 'saudavel'
                : classifyCoverageProtection(!!periodGoal, coverage, coverageRecommended);
            coverageProtection.push({
                period,
                label: monthLabelPt(period),
                goalAmount: periodGoal ? periodGoal.amount : null,
                pipelineEligible: pipelineEligibleInPeriod,
                remainingGoal,
                coverage,
                coverageRecommended,
                status,
            });
        }

        // ─── Comparação com o mês anterior (seção 7/23) ──────────────────────────────
        const previousMonth = shiftMonth(filter.month, -1);
        const previousRange = monthRange(previousMonth);
        const closedPrev = inScope.filter((s) => (s.deal.stageIsWon || s.deal.stageIsLost) && s.deal.closedAt && s.deal.closedAt >= previousRange.start && s.deal.closedAt < previousRange.end);
        const wonPrev = closedPrev.filter((s) => s.deal.stageIsWon);
        const lostPrev = closedPrev.filter((s) => s.deal.stageIsLost);
        const previousPeriod: PreviousPeriodComparison | null = closedPrev.length > 0 ? {
            period: previousMonth,
            closedAmount: roundMoney(wonPrev.reduce((sum, s) => sum + s.deal.amount, 0)),
            closedCount: wonPrev.length,
            winRate: wonPrev.length + lostPrev.length > 0 ? roundMoney((wonPrev.length / (wonPrev.length + lostPrev.length)) * 100) : null,
        } : null;

        const forecastConfidence = this.computeForecastConfidence(open, historyLeadIds);

        return {
            period: filter.month,
            goal,
            closedAmount,
            closedCount: won.length,
            pctOfGoal: goal && goal.amount > 0 ? roundMoney((closedAmount / goal.amount) * 100) : null,
            commitAmount,
            commitCount: commit.length,
            bestCaseAmount,
            bestCaseCount: bestCase.length,
            upsideAmount,
            upsideCount: upside.length,
            forecastAmount,
            gapForecast: goal ? roundMoney(goal.amount - forecastAmount) : null,
            gapCommit: goal ? roundMoney(goal.amount - (closedAmount + commitAmount)) : null,
            pipelineTotal,
            pipelineTotalCount: open.length,
            pipelineEligible,
            pipelineEligibleCount: eligible.length,
            coverageMonth,
            coverage30,
            coverage60,
            coverage90,
            coverageProtection,
            previousPeriod,
            forecastConfidence,
            isEmpty: scored.length === 0,
            dataAsOf: now.toISOString(),
        };
    }

    /**
     * Forecast Confidence (seção 22) — combina completude dos campos que o `forecastEngine` usa
     * como sinal (peso 70%) com cobertura de histórico de etapa (peso 30%), e aplica um redutor
     * proporcional quando a amostra de negócios abertos é pequena (< 5) — forecast sobre poucos
     * negócios é estruturalmente menos confiável, independente da completude dos campos. `null`
     * sem nenhum negócio aberto para avaliar.
     */
    private computeForecastConfidence(open: ScoredDeal[], historyLeadIds: Set<string>): ForecastConfidence {
        const sampleSize = open.length;
        if (sampleSize === 0) {
            return { score: null, classification: null, sampleSize: 0, fieldCompletenessScore: null, stageHistoryCoverage: null, sampleSizePenaltyApplied: false };
        }

        const fieldInputs = [...FORECAST_CONFIDENCE_FIELDS].map((field) => {
            const test = DEAL_FIELD_TESTS[field];
            const filled = open.filter((s) => test(s.deal)).length;
            return { weight: 1, completeness: roundMoney((filled / sampleSize) * 100) };
        });
        const fieldCompletenessScore = weightedCompletenessScore(fieldInputs);
        const withHistory = open.filter((s) => historyLeadIds.has(s.deal.id)).length;
        const stageHistoryCoverage = roundMoney((withHistory / sampleSize) * 100);

        const SAMPLE_SIZE_FLOOR = 5;
        const sampleSizePenaltyApplied = sampleSize < SAMPLE_SIZE_FLOOR;
        const combined = fieldCompletenessScore != null ? roundMoney(fieldCompletenessScore * 0.7 + stageHistoryCoverage * 0.3) : null;
        const score = combined != null ? roundMoney(sampleSizePenaltyApplied ? combined * (sampleSize / SAMPLE_SIZE_FLOOR) : combined) : null;

        return {
            score,
            classification: classifyCompleteness(score),
            sampleSize,
            fieldCompletenessScore,
            stageHistoryCoverage,
            sampleSizePenaltyApplied,
        };
    }

    // ─── Fase 3 — Pipeline criado ────────────────────────────────────────────

    async pipelineCreation(organizationId: string, filter: CommercialIntelligenceFilter, now = new Date()): Promise<PipelineCreation> {
        const { start, end, daysInMonth } = monthRange(filter.month);
        const { scored } = await this.loadScoredDeals(organizationId, now);
        const inScope = this.applyScope(scored, filter);
        const created = inScope.filter((s) => s.deal.createdAt >= start && s.deal.createdAt < end).map((s) => s.deal);

        const amount = roundMoney(created.reduce((sum, d) => sum + d.amount, 0));

        const groupBy = (key: (d: DealRow) => string | null) => {
            const map = new Map<string, { count: number; amount: number }>();
            for (const deal of created) {
                const label = key(deal) || 'Não informado';
                const entry = map.get(label) ?? { count: 0, amount: 0 };
                entry.count += 1;
                entry.amount += deal.amount;
                map.set(label, entry);
            }
            return [...map.entries()]
                .map(([label, v]) => ({ label, count: v.count, amount: roundMoney(v.amount) }))
                .sort((a, b) => b.amount - a.amount);
        };

        const goal = await this.repository.getGoal(organizationId, filter.month, 'NEW_MRR');
        const closed = inScope.filter((s) => (s.deal.stageIsWon || s.deal.stageIsLost) && s.deal.closedAt && s.deal.closedAt >= start && s.deal.closedAt < end).map((s) => s.deal);
        const won = closed.filter((d) => d.stageIsWon).length;
        const lost = closed.filter((d) => d.stageIsLost).length;
        const winRate = won + lost > 0 ? won / (won + lost) : null;

        // Pipeline necessário (seção 15): meta futura / win rate esperado. Sem win rate histórico
        // real ainda, não há como calcular — "Não disponível" em vez de assumir uma taxa fabricada.
        const pipelineNeeded = goal && winRate && winRate > 0 ? roundMoney(goal.amount / winRate) : null;
        const creationCoverage = pipelineNeeded && pipelineNeeded > 0 ? roundMoney(amount / pipelineNeeded) : null;

        // ─── Pipeline Creation Pace (seção 21): "criado até hoje" vs "deveria ter criado até hoje",
        // proporcional a dias úteis decorridos no mês em vez de dias corridos. ─────────────────────
        const totalBusinessDays = countBusinessDays(start, end);
        const elapsedEnd = now < start ? start : now > end ? end : now;
        const elapsedBusinessDays = now < start ? 0 : countBusinessDays(start, elapsedEnd);
        const paceExpectedAmount = pipelineNeeded != null && totalBusinessDays > 0
            ? roundMoney(pipelineNeeded * (elapsedBusinessDays / totalBusinessDays))
            : null;
        const pacePercent = paceExpectedAmount != null && paceExpectedAmount > 0 ? roundMoney((amount / paceExpectedAmount) * 100) : null;
        const paceGapAmount = paceExpectedAmount != null ? roundMoney(paceExpectedAmount - amount) : null;

        void daysInMonth;
        return {
            period: filter.month,
            count: created.length,
            amount,
            averageTicket: created.length > 0 ? roundMoney(amount / created.length) : null,
            bySource: groupBy((d) => d.source),
            byOwner: groupBy((d) => d.owner),
            pipelineNeeded,
            creationCoverage,
            elapsedBusinessDays,
            totalBusinessDays,
            paceExpectedAmount,
            pacePercent,
            paceGapAmount,
        };
    }

    // ─── Fase 4 — Eficiência ─────────────────────────────────────────────────

    async performance(organizationId: string, filter: CommercialIntelligenceFilter, now = new Date()): Promise<PerformanceMetrics> {
        const { start, end } = monthRange(filter.month);
        const { scored, stages, history } = await this.loadScoredDeals(organizationId, now);
        const inScope = this.applyScope(scored, filter);

        const createdInPeriod = inScope.filter((s) => s.deal.createdAt >= start && s.deal.createdAt < end);
        const closedInPeriod = inScope.filter((s) => (s.deal.stageIsWon || s.deal.stageIsLost) && s.deal.closedAt && s.deal.closedAt >= start && s.deal.closedAt < end);
        const won = closedInPeriod.filter((s) => s.deal.stageIsWon);
        const lost = closedInPeriod.filter((s) => s.deal.stageIsLost);
        const open = inScope.filter((s) => isDealOpen(s.deal));
        const eligible = open.filter((s) => checkEligibility(s.deal, now, s.daysInCurrentStage).eligible);
        const stalled = open.filter((s) => s.agingDays > STAGE_AGING_CRITICAL_DAYS);
        const atRisk = open.filter((s) => s.forecast.tier === 'Upside' || s.forecast.negativeFactors.length >= 2);

        const advanced = this.countAdvancedTransitions(history, start, end);

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

        const historicalReach = this.computeHistoricalStageReach(inScope, history, openStages);

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

    /**
     * Quantos negócios (abertos, ganhos OU perdidos, no escopo do filtro) REALMENTE chegaram a
     * cada etapa ABERTA em algum momento — seção 12: não inferir conversão só pelo snapshot atual
     * quando há histórico disponível.
     *
     * Só recebe as etapas ABERTAS (`openStages`, sem Ganho/Perdido) de propósito: a etapa terminal
     * NUNCA entra no cálculo de "alcançou", nem via histórico nem via etapa atual — se entrasse,
     * um negócio perdido logo na 1ª etapa pareceria ter "alcançado" todas as etapas intermediárias
     * só porque a etapa "Perdido" tem `sortOrder` mais alto que elas (bug real testado em
     * `__tests__/CommercialIntelligenceUseCases.unit.test.ts`). Um negócio GANHO só conta como
     * tendo alcançado uma etapa aberta se o histórico tiver uma linha própria para aquela etapa
     * aberta (o que acontece naturalmente se ele passou por ali antes de fechar). Para negócios
     * ABERTOS, a etapa atual sempre conta como alcançada, mesmo sem linha de histórico (registro
     * legado). Sem nenhuma linha de histórico para um negócio fechado, ele não é contado em
     * nenhuma etapa — nunca um progresso fabricado a partir do status final.
     */
    private computeHistoricalStageReach(
        inScope: ScoredDeal[],
        history: StageHistoryRow[],
        openStages: Array<{ id: string; sortOrder: number }>
    ): Map<string, { count: number; amount: number }> {
        const sortOrderByOpenStageId = new Map(openStages.map((s) => [s.id, s.sortOrder]));
        const historyByLead = new Map<string, StageHistoryRow[]>();
        for (const row of history) {
            if (!historyByLead.has(row.leadId)) historyByLead.set(row.leadId, []);
            historyByLead.get(row.leadId)!.push(row);
        }

        const reachedByDeal = inScope.map((s) => {
            const reached = new Set<number>();
            for (const row of historyByLead.get(s.deal.id) ?? []) {
                const so = row.stageId ? sortOrderByOpenStageId.get(row.stageId) : undefined;
                if (so != null) reached.add(so);
            }
            if (isDealOpen(s.deal) && s.deal.stageSortOrder != null) reached.add(s.deal.stageSortOrder);
            return { deal: s.deal, reached };
        });

        const result = new Map<string, { count: number; amount: number }>();
        for (const stage of openStages) {
            const dealsThatReached = reachedByDeal.filter(({ reached }) => [...reached].some((so) => so >= stage.sortOrder));
            result.set(stage.id, {
                count: dealsThatReached.length,
                amount: roundMoney(dealsThatReached.reduce((sum, r) => sum + r.deal.amount, 0)),
            });
        }
        return result;
    }

    private countAdvancedTransitions(history: StageHistoryRow[], start: Date, end: Date): number {
        const byLead = new Map<string, StageHistoryRow[]>();
        for (const row of history) {
            if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
            byLead.get(row.leadId)!.push(row);
        }
        let advanced = 0;
        for (const rows of byLead.values()) {
            const sorted = [...rows].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].enteredAt >= start && sorted[i].enteredAt < end) advanced++;
            }
        }
        return advanced;
    }

    // ─── Fase 5 — Aging ──────────────────────────────────────────────────────

    async aging(organizationId: string, filter: CommercialIntelligenceFilter, now = new Date()): Promise<AgingReport> {
        const { scored, history } = await this.loadScoredDeals(organizationId, now);
        const inScope = this.applyScope(scored, filter);
        const open = inScope.filter((s) => isDealOpen(s.deal));

        const bucketDefs: Array<{ label: string; min: number; max: number | null }> = [
            { label: '0–15 dias', min: 0, max: 15 },
            { label: '16–30 dias', min: 16, max: 30 },
            { label: '31–45 dias', min: 31, max: 45 },
            { label: '46–60 dias', min: 46, max: 60 },
            { label: '61–90 dias', min: 61, max: 90 },
            { label: '90+ dias', min: 91, max: null },
        ];

        const buckets: AgingBucket[] = bucketDefs.map((b) => {
            const rows = open.filter((s) => {
                const age = daysBetween(s.deal.createdAt, now);
                return age >= b.min && (b.max == null || age <= b.max);
            });
            return {
                label: b.label,
                minDays: b.min,
                maxDays: b.max,
                count: rows.length,
                amount: roundMoney(rows.reduce((sum, s) => sum + s.deal.amount, 0)),
            };
        });

        const byStageMap = new Map<string, { stageName: string; rows: ScoredDeal[] }>();
        for (const s of open) {
            if (!s.deal.pipelineStageId || !s.deal.stageName) continue;
            const entry = byStageMap.get(s.deal.pipelineStageId) ?? { stageName: s.deal.stageName, rows: [] };
            entry.rows.push(s);
            byStageMap.set(s.deal.pipelineStageId, entry);
        }

        const byStage: StageAging[] = [...byStageMap.entries()].map(([stageId, entry]) => {
            const overThreshold = entry.rows.filter((s) => s.agingDays > STAGE_AGING_CRITICAL_DAYS);
            const measured = entry.rows.filter((s) => s.daysInCurrentStage != null).map((s) => s.daysInCurrentStage as number);
            const hasHistory = history.some((h) => h.stageId === stageId);
            return {
                stageId,
                stageName: entry.stageName,
                count: entry.rows.length,
                amountOverThreshold: roundMoney(overThreshold.reduce((sum, s) => sum + s.deal.amount, 0)),
                averageDaysInStage: mean(entry.rows.map((s) => s.agingDays)),
                dataQuality: measured.length === entry.rows.length ? 'measured' : hasHistory ? 'estimated' : entry.rows.length > 0 ? 'estimated' : 'unknown',
            };
        });

        const trackingSince = history.length > 0 ? history.reduce((min, h) => (h.enteredAt < min ? h.enteredAt : min), history[0].enteredAt).toISOString() : null;

        return { buckets, byStage, criticalThresholdDays: STAGE_AGING_CRITICAL_DAYS, trackingSince };
    }

    // ─── Fase 7 — Motivos de perda ───────────────────────────────────────────

    async losses(organizationId: string, filter: CommercialIntelligenceFilter, now = new Date()): Promise<LossAnalysis> {
        const { start, end } = monthRange(filter.month);
        const { scored } = await this.loadScoredDeals(organizationId, now);
        const inScope = this.applyScope(scored, filter);
        const lost = inScope.filter((s) => s.deal.stageIsLost && s.deal.closedAt && s.deal.closedAt >= start && s.deal.closedAt < end).map((s) => s.deal);

        const byReasonMap = new Map<string, { count: number; amount: number }>();
        for (const deal of lost) {
            const bucket = classifyLossReason(deal.lossReason);
            const entry = byReasonMap.get(bucket) ?? { count: 0, amount: 0 };
            entry.count += 1;
            entry.amount += deal.amount;
            byReasonMap.set(bucket, entry);
        }

        return {
            period: filter.month,
            totalCount: lost.length,
            totalAmount: roundMoney(lost.reduce((sum, d) => sum + d.amount, 0)),
            byReason: [...byReasonMap.entries()]
                .map(([reason, v]) => ({ reason, count: v.count, amount: roundMoney(v.amount) }))
                .sort((a, b) => b.amount - a.amount),
            sampleObservations: lost.slice(0, 20).map((d) => ({
                leadId: d.id,
                title: d.title,
                reason: classifyLossReason(d.lossReason),
                observation: d.lossObservation ?? d.lossReason,
            })),
        };
    }

    // ─── Fase 5/6 — Leading Indicators ───────────────────────────────────────

    async leadingIndicators(organizationId: string, now = new Date()): Promise<LeadingIndicatorsReport> {
        const weekMs = 7 * DAY_MS;
        const weekEnd = now;
        const weekStart = new Date(now.getTime() - weekMs);
        const prevWeekStart = new Date(now.getTime() - 2 * weekMs);
        const window4wStart = new Date(now.getTime() - 4 * weekMs);

        const deals = await this.repository.findDeals(organizationId);
        const history = await this.repository.findStageHistory(organizationId);

        const countMeetings = (from: Date, to: Date) => this.repository.countCompletedMeetings(organizationId, from, to);
        const countQualified = (from: Date, to: Date) => this.repository.countTimelineEventsByType(organizationId, 'conversion', from, to);

        const countCreated = (from: Date, to: Date) => deals.filter((d) => d.createdAt >= from && d.createdAt < to).length;
        const countAdvanced = (from: Date, to: Date) => this.countAdvancedTransitions(history, from, to);
        const countProposals = (from: Date, to: Date) => history.filter((h) => h.stageName === 'Proposta Enviada' && h.enteredAt >= from && h.enteredAt < to).length;
        const countWon = (from: Date, to: Date) => deals.filter((d) => d.stageIsWon && d.closedAt && d.closedAt >= from && d.closedAt < to).length;

        const buildPoint = async (label: string, fn: (from: Date, to: Date) => number | Promise<number>): Promise<LeadingIndicatorPoint> => {
            const current = await fn(weekStart, weekEnd);
            const previousWeek = await fn(prevWeekStart, weekStart);
            const weeklyValues = await Promise.all(
                [0, 1, 2, 3].map((i) => {
                    const from = new Date(window4wStart.getTime() + i * weekMs);
                    const to = new Date(from.getTime() + weekMs);
                    return fn(from, to);
                })
            );
            const movingAverage4w = roundMoney(weeklyValues.reduce((s, v) => s + v, 0) / weeklyValues.length);
            const delta = previousWeek === 0 ? (current === 0 ? 0 : 1) : (current - previousWeek) / previousWeek;
            const trend: LeadingIndicatorPoint['trend'] = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
            return { label, current, previousWeek, movingAverage4w, trend, weeklySeries: weeklyValues };
        };

        const indicators = await Promise.all([
            buildPoint('Reuniões realizadas', countMeetings),
            buildPoint('Oportunidades qualificadas', countQualified),
            buildPoint('Pipeline criado', countCreated),
            buildPoint('Oportunidades que avançaram', countAdvanced),
            buildPoint('Propostas enviadas', countProposals),
            buildPoint('Ganhos', countWon),
        ]);

        const trackingSince = history.length > 0 ? history.reduce((min, h) => (h.enteredAt < min ? h.enteredAt : min), history[0].enteredAt).toISOString() : null;

        return {
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            indicators,
            trackingSince,
        };
    }

    // ─── Fase 6 — Alertas executivos ─────────────────────────────────────────

    async alerts(organizationId: string, filter: CommercialIntelligenceFilter, now = new Date()): Promise<ExecutiveAlert[]> {
        const [overview, creation, aging] = await Promise.all([
            this.executiveOverview(organizationId, filter, now),
            this.pipelineCreation(organizationId, filter, now),
            this.aging(organizationId, filter, now),
        ]);

        const alerts: ExecutiveAlert[] = [];

        if (overview.goal && overview.forecastAmount < overview.goal.amount) {
            const pct = overview.goal.amount > 0 ? Math.round((overview.forecastAmount / overview.goal.amount) * 100) : 0;
            alerts.push({
                id: 'forecast-abaixo-meta',
                severity: 'critical',
                title: 'Forecast abaixo da meta',
                description: `Forecast atual cobre apenas ${pct}% da meta. Gap estimado: ${(overview.gapForecast ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: overview.goal.currency })}.`,
                metricValue: overview.gapForecast,
            });
        }

        if (overview.coverage90.coverage != null && overview.coverage90.coverageRecommended != null && overview.coverage90.coverage < overview.coverage90.coverageRecommended) {
            alerts.push({
                id: 'coverage-insuficiente-90d',
                severity: 'warning',
                title: 'Coverage insuficiente nos próximos 90 dias',
                description: `Coverage atual de ${overview.coverage90.coverage.toFixed(1)}x está abaixo do recomendado (${overview.coverage90.coverageRecommended.toFixed(1)}x, derivado do Win Rate histórico).`,
                metricValue: overview.coverage90.coverage,
            });
        }

        if (creation.creationCoverage != null && creation.creationCoverage < 1) {
            const pctBelow = Math.round((1 - creation.creationCoverage) * 100);
            alerts.push({
                id: 'baixa-criacao-pipeline',
                severity: 'warning',
                title: 'Baixa criação de pipeline',
                description: `Pipeline criado no mês está ${pctBelow}% abaixo do ritmo necessário para sustentar a meta futura.`,
                metricValue: creation.creationCoverage,
            });
        }

        const stagnantAmount = roundMoney(aging.byStage.reduce((sum, s) => sum + s.amountOverThreshold, 0));
        if (stagnantAmount > 0) {
            alerts.push({
                id: 'oportunidades-estagnadas',
                severity: 'critical',
                title: 'Oportunidades estagnadas',
                description: `${stagnantAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em oportunidades estão acima do aging esperado (${aging.criticalThresholdDays} dias na etapa).`,
                metricValue: stagnantAmount,
            });
        }

        const { scored } = await this.loadScoredDeals(organizationId, now);
        const openScope = filter.owner ? scored.filter((s) => s.deal.owner === filter.owner) : scored;
        const noNextAction = openScope.filter((s) => isDealOpen(s.deal) && s.deal.amount > 0 && !s.deal.nextAction);
        if (noNextAction.length > 0) {
            alerts.push({
                id: 'sem-proxima-acao',
                severity: 'warning',
                title: 'Sem próxima ação',
                description: `${noNextAction.length} oportunidade(s) relevante(s) estão sem próxima atividade registrada.`,
                metricValue: noNextAction.length,
            });
        }

        // ─── Propostas sem interação (seção 19, atenção) ─────────────────────────────
        // Não usa o nome literal de uma etapa (ex.: "Proposta Enviada") porque pipelines
        // customizados não padronizam nomes — usa o tier do Forecast Ponderado Explicável (Commit/
        // BestCase = oportunidade já avançada, com proposta em curso) combinado com o próprio sinal
        // de "sem interação"/"interação vencida" que o forecastEngine já calcula por negócio.
        const proposalsWithoutInteraction = openScope.filter(
            (s) =>
                isDealOpen(s.deal) &&
                (s.forecast.tier === 'Commit' || s.forecast.tier === 'BestCase') &&
                s.forecast.negativeFactors.some((f) => f.toLowerCase().includes('interação'))
        );
        if (proposalsWithoutInteraction.length > 0) {
            alerts.push({
                id: 'propostas-sem-interacao',
                severity: 'warning',
                title: 'Propostas sem interação recente',
                description: `${proposalsWithoutInteraction.length} negócio(s) já avançado(s) (Commit/Best Case) estão sem interação recente registrada — risco de esfriar antes do fechamento.`,
                metricValue: proposalsWithoutInteraction.length,
            });
        }

        // ─── Confiabilidade do forecast (seção 19, crítico) ──────────────────────────
        if (overview.forecastConfidence.classification === 'critico') {
            alerts.push({
                id: 'forecast-confidence-critica',
                severity: 'critical',
                title: 'Dados essenciais do forecast com baixa completude',
                description: `Confiabilidade do forecast em ${overview.forecastConfidence.score ?? 0}% — campos-chave (valor, responsável, data prevista, próxima ação, interação) ou histórico de etapa estão incompletos na maior parte do pipeline aberto.`,
                metricValue: overview.forecastConfidence.score,
            });
        }

        // ─── Proteção 90 dias: M+1/M+2 abaixo do mínimo (seção 19, atenção) ──────────
        const [, m1, m2] = overview.coverageProtection;
        const criticalFutureMonths = [m1, m2].filter((m) => m.status === 'critico');
        if (criticalFutureMonths.length > 0) {
            alerts.push({
                id: 'coverage-futuro-critico',
                severity: 'warning',
                title: 'Cobertura futura abaixo do mínimo',
                description: `${criticalFutureMonths.map((m) => m.label).join(' e ')} está(ão) com Coverage crítico frente à meta cadastrada. Reforce a geração de pipeline elegível para esses meses antes que a janela feche.`,
                metricValue: criticalFutureMonths[0].coverage,
            });
        }

        // ─── Comparação com o mês anterior: Win Rate e Sales Cycle (seção 19) ────────
        const currentPerformance = await this.performance(organizationId, filter, now);
        const previousPerformance = overview.previousPeriod
            ? await this.performance(organizationId, { ...filter, month: overview.previousPeriod.period }, now)
            : null;

        if (currentPerformance.winRate != null && previousPerformance?.winRate != null) {
            const delta = roundMoney(currentPerformance.winRate - previousPerformance.winRate);
            if (delta <= -5) {
                alerts.push({
                    id: 'queda-win-rate',
                    severity: 'warning',
                    title: 'Queda significativa de Win Rate',
                    description: `Win Rate caiu de ${previousPerformance.winRate.toFixed(1)}% (${overview.previousPeriod?.period}) para ${currentPerformance.winRate.toFixed(1)}% neste mês.`,
                    metricValue: delta,
                });
            } else if (delta >= 5) {
                alerts.push({
                    id: 'win-rate-em-alta',
                    severity: 'positive',
                    title: 'Win Rate acima do mês anterior',
                    description: `Win Rate subiu de ${previousPerformance.winRate.toFixed(1)}% para ${currentPerformance.winRate.toFixed(1)}% em relação a ${overview.previousPeriod?.period}.`,
                    metricValue: delta,
                });
            }
        }

        if (
            currentPerformance.salesCycle.meanDays != null &&
            previousPerformance?.salesCycle.meanDays != null &&
            previousPerformance.salesCycle.sampleSize > 0 &&
            currentPerformance.salesCycle.meanDays > previousPerformance.salesCycle.meanDays * 1.2
        ) {
            alerts.push({
                id: 'sales-cycle-aumentando',
                severity: 'warning',
                title: 'Sales Cycle aumentando',
                description: `Ciclo médio de venda subiu de ${Math.round(previousPerformance.salesCycle.meanDays)} para ${Math.round(currentPerformance.salesCycle.meanDays)} dias em relação ao mês anterior.`,
                metricValue: currentPerformance.salesCycle.meanDays,
            });
        }

        // ─── Alertas positivos (seção 19) ─────────────────────────────────────────────
        if (overview.goal && overview.forecastAmount >= overview.goal.amount) {
            alerts.push({
                id: 'forecast-acima-meta',
                severity: 'positive',
                title: 'Forecast acima da meta',
                description: `Forecast atual (${overview.forecastAmount.toLocaleString('pt-BR', { style: 'currency', currency: overview.goal.currency })}) já cobre a meta do mês.`,
                metricValue: overview.forecastAmount,
            });
        }

        const futureMonths = overview.coverageProtection.slice(1);
        if (futureMonths.length > 0 && futureMonths.every((m) => m.status === 'saudavel')) {
            alerts.push({
                id: 'coverage-futuro-saudavel',
                severity: 'positive',
                title: 'Cobertura futura saudável',
                description: 'M+1, M+2 e M+3 estão com Coverage saudável frente à meta cadastrada — pipeline elegível suficiente para sustentar os próximos 90 dias.',
                metricValue: null,
            });
        }

        if (creation.pacePercent != null && creation.pacePercent >= 100) {
            alerts.push({
                id: 'ritmo-criacao-acima',
                severity: 'positive',
                title: 'Pipeline Creation acima do ritmo necessário',
                description: `Pipeline criado até agora está em ${creation.pacePercent.toFixed(0)}% do ritmo necessário para sustentar as metas futuras.`,
                metricValue: creation.pacePercent,
            });
        }

        return alerts;
    }

    // ─── Fase 7 — Qualidade do CRM ───────────────────────────────────────────

    async crmQuality(organizationId: string, filter: CommercialIntelligenceFilter, now = new Date()): Promise<CrmQualityIndex> {
        // Aging/crmQuality ignoravam o filtro de owner (liam deals/history direto do repositório em
        // vez de passar por applyScope) — corrigido usando o mesmo padrão de loadScoredDeals +
        // applyScope já usado pelo restante da classe (ver executiveOverview etc.).
        const { scored, history } = await this.loadScoredDeals(organizationId, now);
        const inScope = this.applyScope(scored, filter);
        const open = inScope.filter((s) => isDealOpen(s.deal)).map((s) => s.deal);
        const lost = inScope.filter((s) => s.deal.stageIsLost).map((s) => s.deal);
        const historyLeadIds = new Set(history.map((h) => h.leadId));

        const fieldChecks: Array<{ field: string; label: string; test: (d: DealRow) => boolean }> = [
            { field: 'owner', label: 'Responsável', test: (d) => !!d.owner },
            { field: 'amount', label: 'Valor', test: (d) => d.amount > 0 },
            { field: 'companyId', label: 'Empresa', test: (d) => !!d.companyId },
            { field: 'contactId', label: 'Contato', test: (d) => !!d.contactId },
            { field: 'companyCnpj', label: 'CNPJ', test: (d) => !!d.companyCnpj },
            { field: 'pipelineStageId', label: 'Etapa', test: (d) => !!d.pipelineStageId },
            { field: 'expectedCloseAt', label: 'Data prevista', test: (d) => !!d.expectedCloseAt },
            { field: 'nextAction', label: 'Próxima ação', test: (d) => !!d.nextAction },
            { field: 'lastInteraction', label: 'Última atividade', test: (d) => !!d.lastInteraction },
            { field: 'source', label: 'Origem', test: (d) => !!d.source },
        ];

        const fields = fieldChecks.map(({ field, label, test }) => {
            const filled = open.filter(test).length;
            return {
                field,
                label,
                filled,
                total: open.length,
                completeness: open.length > 0 ? roundMoney((filled / open.length) * 100) : null,
            };
        });

        const withCompleteness = fields.filter((f) => f.completeness != null);
        const overallScore = withCompleteness.length > 0 ? roundMoney(withCompleteness.reduce((sum, f) => sum + (f.completeness as number), 0) / withCompleteness.length) : null;

        const suspectedDuplicateGroups = await this.repository.countDuplicateCompanyGroupsAmongOpenDeals(organizationId);
        const bitrixSync = await this.bitrixSyncHealth(organizationId, open, now);
        const dataReadiness = this.computeDataReadiness(open, lost, historyLeadIds);

        return {
            period: filter.month,
            overallScore,
            fields,
            dataReadiness,
            suspectedDuplicateGroups,
            evaluatedCount: open.length,
            bitrixSync,
        };
    }

    /**
     * "Confiabilidade dos Dados" (seção 5) — completude PONDERADA por impacto no forecast, com
     * classificação saudável/atenção/crítico por campo (mesmos limiares 80/50 já usados na UI de
     * Qualidade do CRM). "Motivo da perda" é avaliado sobre negócios perdidos (todo o histórico,
     * não só o período do filtro — mesma natureza "instantânea" do restante desta função), os
     * demais campos sobre negócios abertos. Pesos e fórmula documentados em
     * `application/dataReadiness.ts`.
     */
    private computeDataReadiness(open: DealRow[], lost: DealRow[], historyLeadIds: Set<string>): DataReadinessScore {
        const openFields: DataReadinessField[] = DATA_READINESS_OPEN_FIELD_WEIGHTS.map((w) => {
            const test = w.field === 'stageHistory' ? (d: DealRow) => historyLeadIds.has(d.id) : DEAL_FIELD_TESTS[w.field];
            const filled = open.filter(test).length;
            const completeness = open.length > 0 ? roundMoney((filled / open.length) * 100) : null;
            return { field: w.field, label: w.label, filled, total: open.length, completeness, weight: w.weight, forecastImpact: w.forecastImpact, classification: classifyCompleteness(completeness) };
        });

        const lossFilled = lost.filter(DEAL_FIELD_TESTS.lossReason).length;
        const lossCompleteness = lost.length > 0 ? roundMoney((lossFilled / lost.length) * 100) : null;
        const lossField: DataReadinessField = {
            field: DATA_READINESS_LOSS_FIELD_WEIGHT.field,
            label: DATA_READINESS_LOSS_FIELD_WEIGHT.label,
            filled: lossFilled,
            total: lost.length,
            completeness: lossCompleteness,
            weight: DATA_READINESS_LOSS_FIELD_WEIGHT.weight,
            forecastImpact: DATA_READINESS_LOSS_FIELD_WEIGHT.forecastImpact,
            classification: classifyCompleteness(lossCompleteness),
        };

        const allFields = [...openFields, lossField];
        const overallScore = weightedCompletenessScore(allFields.map((f) => ({ weight: f.weight, completeness: f.completeness })));
        return { overallScore, classification: classifyCompleteness(overallScore), fields: allFields };
    }

    /**
     * Saúde da integração Bitrix24 sobre os negócios abertos do funil "Negócio" — quantos têm
     * `bitrixLeadId`/`bitrixDealId` (vínculo real) e quantos tiveram a última sincronização
     * marcada como `failed` em `Lead.bitrixSyncStatus`. Não faz nenhuma chamada de rede ao Bitrix
     * — lê só o que já foi gravado localmente pelo `outboundSync`/webhook de entrada.
     */
    private async bitrixSyncHealth(organizationId: string, open: DealRow[], now: Date): Promise<BitrixSyncHealth> {
        const connected = await this.repository.hasBitrixConnection(organizationId);
        const linkedDeals = open.filter((d) => d.bitrixLeadId || d.bitrixDealId);
        const failedDeals = open.filter((d) => d.bitrixSyncStatus === 'failed');
        // Janela fixa de 30 dias (seção 28) — atividade de sincronização é operacional, não segue
        // o período do filtro comercial escolhido na tela.
        const since = new Date(now.getTime() - 30 * DAY_MS);
        const activity = connected
            ? await this.repository.getBitrixSyncActivity(organizationId, since)
            : { lastSyncAt: null, syncedCount: 0, failedCount: 0 };

        return {
            connected,
            totalOpen: open.length,
            linked: linkedDeals.length,
            notLinked: open.length - linkedDeals.length,
            failed: failedDeals.length,
            linkedRate: open.length > 0 ? roundMoney((linkedDeals.length / open.length) * 100) : null,
            failures: failedDeals.slice(0, 10).map((d) => ({
                leadId: d.id,
                title: d.title,
                companyName: d.companyName,
                error: d.bitrixSyncError,
                lastAttemptAt: d.bitrixSyncedAt ? d.bitrixSyncedAt.toISOString() : null,
            })),
            lastSyncAt: activity.lastSyncAt ? activity.lastSyncAt.toISOString() : null,
            syncedCount30d: activity.syncedCount,
            failedCount30d: activity.failedCount,
        };
    }

    // ─── Drill-down (seção 29) ────────────────────────────────────────────────

    async dealsDrillDown(organizationId: string, query: DealDrillDownQuery, now = new Date()): Promise<DealDrillDownResult> {
        const { scored } = await this.loadScoredDeals(organizationId, now);
        let rows = this.applyScope(scored, { month: query.month, owner: query.owner, product: undefined, source: undefined, icp: undefined }).filter((s) => isDealOpen(s.deal));

        if (query.tier) rows = rows.filter((s) => s.forecast.tier === query.tier);
        if (query.stageId) rows = rows.filter((s) => s.deal.pipelineStageId === query.stageId);
        if (query.agingCritical) rows = rows.filter((s) => s.agingDays > STAGE_AGING_CRITICAL_DAYS);
        if (query.missingNextAction) rows = rows.filter((s) => !s.deal.nextAction);

        const total = rows.length;
        const offset = query.offset ?? 0;
        const limit = Math.min(query.limit ?? 50, 200);
        const page = rows.slice(offset, offset + limit);

        const toRow = (s: ScoredDeal): DealDrillDownRow => ({
            id: s.deal.id,
            title: s.deal.title,
            companyName: s.deal.companyName,
            amount: s.deal.amount,
            owner: s.deal.owner,
            stageName: s.deal.stageName,
            probability: s.deal.stageProbability,
            weightedProbability: s.forecast.probability,
            tier: s.forecast.tier,
            agingDays: s.agingDays,
            lastInteraction: s.deal.lastInteraction ? s.deal.lastInteraction.toISOString() : null,
            nextAction: s.deal.nextAction ? s.deal.nextAction.toISOString() : null,
            riskFactors: s.forecast.negativeFactors,
            expectedCloseAt: s.deal.expectedCloseAt ? s.deal.expectedCloseAt.toISOString() : null,
            source: s.deal.source,
            bitrixLinked: !!(s.deal.bitrixLeadId || s.deal.bitrixDealId),
        });

        return { total, rows: page.map(toRow) };
    }

    async forecastExplain(organizationId: string, leadId: string, now = new Date()) {
        const { scored } = await this.loadScoredDeals(organizationId, now);
        const found = scored.find((s) => s.deal.id === leadId);
        if (!found) return null;
        return {
            leadId: found.deal.id,
            title: found.deal.title,
            companyName: found.deal.companyName,
            owner: found.deal.owner,
            amount: found.deal.amount,
            stageProbability: found.deal.stageProbability ?? 0,
            weightedProbability: found.forecast.probability,
            weightedValue: found.forecast.weightedValue,
            tier: found.forecast.tier as ForecastTier,
            positiveFactors: found.forecast.positiveFactors,
            negativeFactors: found.forecast.negativeFactors,
            lastUpdatedAt: found.deal.updatedAt.toISOString(),
        };
    }

    // ─── Opções de filtro reais (seção 18) ───────────────────────────────────

    async filterOptions(organizationId: string): Promise<FilterOptions> {
        return this.repository.getFilterOptions(organizationId);
    }

    // ─── Tendências históricas — 6 meses (seção 23) ───────────────────────────

    /**
     * Mês do filtro + 5 meses anteriores, mais antigo → mais recente. Reaproveita `performance`/
     * `pipelineCreation` (já testados) em vez de recalcular — o custo extra de repetir
     * `loadScoredDeals` por mês é aceitável para um relatório executivo de baixo tráfego. Cada
     * ponto retorna `null` nos campos sem amostra suficiente daquele mês (nunca interpolado).
     */
    async historicalTrends(organizationId: string, filter: CommercialIntelligenceFilter, now = new Date()): Promise<HistoricalTrendsReport> {
        const months = Array.from({ length: 6 }, (_, i) => shiftMonth(filter.month, i - 5));
        const points: HistoricalTrendPoint[] = await Promise.all(
            months.map(async (period) => {
                const monthFilter: CommercialIntelligenceFilter = { ...filter, month: period };
                const [perf, creation] = await Promise.all([
                    this.performance(organizationId, monthFilter, now),
                    this.pipelineCreation(organizationId, monthFilter, now),
                ]);
                return {
                    period,
                    label: monthLabelPt(period),
                    winRate: perf.winRate,
                    salesCycleMeanDays: perf.salesCycle.meanDays,
                    averageTicketWon: perf.averageTicket.won,
                    pipelineCreatedAmount: creation.amount,
                    closedSampleSize: perf.wonCount + perf.lostCount,
                };
            })
        );
        return { points };
    }
}
