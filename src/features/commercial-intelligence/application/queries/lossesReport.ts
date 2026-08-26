/**
 * Motivos de perda (Fase 7) — orquestra `loadScoredDeals`/escopo e delega a classificação de cada
 * motivo bruto para `lossTaxonomy.ts` (única fonte da taxonomia).
 */

import type { CommercialIntelligenceFilter, CommercialIntelligenceRepository, LossAnalysis } from '../../domain/CommercialIntelligence';
import { classifyLossReason } from '../lossTaxonomy';
import { roundMoney } from '../shared/mathUtils';
import { monthRange } from '../shared/period';
import { loadScoredDeals } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';

export async function buildLosses(
    repository: CommercialIntelligenceRepository,
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now: Date
): Promise<LossAnalysis> {
    const { start, end } = monthRange(filter.month);
    const { scored } = await loadScoredDeals(repository, organizationId, now);
    const inScope = applyScope(scored, filter);
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
