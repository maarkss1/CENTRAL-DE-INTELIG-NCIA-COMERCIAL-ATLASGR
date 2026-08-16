import type { CommercialGoalDTO, RevenueProtectionSnapshot, RevenueProtectionStatus } from '../domain/CommercialIntelligence';

/**
 * Bloco "Proteção de Receita M/M+1/M+2/M+3" (referência: `cockpitCalcularProtecao`/
 * `cockpitStatusProtecao` em `js/cockpit.js` do Cockpit legado). A fonte usa um threshold FIXO
 * (<2x crítico, 2x-3x atenção, ≥3x saudável) e o próprio comentário da função avisa: "critério
 * inicial e configurável (não é regra fixa acordada com a diretoria)". Não portamos esse número
 * mágico — em vez disso, o status compara a cobertura real com `coverageRecommended` (1 / Win
 * Rate), que este módulo já calcula e já usa em `CoverageSnapshot` (coverageMonth/coverage30/60/90)
 * para o mesmo propósito. Limiares escolhidos (documentados aqui, ajustáveis se o negócio pedir
 * outro corte):
 *   - coverage < 70% do recomendado → crítico (bem abaixo do que o Win Rate histórico exige)
 *   - 70% ≤ coverage < 100% do recomendado → atenção (perto, mas ainda não cobre)
 *   - coverage ≥ 100% do recomendado → saudável
 *   - sem `coverage` ou sem `coverageRecommended` calculável → "unknown" (nunca um status fabricado
 *     sobre dado ausente).
 */
export function deriveProtectionStatus(coverage: number | null, coverageRecommended: number | null): RevenueProtectionStatus {
    if (coverage == null || coverageRecommended == null || coverageRecommended <= 0) return 'unknown';
    const ratio = coverage / coverageRecommended;
    if (ratio < 0.7) return 'critical';
    if (ratio < 1) return 'attention';
    return 'healthy';
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Monta o snapshot de um único mês-calendário (M, M+1, M+2 ou M+3) a partir de valores já
 * apurados pelo use case (goal, fechado no mês, pipeline elegível no mês, coverage recomendado) —
 * função pura, sem acesso a repositório, para ficar testável sem mock de banco.
 */
export function buildRevenueProtectionSnapshot(
    period: string,
    label: string,
    goal: CommercialGoalDTO | null,
    closedAmountInMonth: number,
    pipelineEligibleInMonth: number,
    coverageRecommended: number | null,
): RevenueProtectionSnapshot {
    const remainingGoal = goal ? Math.max(0, roundMoney(goal.amount - closedAmountInMonth)) : 0;
    const coverage = goal && remainingGoal > 0 ? roundMoney(pipelineEligibleInMonth / remainingGoal) : null;
    return {
        period,
        label,
        goal,
        remainingGoal,
        pipelineEligible: roundMoney(pipelineEligibleInMonth),
        coverage,
        coverageRecommended,
        status: deriveProtectionStatus(coverage, coverageRecommended),
    };
}
