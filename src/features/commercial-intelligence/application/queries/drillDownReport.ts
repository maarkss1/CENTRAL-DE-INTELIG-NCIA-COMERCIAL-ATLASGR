/**
 * Drill-down (seção 29) — lista paginada/ordenável de negócios abertos por trás de qualquer
 * indicador do cockpit, e a explicação do forecast de um negócio específico (Centro de Decisão).
 */

import type {
    CommercialIntelligenceRepository,
    DealDrillDownQuery,
    DealDrillDownResult,
    DealDrillDownRow,
    ForecastExplain,
    ForecastTier,
} from '../../domain/CommercialIntelligence';
import { STAGE_AGING_CRITICAL_DAYS, isDealOpen } from '../pipelineEligibility';
import { loadScoredDeals, riskImpactValue, type ScoredDeal } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';

export async function buildDealsDrillDown(repository: CommercialIntelligenceRepository, organizationId: string, query: DealDrillDownQuery, now: Date): Promise<DealDrillDownResult> {
    const { scored } = await loadScoredDeals(repository, organizationId, now);
    let rows = applyScope(scored, { month: query.month, owner: query.owner, product: undefined, source: undefined, icp: undefined }).filter((s) => isDealOpen(s.deal));

    if (query.ids && query.ids.length > 0) {
        const idSet = new Set(query.ids);
        rows = rows.filter((s) => idSet.has(s.deal.id));
    }
    if (query.tier) rows = rows.filter((s) => s.forecast.tier === query.tier);
    if (query.stageId) rows = rows.filter((s) => s.deal.pipelineStageId === query.stageId);
    if (query.agingCritical) rows = rows.filter((s) => s.agingDays > STAGE_AGING_CRITICAL_DAYS);
    if (query.missingNextAction) rows = rows.filter((s) => !s.deal.nextAction);

    // Centro de Decisão: ordena por "valor em risco" (amount × probabilidade de NÃO fechar),
    // reaproveitando o mesmo `forecast.probability` explicável já usado no drill-down padrão —
    // nenhum sinal novo, só uma ordenação alternativa do mesmo dado.
    if (query.sort === 'riskImpact') {
        rows = [...rows].sort((a, b) => riskImpactValue(b) - riskImpactValue(a));
    }

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

export async function buildForecastExplain(repository: CommercialIntelligenceRepository, organizationId: string, leadId: string, now: Date): Promise<ForecastExplain | null> {
    const { scored } = await loadScoredDeals(repository, organizationId, now);
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
