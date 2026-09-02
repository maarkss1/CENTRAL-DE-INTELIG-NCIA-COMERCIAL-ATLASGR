/**
 * CLOSEDATE Intelligence — o que aconteceu com a DATA PREVISTA de fechamento de cada negócio
 * aberto, segundo o histórico real de `LeadFieldChange` (campo `expectedCloseAt`). Responde:
 * quantas vezes cada negócio foi adiado/antecipado, data original vs. atual, dias deslocados,
 * quais estão "constantemente empurrados", e o padrão por vendedor/produto/etapa.
 *
 * Nunca fabrica histórico: sem nenhuma linha de `LeadFieldChange`, `trackingSince` é `null` e
 * todo negócio aparece com 0 mudanças — o que é "sem histórico", não "nunca adiado". A UI
 * precisa mostrar essa diferença.
 */

import type {
  CommercialIntelligenceFilter,
  CommercialIntelligenceRepository,
} from '../../domain/CommercialIntelligence';
import type {
  CloseDateBreakdown,
  CloseDateDealRow,
  CloseDateIntelligenceReport,
} from '../../domain/JourneyIntelligence';
import { FORECAST_RULES, FORECAST_RULES_VERSION } from '../forecastEngine';
import { isDealOpen } from '../pipelineEligibility';
import { daysBetween, mean, roundMoney } from '../shared/mathUtils';
import { monthRange } from '../shared/period';
import { loadScoredDeals, type ScoredDeal } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';

function breakdown(
  rows: Array<{ deal: ScoredDeal; slips: number; chronic: boolean }>,
  keyOf: (s: ScoredDeal) => string[] | string | null,
): CloseDateBreakdown[] {
  const map = new Map<string, CloseDateBreakdown>();
  for (const row of rows) {
    const raw = keyOf(row.deal);
    const keys = Array.isArray(raw) ? (raw.length > 0 ? raw : [null]) : [raw];
    for (const key of keys) {
      const label = key || 'Não informado';
      const entry = map.get(label) ?? {
        label,
        dealsWithSlips: 0,
        totalSlips: 0,
        chronicDeals: 0,
        amountAtRisk: 0,
      };
      entry.dealsWithSlips += 1;
      entry.totalSlips += row.slips;
      if (row.chronic) entry.chronicDeals += 1;
      entry.amountAtRisk = roundMoney(entry.amountAtRisk + row.deal.deal.amount);
      map.set(label, entry);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.totalSlips - a.totalSlips || b.amountAtRisk - a.amountAtRisk,
  );
}

export async function buildCloseDateIntelligence(
  repository: CommercialIntelligenceRepository,
  organizationId: string,
  filter: CommercialIntelligenceFilter,
  now: Date,
): Promise<CloseDateIntelligenceReport> {
  const { scored, fieldChanges, closeDateStats } = await loadScoredDeals(
    repository,
    organizationId,
    now,
  );
  const closeDateChanges = fieldChanges.filter((c) => c.field === 'expectedCloseAt');
  // Mínimo explícito (não "primeira linha") — o repositório Prisma já ordena por changedAt, mas o
  // contrato não obriga; um fake/outro repositório sem ordenação não pode mudar o resultado.
  const trackingSince =
    closeDateChanges.length > 0
      ? closeDateChanges
          .reduce(
            (min, c) => (c.changedAt < min ? c.changedAt : min),
            closeDateChanges[0].changedAt,
          )
          .toISOString()
      : null;

  const open = applyScope(scored, filter).filter((s) => isDealOpen(s.deal));
  const { start, end } = monthRange(filter.month);

  const dealRows: CloseDateDealRow[] = [];
  const shiftedDaysPerSlip: number[] = [];
  let totalSlips = 0;
  let totalPullIns = 0;
  let dealsWithAnyChange = 0;
  let slippedIntoPeriodCount = 0;
  let slippedOutOfPeriodCount = 0;
  let slippedOutOfPeriodAmount = 0;

  for (const s of open) {
    const stats = closeDateStats.get(s.deal.id);
    if (!stats) continue;
    dealsWithAnyChange += 1;
    totalSlips += stats.slips;
    totalPullIns += stats.pullIns;

    // Dias deslocados por adiamento individual (média usada no resumo) — recalculado a partir
    // das linhas de histórico deste negócio para não depender de um agregado aproximado.
    const own = closeDateChanges.filter((c) => c.leadId === s.deal.id);
    for (const c of own) {
      if (!c.previousValue || !c.newValue) continue;
      const before = new Date(c.previousValue);
      const after = new Date(c.newValue);
      if (after > before) shiftedDaysPerSlip.push(daysBetween(before, after));
      // "Saiu do mês do filtro" / "entrou no mês do filtro": compara o mês de cada lado da mudança
      const beforeInPeriod = before >= start && before < end;
      const afterInPeriod = after >= start && after < end;
      if (beforeInPeriod && !afterInPeriod && after >= end) {
        slippedOutOfPeriodCount += 1;
        slippedOutOfPeriodAmount = roundMoney(slippedOutOfPeriodAmount + s.deal.amount);
      } else if (!beforeInPeriod && afterInPeriod && before < start) {
        slippedIntoPeriodCount += 1;
      }
    }

    if (stats.slips === 0) continue;
    const originalCloseAt = stats.originalCloseAt ?? s.deal.expectedCloseAt ?? null;
    const currentCloseAt = s.deal.expectedCloseAt ?? null;
    dealRows.push({
      leadId: s.deal.id,
      title: s.deal.title,
      companyName: s.deal.companyName,
      owner: s.deal.owner,
      amount: s.deal.amount,
      stageName: s.deal.stageName,
      tier: s.forecast.tier,
      originalCloseAt: originalCloseAt ? originalCloseAt.toISOString() : null,
      currentCloseAt: currentCloseAt ? currentCloseAt.toISOString() : null,
      slips: stats.slips,
      pullIns: stats.pullIns,
      netDaysShifted:
        originalCloseAt && currentCloseAt ? daysBetween(originalCloseAt, currentCloseAt) : null,
      lastChangedAt: stats.lastChangedAt ? stats.lastChangedAt.toISOString() : null,
      chronic: stats.slips >= FORECAST_RULES.CLOSE_DATE_CHRONIC_SLIPS,
    });
  }

  dealRows.sort((a, b) => b.slips - a.slips || b.amount - a.amount);

  const withSlips = dealRows.map((row) => ({
    deal: open.find((s) => s.deal.id === row.leadId)!,
    slips: row.slips,
    chronic: row.chronic,
  }));

  return {
    period: filter.month,
    trackingSince,
    openDealsEvaluated: open.length,
    dealsWithAnyChange,
    dealsWithSlips: dealRows.length,
    totalSlips,
    totalPullIns,
    chronicDeals: dealRows.filter((r) => r.chronic).length,
    amountWithSlips: roundMoney(dealRows.reduce((sum, r) => sum + r.amount, 0)),
    averageDaysSlippedPerSlip: mean(shiftedDaysPerSlip),
    slippedIntoPeriodCount,
    slippedOutOfPeriodCount,
    slippedOutOfPeriodAmount,
    byOwner: breakdown(withSlips, (s) => s.deal.owner),
    byProduct: breakdown(withSlips, (s) => s.deal.productSkus),
    byStage: breakdown(withSlips, (s) => s.deal.stageName),
    deals: dealRows,
    rulesVersion: FORECAST_RULES_VERSION,
  };
}
