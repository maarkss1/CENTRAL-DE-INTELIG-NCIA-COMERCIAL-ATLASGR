/**
 * Jornada do cliente (dentro do funil Negócio) — quatro leituras sobre dados reais já existentes:
 *
 * - Handoffs: trocas de responsável (`LeadFieldChange.field = owner`);
 * - Reentradas: negócio que saiu de uma etapa TERMINAL (ganho/perdido/cancelado) e voltou a uma
 *   etapa aberta (`LeadStageHistory`) — "clientes recuperados" quando hoje estão ganhos,
 *   "reativados" enquanto seguem abertos;
 * - Sem interação: negócios abertos sem interação há mais que `FORECAST_RULES.STALE_INTERACTION_DAYS`
 *   ou sem nenhuma interação registrada ("clientes parados");
 * - Mapa de transições: pares etapa→etapa com contagem e mediana de dias na etapa de origem,
 *   marcando regressões (voltas para etapa anterior — retrabalho).
 *
 * Tudo depende de histórico real; sem histórico, `trackingSince` é `null` e as listas ficam
 * vazias — nunca uma jornada inferida a partir do estado atual.
 */

import type {
  CommercialIntelligenceFilter,
  CommercialIntelligenceRepository,
  HandoffPairBreakdown,
  HandoffRow,
  HandoffsSummary,
  JourneyReport,
  NoInteractionRow,
  NoInteractionSummary,
  ReentriesSummary,
  ReentryRow,
  StageTransitionEdge,
  StageTransitionsSummary,
} from '../../domain/CommercialIntelligence';
import { FORECAST_RULES } from '../forecastEngine';
import { isDealOpen } from '../pipelineEligibility';
import { daysBetween, median, roundMoney } from '../shared/mathUtils';
import { monthRange } from '../shared/period';
import { loadScoredDeals, type ScoredDeal, type StageHistoryRow } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';

const RECENT_LIMIT = 50;

function buildHandoffs(
  inScope: ScoredDeal[],
  fieldChanges: Awaited<ReturnType<CommercialIntelligenceRepository['findFieldChanges']>>,
  start: Date,
  end: Date,
): HandoffsSummary {
  const dealById = new Map(inScope.map((s) => [s.deal.id, s]));
  const ownerChanges = fieldChanges
    .filter((c) => c.field === 'owner' && dealById.has(c.leadId))
    .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  const allOwnerChanges = fieldChanges.filter((c) => c.field === 'owner');
  const trackingSince =
    allOwnerChanges.length > 0
      ? allOwnerChanges
          .reduce((min, c) => (c.changedAt < min ? c.changedAt : min), allOwnerChanges[0].changedAt)
          .toISOString()
      : null;

  const inPeriod = ownerChanges.filter((c) => c.changedAt >= start && c.changedAt < end);
  const countByLead = new Map<string, number>();
  for (const c of ownerChanges) countByLead.set(c.leadId, (countByLead.get(c.leadId) ?? 0) + 1);

  const pairMap = new Map<string, HandoffPairBreakdown>();
  for (const c of inPeriod) {
    const key = `${c.previousValue ?? ''}→${c.newValue ?? ''}`;
    const entry = pairMap.get(key) ?? { fromOwner: c.previousValue, toOwner: c.newValue, count: 0 };
    entry.count += 1;
    pairMap.set(key, entry);
  }

  const recent: HandoffRow[] = [...ownerChanges]
    .reverse()
    .slice(0, RECENT_LIMIT)
    .map((c) => {
      const s = dealById.get(c.leadId)!;
      return {
        leadId: c.leadId,
        title: s.deal.title,
        companyName: s.deal.companyName,
        amount: s.deal.amount,
        fromOwner: c.previousValue,
        toOwner: c.newValue,
        changedAt: c.changedAt.toISOString(),
        source: c.source,
        isOpen: isDealOpen(s.deal),
      };
    });

  return {
    trackingSince,
    countInPeriod: inPeriod.length,
    dealsWithHandoffInPeriod: new Set(inPeriod.map((c) => c.leadId)).size,
    openDealsWithMultipleHandoffs: inScope.filter(
      (s) => isDealOpen(s.deal) && (countByLead.get(s.deal.id) ?? 0) >= 2,
    ).length,
    byPair: [...pairMap.values()].sort((a, b) => b.count - a.count),
    recent,
  };
}

function isTerminalRow(row: StageHistoryRow, terminalStageIds: Set<string>): boolean {
  if (row.isWon != null || row.isLost != null) return !!row.isWon || !!row.isLost;
  return !!row.stageId && terminalStageIds.has(row.stageId);
}

function buildReentries(
  inScope: ScoredDeal[],
  history: StageHistoryRow[],
  terminalStageIds: Set<string>,
  start: Date,
  end: Date,
): ReentriesSummary {
  const dealById = new Map(inScope.map((s) => [s.deal.id, s]));
  const byLead = new Map<string, StageHistoryRow[]>();
  for (const row of history) {
    if (!dealById.has(row.leadId)) continue;
    if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
    byLead.get(row.leadId)!.push(row);
  }

  const rows: ReentryRow[] = [];
  for (const [leadId, rowsOfLead] of byLead) {
    const sorted = [...rowsOfLead].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    const s = dealById.get(leadId)!;
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (isTerminalRow(previous, terminalStageIds) && !isTerminalRow(current, terminalStageIds)) {
        rows.push({
          leadId,
          title: s.deal.title,
          companyName: s.deal.companyName,
          owner: s.deal.owner,
          amount: s.deal.amount,
          fromTerminalStage: previous.stageName,
          toStage: current.stageName,
          reenteredAt: current.enteredAt.toISOString(),
          currentStatus: s.deal.stageIsWon ? 'ganho' : s.deal.stageIsLost ? 'perdido' : 'aberto',
        });
      }
    }
  }
  rows.sort((a, b) => b.reenteredAt.localeCompare(a.reenteredAt));

  const trackingSince = history.length > 0 ? history[0].enteredAt.toISOString() : null;
  const inPeriod = rows.filter((r) => {
    const at = new Date(r.reenteredAt);
    return at >= start && at < end;
  });
  const recovered = rows.filter((r) => r.currentStatus === 'ganho');
  const reactivatedOpen = rows.filter((r) => r.currentStatus === 'aberto');
  const uniqueAmount = (list: ReentryRow[]) => {
    const seen = new Map<string, number>();
    for (const r of list) seen.set(r.leadId, r.amount);
    return roundMoney([...seen.values()].reduce((sum, v) => sum + v, 0));
  };

  return {
    trackingSince,
    countInPeriod: inPeriod.length,
    totalTracked: rows.length,
    recoveredCount: new Set(recovered.map((r) => r.leadId)).size,
    recoveredAmount: uniqueAmount(recovered),
    reactivatedOpenCount: new Set(reactivatedOpen.map((r) => r.leadId)).size,
    reactivatedOpenAmount: uniqueAmount(reactivatedOpen),
    rows: rows.slice(0, RECENT_LIMIT),
  };
}

function buildNoInteraction(inScope: ScoredDeal[], now: Date): NoInteractionSummary {
  const thresholdDays = FORECAST_RULES.STALE_INTERACTION_DAYS;
  const open = inScope.filter((s) => isDealOpen(s.deal));
  const rows: NoInteractionRow[] = open
    .map((s) => ({
      s,
      days: s.deal.lastInteraction ? daysBetween(s.deal.lastInteraction, now) : null,
    }))
    .filter(({ days }) => days == null || days > thresholdDays)
    .map(({ s, days }) => ({
      leadId: s.deal.id,
      title: s.deal.title,
      companyName: s.deal.companyName,
      owner: s.deal.owner,
      amount: s.deal.amount,
      stageName: s.deal.stageName,
      daysSinceInteraction: days,
      tier: s.forecast.tier,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    thresholdDays,
    openDealsEvaluated: open.length,
    count: rows.length,
    amount: roundMoney(rows.reduce((sum, r) => sum + r.amount, 0)),
    neverInteractedCount: rows.filter((r) => r.daysSinceInteraction == null).length,
    rows: rows.slice(0, RECENT_LIMIT),
  };
}

function buildTransitions(
  inScope: ScoredDeal[],
  history: StageHistoryRow[],
  sortOrderByStageId: Map<string, number>,
): StageTransitionsSummary {
  const scopeIds = new Set(inScope.map((s) => s.deal.id));
  const byLead = new Map<string, StageHistoryRow[]>();
  for (const row of history) {
    if (!scopeIds.has(row.leadId)) continue;
    if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
    byLead.get(row.leadId)!.push(row);
  }

  const edgeMap = new Map<string, { edge: StageTransitionEdge; durations: number[] }>();
  let total = 0;
  let backwardTotal = 0;
  for (const rowsOfLead of byLead.values()) {
    const sorted = [...rowsOfLead].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const from = sorted[i - 1];
      const to = sorted[i];
      const fromOrder = from.stageId ? sortOrderByStageId.get(from.stageId) : undefined;
      const toOrder = to.stageId ? sortOrderByStageId.get(to.stageId) : undefined;
      const backward = fromOrder != null && toOrder != null && toOrder < fromOrder;
      const key = `${from.stageName}→${to.stageName}`;
      const entry = edgeMap.get(key) ?? {
        edge: {
          fromStage: from.stageName,
          toStage: to.stageName,
          count: 0,
          medianDaysInFrom: null,
          backward,
        },
        durations: [],
      };
      entry.edge.count += 1;
      entry.durations.push(daysBetween(from.enteredAt, to.enteredAt));
      edgeMap.set(key, entry);
      total += 1;
      if (backward) backwardTotal += 1;
    }
  }

  const edges = [...edgeMap.values()]
    .map(({ edge, durations }) => ({ ...edge, medianDaysInFrom: median(durations) }))
    .sort((a, b) => b.count - a.count);

  return {
    trackingSince: history.length > 0 ? history[0].enteredAt.toISOString() : null,
    totalTransitions: total,
    backwardTransitions: backwardTotal,
    edges,
  };
}

export async function buildJourney(
  repository: CommercialIntelligenceRepository,
  organizationId: string,
  filter: CommercialIntelligenceFilter,
  now: Date,
): Promise<JourneyReport> {
  const { scored, stages, history, fieldChanges } = await loadScoredDeals(
    repository,
    organizationId,
    now,
  );
  const inScope = applyScope(scored, filter);
  const { start, end } = monthRange(filter.month);
  const terminalStageIds = new Set(stages.filter((s) => s.isWon || s.isLost).map((s) => s.id));
  const sortOrderByStageId = new Map(stages.map((s) => [s.id, s.sortOrder]));

  return {
    period: filter.month,
    handoffs: buildHandoffs(inScope, fieldChanges, start, end),
    reentries: buildReentries(inScope, history, terminalStageIds, start, end),
    noInteraction: buildNoInteraction(inScope, now),
    transitions: buildTransitions(inScope, history, sortOrderByStageId),
  };
}
