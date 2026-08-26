/**
 * Leading Indicators (Fase 5/6) — série semanal (atual, semana anterior, média móvel de 4 semanas,
 * tendência) para os 6 indicadores de atividade comercial que antecedem o fechamento.
 */

import type { CommercialIntelligenceRepository, LeadingIndicatorPoint, LeadingIndicatorsReport } from '../../domain/CommercialIntelligence';
import { DAY_MS, roundMoney } from '../shared/mathUtils';
import { countAdvancedTransitions } from '../scoring/stageHistoryAnalytics';

export async function buildLeadingIndicators(repository: CommercialIntelligenceRepository, organizationId: string, now: Date): Promise<LeadingIndicatorsReport> {
    const weekMs = 7 * DAY_MS;
    const weekEnd = now;
    const weekStart = new Date(now.getTime() - weekMs);
    const prevWeekStart = new Date(now.getTime() - 2 * weekMs);
    const window4wStart = new Date(now.getTime() - 4 * weekMs);

    const deals = await repository.findDeals(organizationId);
    const history = await repository.findStageHistory(organizationId);

    const countMeetings = (from: Date, to: Date) => repository.countCompletedMeetings(organizationId, from, to);
    const countQualified = (from: Date, to: Date) => repository.countTimelineEventsByType(organizationId, 'conversion', from, to);

    const countCreated = (from: Date, to: Date) => deals.filter((d) => d.createdAt >= from && d.createdAt < to).length;
    const countAdvanced = (from: Date, to: Date) => countAdvancedTransitions(history, from, to);
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
