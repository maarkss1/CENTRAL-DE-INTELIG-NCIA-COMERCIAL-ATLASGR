/**
 * Pipeline criado (Fase 3) — volume/valor de negócios criados no mês, quebra por origem/vendedor,
 * pipeline necessário e Pipeline Creation Pace (seção 21).
 */

import type { CommercialIntelligenceFilter, CommercialIntelligenceRepository, DealRow, PipelineCreation } from '../../domain/CommercialIntelligence';
import { countBusinessDays } from '../executiveCalendar';
import { roundMoney } from '../shared/mathUtils';
import { monthRange } from '../shared/period';
import { loadScoredDeals } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';

export async function buildPipelineCreation(
    repository: CommercialIntelligenceRepository,
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now: Date
): Promise<PipelineCreation> {
    const { start, end } = monthRange(filter.month);
    const { scored } = await loadScoredDeals(repository, organizationId, now);
    const inScope = applyScope(scored, filter);
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

    const goal = await repository.getGoal(organizationId, filter.month, 'NEW_MRR');
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
