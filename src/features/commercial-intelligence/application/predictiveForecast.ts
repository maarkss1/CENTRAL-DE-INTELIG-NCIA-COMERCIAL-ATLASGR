/**
 * Previsor — Projeção Estatística por Cenário. Puro e testável em isolamento (sem I/O), mesmo
 * espírito de `forecastEngine.ts`/`dataReadiness.ts`: constantes de política documentadas, nunca
 * um número inventado.
 *
 * `buildForecastRange` NÃO introduz nenhum cálculo novo — os 3 cenários são somas de campos que já
 * existem em `ExecutiveOverview` (calculados e testados por `CommercialIntelligenceUseCases`).
 * Isto é deliberado: a "previsão" é uma recomposição transparente do que o motor de forecast
 * ponderado explicável já produziu, não um segundo modelo estatístico paralelo — ver AGENTS.md
 * deste módulo ("não fabricar KPI") e o comentário de topo de `forecastEngine.ts` sobre nunca
 * chamar de IA algo determinístico.
 */
import type { ExecutiveOverview, ForecastRange, ForecastScenario, HistoricalTrendsReport, TrendMomentum } from '../domain/CommercialIntelligence';

/** Limiar de variação (pontos percentuais de Win Rate) para classificar momentum — política, não medição. */
export const TREND_MOMENTUM_THRESHOLD_PP = 3;

function scenario(label: string, amount: number, goalAmount: number | null): ForecastScenario {
    const gapToGoal = goalAmount == null ? null : Math.max(0, Math.round((goalAmount - amount) * 100) / 100);
    return { label, amount, gapToGoal };
}

/**
 * 3 cenários a partir de campos já calculados de `ExecutiveOverview`:
 * - Conservador: só o que já é praticamente certo (Fechado + Commit).
 * - Provável: o próprio Forecast ponderado explicável já existente (Fechado + Commit + Best Case +
 *   pipeline ponderado pela probabilidade — inclui uma fração de TODO negócio aberto, não só dos
 *   tiers Commit/BestCase/Upside).
 * - Otimista: Fechado + Pipeline Total (valor cheio de TODO negócio aberto do funil, qualquer
 *   tier). Precisa ser sempre >= Provável — usar só a soma dos tiers Commit/BestCase/Upside (sem o
 *   tier "Pipeline") já causou o cenário Otimista ficar MENOR que o Provável (negócio com
 *   probabilidade baixa/média pesa no forecast ponderado mas não teria seu valor cheio contado
 *   aqui), encontrado via QA real, não por revisão de código — corrigido usando `pipelineTotal`
 *   (todo o funil aberto, não o "elegível", que é um subconjunto por critério de qualidade de dado,
 *   não a base certa para "e se tudo em aberto fechasse").
 */
export function buildForecastRange(overview: ExecutiveOverview): ForecastRange {
    const goalAmount = overview.goal?.amount ?? null;
    const currency = overview.goal?.currency ?? 'BRL';

    const conservativeAmount = overview.closedAmount + overview.commitAmount;
    const optimisticAmount = overview.closedAmount + overview.pipelineTotal;

    return {
        conservative: scenario('Conservador', conservativeAmount, goalAmount),
        likely: scenario('Provável', overview.forecastAmount, goalAmount),
        optimistic: scenario('Otimista', optimisticAmount, goalAmount),
        currency,
    };
}

/**
 * Momentum do Win Rate: compara o ponto mais recente com amostra (`closedSampleSize > 0`) contra a
 * média dos pontos anteriores também com amostra. `null` sem pelo menos 2 pontos avaliáveis —
 * nunca infere tendência de uma amostra insuficiente.
 */
export function computeTrendMomentum(trends: HistoricalTrendsReport): TrendMomentum | null {
    const withSample = trends.points.filter((p) => p.closedSampleSize > 0 && p.winRate != null);
    if (withSample.length < 2) return null;

    const latest = withSample[withSample.length - 1];
    const previous = withSample.slice(0, -1);
    const previousAverageWinRate = previous.reduce((sum, p) => sum + (p.winRate as number), 0) / previous.length;
    const latestWinRate = latest.winRate as number;
    const delta = Math.round((latestWinRate - previousAverageWinRate) * 100) / 100;

    let direction: TrendMomentum['direction'];
    if (delta >= TREND_MOMENTUM_THRESHOLD_PP) direction = 'melhorando';
    else if (delta <= -TREND_MOMENTUM_THRESHOLD_PP) direction = 'piorando';
    else direction = 'estavel';

    return {
        direction,
        latestWinRate,
        previousAverageWinRate: Math.round(previousAverageWinRate * 100) / 100,
        deltaPercentagePoints: delta,
    };
}
