/**
 * Forecast Ponderado Explicável — motor DETERMINÍSTICO (sem IA/ML) de pontuação de oportunidade.
 * Seção 11 do prompt de produto: "não chamar de IA se o algoritmo for determinístico". Cada
 * ajuste é uma regra fixa e documentada abaixo — nunca aprendida/inferida por modelo. Sinais
 * usados são só os disponíveis hoje no schema (ver `DealRow`/`LeadStageHistory`); quando um sinal
 * não existe para uma oportunidade (ex.: sem histórico de etapa ainda), o fator correspondente
 * simplesmente não se aplica — nunca vira um valor inventado.
 *
 * Puro e testável em isolamento (`__tests__/forecastEngine.unit.test.ts`) — sem I/O, sem Date.now()
 * implícito (recebe `now` explicitamente).
 */
import type { ForecastTier } from '../domain/CommercialIntelligence';

export interface ForecastSignals {
    amount: number;
    /** Probabilidade da etapa atual no pipeline (`CrmPipelineStage.probability`), 0-100. */
    stageProbability: number;
    now: Date;
    createdAt: Date;
    expectedCloseAt: Date | null;
    lastInteraction: Date | null;
    nextAction: Date | null;
    /** Dias na etapa atual, calculado a partir de `LeadStageHistory`. `null` quando não há histórico real (nunca estimado aqui — a estimativa por `updatedAt` é decisão de apresentação de Aging, não do forecast). */
    daysInCurrentStage: number | null;
    /** Duração média histórica (dias) de negócios que já passaram por esta etapa, calculada a partir de `LeadStageHistory` real. `null` sem amostra suficiente. */
    stageAverageDurationDays: number | null;
}

export interface ForecastResult {
    /** Probabilidade final (0-100) depois dos ajustes explicáveis, sempre partindo da probabilidade da etapa. */
    probability: number;
    weightedValue: number;
    tier: ForecastTier;
    positiveFactors: string[];
    negativeFactors: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Limiares do motor — constantes de política, não dado fabricado (mesmo espírito de `STAGE_AGING_CRITICAL_DAYS`, ver `pipelineEligibility.ts`). */
export const FORECAST_RULES = {
    NEXT_ACTION_SOON_DAYS: 14,
    NEXT_ACTION_OVERDUE_DAYS: 7,
    RECENT_INTERACTION_DAYS: 7,
    STALE_INTERACTION_DAYS: 30,
    EXPECTED_CLOSE_NEAR_DAYS: 30,
    STALLED_STAGE_MULTIPLIER: 2,
    COMMIT_THRESHOLD: 70,
    BEST_CASE_THRESHOLD: 40,
    PIPELINE_THRESHOLD: 10,
} as const;

/** Pontua uma única oportunidade. Clampa a probabilidade final em [0, 100]. */
export function scoreOpportunity(signals: ForecastSignals): ForecastResult {
    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];
    let probability = signals.stageProbability;

    // Próxima ação agendada/atrasada
    if (signals.nextAction) {
        const daysToAction = daysBetween(signals.now, signals.nextAction);
        if (daysToAction >= 0 && daysToAction <= FORECAST_RULES.NEXT_ACTION_SOON_DAYS) {
            probability += 10;
            positiveFactors.push('Próxima ação agendada nos próximos dias');
        } else if (daysToAction < -FORECAST_RULES.NEXT_ACTION_OVERDUE_DAYS) {
            probability -= 15;
            negativeFactors.push('Próxima ação vencida há mais de uma semana');
        }
    } else {
        probability -= 15;
        negativeFactors.push('Sem próxima ação registrada');
    }

    // Recência de interação
    if (signals.lastInteraction) {
        const daysSinceInteraction = daysBetween(signals.lastInteraction, signals.now);
        if (daysSinceInteraction <= FORECAST_RULES.RECENT_INTERACTION_DAYS) {
            probability += 5;
            positiveFactors.push('Interação recente (últimos 7 dias)');
        } else if (daysSinceInteraction > FORECAST_RULES.STALE_INTERACTION_DAYS) {
            probability -= 10;
            negativeFactors.push('Sem interação há mais de 30 dias');
        }
    } else {
        probability -= 10;
        negativeFactors.push('Nenhuma interação registrada');
    }

    // Data prevista de fechamento
    if (signals.expectedCloseAt) {
        const daysToClose = daysBetween(signals.now, signals.expectedCloseAt);
        if (daysToClose < 0) {
            probability -= 10;
            negativeFactors.push('Data prevista de fechamento vencida');
        } else if (daysToClose <= FORECAST_RULES.EXPECTED_CLOSE_NEAR_DAYS) {
            probability += 5;
            positiveFactors.push('Fechamento previsto para os próximos 30 dias');
        }
    } else {
        probability -= 5;
        negativeFactors.push('Sem data prevista de fechamento');
    }

    // Estagnação na etapa (só quando há histórico real de etapa E amostra histórica de duração)
    if (
        signals.daysInCurrentStage != null &&
        signals.stageAverageDurationDays != null &&
        signals.stageAverageDurationDays > 0 &&
        signals.daysInCurrentStage > signals.stageAverageDurationDays * FORECAST_RULES.STALLED_STAGE_MULTIPLIER
    ) {
        probability -= 10;
        negativeFactors.push('Parado na etapa há mais que o dobro do tempo médio histórico');
    }

    probability = Math.min(100, Math.max(0, Math.round(probability)));

    let tier: ForecastTier;
    if (probability >= FORECAST_RULES.COMMIT_THRESHOLD) tier = 'Commit';
    else if (probability >= FORECAST_RULES.BEST_CASE_THRESHOLD) tier = 'BestCase';
    else if (probability >= FORECAST_RULES.PIPELINE_THRESHOLD) tier = 'Pipeline';
    else tier = 'Upside';

    return {
        probability,
        weightedValue: Math.round(signals.amount * (probability / 100) * 100) / 100,
        tier,
        positiveFactors,
        negativeFactors,
    };
}
