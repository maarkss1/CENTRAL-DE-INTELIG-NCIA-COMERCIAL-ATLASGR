/**
 * Aging (Fase 5) — distribuição de negócios abertos por faixa de idade e por etapa, com o limiar
 * crítico de estagnação (`STAGE_AGING_CRITICAL_DAYS`, `pipelineEligibility.ts`).
 */

import type { AgingBucket, AgingReport, CommercialIntelligenceFilter, CommercialIntelligenceRepository, StageAging } from '../../domain/CommercialIntelligence';
import { STAGE_AGING_CRITICAL_DAYS, isDealOpen } from '../pipelineEligibility';
import { daysBetween, mean, roundMoney } from '../shared/mathUtils';
import { loadScoredDeals, type ScoredDeal } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';

export async function buildAging(
    repository: CommercialIntelligenceRepository,
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now: Date
): Promise<AgingReport> {
    const { scored, history } = await loadScoredDeals(repository, organizationId, now);
    const inScope = applyScope(scored, filter);
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
