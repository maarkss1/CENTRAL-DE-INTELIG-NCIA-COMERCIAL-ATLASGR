/**
 * Cockpit executivo (Fase 2 + 3) — Meta/Fechado/Forecast Ponderado, Coverage 30/60/90, Proteção 90
 * dias e comparação com o mês anterior. É o relatório mais lido do módulo (base do dashboard) e o
 * único que também expõe `computeForecastConfidence`, reaproveitado por `alertsReport.ts`.
 */

import type {
  CommercialIntelligenceFilter,
  CommercialIntelligenceRepository,
  CoverageProtectionEntry,
  CoverageSnapshot,
  ExecutiveOverview,
  ForecastConfidence,
  PreviousPeriodComparison,
} from '../../domain/CommercialIntelligence';
import { checkEligibility, isDealOpen } from '../pipelineEligibility';
import { shiftMonth, monthLabelPt } from '../executiveCalendar';
import { classifyCoverageProtection } from '../coverageProtection';
import {
  DEAL_FIELD_TESTS,
  FORECAST_CONFIDENCE_FIELDS,
  classifyCompleteness,
  weightedCompletenessScore,
} from '../dataReadiness';
import { DAY_MS, roundMoney } from '../shared/mathUtils';
import { monthRange } from '../shared/period';
import { loadScoredDeals, type ScoredDeal } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';

/**
 * Forecast Confidence (seção 22) — combina completude dos campos que o `forecastEngine` usa
 * como sinal (peso 70%) com cobertura de histórico de etapa (peso 30%), e aplica um redutor
 * proporcional quando a amostra de negócios abertos é pequena (< 5) — forecast sobre poucos
 * negócios é estruturalmente menos confiável, independente da completude dos campos. `null`
 * sem nenhum negócio aberto para avaliar.
 */
export function computeForecastConfidence(
  open: ScoredDeal[],
  historyLeadIds: Set<string>,
): ForecastConfidence {
  const sampleSize = open.length;
  if (sampleSize === 0) {
    return {
      score: null,
      classification: null,
      sampleSize: 0,
      fieldCompletenessScore: null,
      stageHistoryCoverage: null,
      sampleSizePenaltyApplied: false,
    };
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
  const combined =
    fieldCompletenessScore != null
      ? roundMoney(fieldCompletenessScore * 0.7 + stageHistoryCoverage * 0.3)
      : null;
  const score =
    combined != null
      ? roundMoney(
          sampleSizePenaltyApplied ? combined * (sampleSize / SAMPLE_SIZE_FLOOR) : combined,
        )
      : null;

  return {
    score,
    classification: classifyCompleteness(score),
    sampleSize,
    fieldCompletenessScore,
    stageHistoryCoverage,
    sampleSizePenaltyApplied,
  };
}

export async function buildExecutiveOverview(
  repository: CommercialIntelligenceRepository,
  organizationId: string,
  filter: CommercialIntelligenceFilter,
  now: Date,
): Promise<ExecutiveOverview> {
  const { start, end, daysInMonth } = monthRange(filter.month);
  const { scored, history } = await loadScoredDeals(repository, organizationId, now);
  const inScope = applyScope(scored, filter);
  const historyLeadIds = new Set(history.map((h) => h.leadId));

  // N+1 (onda 42): busca de uma vez a meta do mês do filtro + os 3 meses seguintes (Proteção 90
  // dias, seção 11 abaixo) — antes desta correção, o loop de Proteção 90 dias chamava
  // `getGoal` (findUnique) sequencialmente a cada iteração além da primeira (até 3 queries
  // evitáveis por chamada deste relatório, o mais lido do módulo).
  const protectionPeriods = [0, 1, 2, 3].map((i) => shiftMonth(filter.month, i));
  const goalsByPeriod = await repository.getGoals(organizationId, protectionPeriods, 'NEW_MRR');
  const goal = goalsByPeriod.get(filter.month) ?? null;

  const closed = inScope.filter(
    (s) =>
      (s.deal.stageIsWon || s.deal.stageIsLost) &&
      s.deal.closedAt &&
      s.deal.closedAt >= start &&
      s.deal.closedAt < end,
  );
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
  const pipelineWeighted = roundMoney(
    pipelineTier.reduce((sum, s) => sum + s.forecast.weightedValue, 0),
  );
  const upsideAmount = roundMoney(upside.reduce((sum, s) => sum + s.deal.amount, 0));

  const forecastAmount = roundMoney(
    closedAmount + commitAmount + bestCaseAmount + pipelineWeighted,
  );

  const winRate =
    won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : null;

  const eligible = open.filter((s) => checkEligibility(s.deal, now, s.daysInCurrentStage).eligible);
  const pipelineTotal = roundMoney(open.reduce((sum, s) => sum + s.deal.amount, 0));
  const pipelineEligible = roundMoney(eligible.reduce((sum, s) => sum + s.deal.amount, 0));

  const eligibleInRange = (from: Date, to: Date) =>
    roundMoney(
      eligible
        .filter(
          (s) =>
            s.deal.expectedCloseAt && s.deal.expectedCloseAt >= from && s.deal.expectedCloseAt < to,
        )
        .reduce((sum, s) => sum + s.deal.amount, 0),
    );

  const coverageFor = (
    windowDays: number,
    pipelineInWindow: number,
    closedInWindow: number,
  ): CoverageSnapshot => {
    if (!goal)
      return {
        coverage: null,
        coverageRecommended: null,
        pipelineEligible: pipelineInWindow,
        remainingGoal: 0,
      };
    const proportionalGoal =
      windowDays === daysInMonth ? goal.amount : (goal.amount / daysInMonth) * windowDays;
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
    const period = protectionPeriods[i];
    const range = monthRange(period);
    const periodGoal = goalsByPeriod.get(period) ?? null;
    const pipelineEligibleInPeriod = eligibleInRange(range.start, range.end);
    const closedInPeriod = i === 0 ? closedAmount : 0;
    const remainingGoal = periodGoal
      ? Math.max(0, roundMoney(periodGoal.amount - closedInPeriod))
      : null;
    const coverage =
      remainingGoal != null && remainingGoal > 0
        ? roundMoney(pipelineEligibleInPeriod / remainingGoal)
        : null;
    const coverageRecommended = winRate && winRate > 0 ? roundMoney(1 / (winRate / 100)) : null;
    // Meta já batida (remainingGoal === 0): melhor status possível, não "sem_dados" — a meta
    // do mês foi coberta, mesmo que `coverage` fique null (nada mais precisa ser dividido).
    const status =
      periodGoal && remainingGoal === 0
        ? ('saudavel' as const)
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
  const closedPrev = inScope.filter(
    (s) =>
      (s.deal.stageIsWon || s.deal.stageIsLost) &&
      s.deal.closedAt &&
      s.deal.closedAt >= previousRange.start &&
      s.deal.closedAt < previousRange.end,
  );
  const wonPrev = closedPrev.filter((s) => s.deal.stageIsWon);
  const lostPrev = closedPrev.filter((s) => s.deal.stageIsLost);
  const previousPeriod: PreviousPeriodComparison | null =
    closedPrev.length > 0
      ? {
          period: previousMonth,
          closedAmount: roundMoney(wonPrev.reduce((sum, s) => sum + s.deal.amount, 0)),
          closedCount: wonPrev.length,
          winRate:
            wonPrev.length + lostPrev.length > 0
              ? roundMoney((wonPrev.length / (wonPrev.length + lostPrev.length)) * 100)
              : null,
        }
      : null;

  const forecastConfidence = computeForecastConfidence(open, historyLeadIds);

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
