/**
 * Comandos/queries de Meta comercial (`CommercialGoal`) — leitura e escrita são triviais o
 * bastante para não precisarem de scoring/relatório, mas ficam isoladas do resto da fachada porque
 * são a única parte deste módulo que ESCREVE dado (todo o restante é somente leitura/derivado).
 */

import type { CommercialGoalDTO, CommercialIntelligenceRepository, GoalMetric, PeriodMonth } from '../domain/CommercialIntelligence';

export function getGoal(repository: CommercialIntelligenceRepository, organizationId: string, period: PeriodMonth, metric: GoalMetric = 'NEW_MRR'): Promise<CommercialGoalDTO | null> {
    return repository.getGoal(organizationId, period, metric);
}

export function setGoal(
    repository: CommercialIntelligenceRepository,
    organizationId: string,
    period: PeriodMonth,
    amount: number,
    createdBy: string,
    currency = 'BRL',
    metric: GoalMetric = 'NEW_MRR'
): Promise<CommercialGoalDTO> {
    return repository.upsertGoal(organizationId, period, metric, amount, currency, createdBy);
}
