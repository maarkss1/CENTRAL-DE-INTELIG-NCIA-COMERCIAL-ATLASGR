/**
 * Health Score composto — agrega em pilares NOMEADOS métricas que já existem e já são testadas em
 * outros lugares do módulo (nunca um cálculo paralelo/duplicado): Pipeline (coverage), Conversão
 * (win rate), Produtividade (leading indicators), Qualidade de CRM (`crmQualityReport`/
 * `dataReadiness`), Follow-up (aging) e Confiabilidade de Forecast (erro histórico,
 * `forecastAccuracy.ts`).
 *
 * Cada fórmula é uma agregação simples e documentada — não é ML, é rastreabilidade (mesmo
 * princípio de `dataReadiness.ts`/`FORECAST_RULES`). Arquivo deliberadamente separado de
 * `forecastEngine.ts` (ver AGENTS.md deste módulo): compõe SOBRE outros relatórios, não é parte do
 * motor de forecast em si.
 *
 * Puro e testável em isolamento — recebe os relatórios já calculados (`ExecutiveOverview`,
 * `PerformanceMetrics`, `AgingReport`, `LeadingIndicatorsReport`, `CrmQualityIndex`,
 * `ForecastAccuracySummary`), sem I/O próprio.
 */
import type {
    AgingReport,
    CrmQualityIndex,
    ExecutiveOverview,
    ForecastAccuracySummary,
    HealthPillarKey,
    HealthPillarScore,
    HealthScoreResult,
    LeadingIndicatorsReport,
    PerformanceMetrics,
} from '../domain/CommercialIntelligence';
import { classifyCoverageProtection, COVERAGE_PROTECTION_FALLBACK_HEALTHY } from './coverageProtection';
import { roundMoney } from './shared/mathUtils';

export interface HealthScoreInput {
    overview: ExecutiveOverview;
    performance: PerformanceMetrics;
    aging: AgingReport;
    leadingIndicators: LeadingIndicatorsReport;
    crmQuality: CrmQualityIndex;
    forecastAccuracy: ForecastAccuracySummary;
}

/** Limiares de classificação por pilar — política documentada, não medição (mesmo espírito de `FORECAST_RULES`/`STAGE_AGING_CRITICAL_DAYS`). */
export const HEALTH_SCORE_RULES = {
    /** Win Rate (%) considerado saudável/em atenção para o pilar Conversão. */
    WIN_RATE_HEALTHY_PCT: 30,
    WIN_RATE_WARNING_PCT: 15,
    /** Razão (atividade da semana atual / média móvel de 4 semanas) para o pilar Produtividade. */
    PRODUCTIVITY_HEALTHY_RATIO: 1.0,
    PRODUCTIVITY_WARNING_RATIO: 0.7,
    /** % do pipeline aberto DENTRO do aging crítico (não passou de `STAGE_AGING_CRITICAL_DAYS`) para o pilar Follow-up. */
    FOLLOWUP_HEALTHY_PCT: 80,
    FOLLOWUP_WARNING_PCT: 50,
    /** Erro percentual absoluto médio do forecast para o pilar Confiabilidade de Forecast (menor = melhor, por isso os limiares são invertidos em relação aos demais). */
    FORECAST_RELIABILITY_HEALTHY_ERROR_PCT: 15,
    FORECAST_RELIABILITY_WARNING_ERROR_PCT: 30,
} as const;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** saudável quando `score >= healthyMin`; atenção quando `score >= warningMin`; crítico abaixo disso. */
function classifyAscending(score: number, healthyMin: number, warningMin: number): HealthPillarScore['classification'] {
    if (score >= healthyMin) return 'saudavel';
    if (score >= warningMin) return 'atencao';
    return 'critico';
}

/** saudável quando `value <= healthyMax` (usado para métricas onde MENOR é melhor, como erro percentual). */
function classifyDescending(value: number, healthyMax: number, warningMax: number): HealthPillarScore['classification'] {
    if (value <= healthyMax) return 'saudavel';
    if (value <= warningMax) return 'atencao';
    return 'critico';
}

function pillarPipeline(overview: ExecutiveOverview): HealthPillarScore {
    const { coverage, coverageRecommended } = overview.coverageMonth;
    const hasGoal = !!overview.goal;
    const explanation = 'Coverage do mês corrente (Pipeline Elegível / Meta restante) em relação ao Coverage recomendado (1 / Win Rate histórico, ou 3x como piso-padrão sem Win Rate calculável ainda).';
    if (!hasGoal || coverage == null) {
        return {
            pillar: 'pipeline', label: 'Pipeline', score: null, classification: null, explanation,
            metricsUsed: ['ExecutiveOverview.coverageMonth', 'ExecutiveOverview.goal'],
            unavailableReason: !hasGoal ? 'sem_meta_cadastrada' : 'coverage_nao_calculavel',
        };
    }
    const denominator = coverageRecommended && coverageRecommended > 0 ? coverageRecommended : COVERAGE_PROTECTION_FALLBACK_HEALTHY;
    const score = roundMoney(clamp((coverage / denominator) * 100, 0, 100));
    const classification = classifyCoverageProtection(hasGoal, coverage, coverageRecommended);
    return {
        pillar: 'pipeline', label: 'Pipeline', score,
        classification: classification === 'sem_dados' ? null : classification,
        explanation,
        metricsUsed: ['ExecutiveOverview.coverageMonth.coverage', 'ExecutiveOverview.coverageMonth.coverageRecommended'],
        unavailableReason: null,
    };
}

function pillarConversao(performance: PerformanceMetrics): HealthPillarScore {
    const explanation = `Win Rate do período (Ganhos / (Ganhos + Perdidos)). Saudável ≥ ${HEALTH_SCORE_RULES.WIN_RATE_HEALTHY_PCT}%, atenção ≥ ${HEALTH_SCORE_RULES.WIN_RATE_WARNING_PCT}%, crítico abaixo disso.`;
    if (performance.winRate == null) {
        return {
            pillar: 'conversao', label: 'Conversão', score: null, classification: null, explanation,
            metricsUsed: ['PerformanceMetrics.winRate'], unavailableReason: 'sem_negocios_fechados_no_periodo',
        };
    }
    return {
        pillar: 'conversao', label: 'Conversão', score: performance.winRate,
        classification: classifyAscending(performance.winRate, HEALTH_SCORE_RULES.WIN_RATE_HEALTHY_PCT, HEALTH_SCORE_RULES.WIN_RATE_WARNING_PCT),
        explanation, metricsUsed: ['PerformanceMetrics.winRate'], unavailableReason: null,
    };
}

function pillarProdutividade(leadingIndicators: LeadingIndicatorsReport): HealthPillarScore {
    const explanation = `Média, entre os 6 Leading Indicators, da razão (semana atual / média móvel de 4 semanas). ${roundMoney(HEALTH_SCORE_RULES.PRODUCTIVITY_HEALTHY_RATIO * 100)}%+ da média histórica = saudável, ${roundMoney(HEALTH_SCORE_RULES.PRODUCTIVITY_WARNING_RATIO * 100)}%+ = atenção.`;
    const withBaseline = leadingIndicators.indicators.filter((i) => i.movingAverage4w > 0);
    if (withBaseline.length === 0) {
        return {
            pillar: 'produtividade', label: 'Produtividade', score: null, classification: null, explanation,
            metricsUsed: ['LeadingIndicatorsReport.indicators'], unavailableReason: 'sem_media_movel_calculavel',
        };
    }
    const ratios = withBaseline.map((i) => i.current / i.movingAverage4w);
    const averageRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    const score = roundMoney(clamp(averageRatio * 100, 0, 100));
    return {
        pillar: 'produtividade', label: 'Produtividade', score,
        classification: classifyAscending(averageRatio, HEALTH_SCORE_RULES.PRODUCTIVITY_HEALTHY_RATIO, HEALTH_SCORE_RULES.PRODUCTIVITY_WARNING_RATIO),
        explanation, metricsUsed: ['LeadingIndicatorsReport.indicators[].current', 'LeadingIndicatorsReport.indicators[].movingAverage4w'], unavailableReason: null,
    };
}

function pillarQualidadeCrm(crmQuality: CrmQualityIndex): HealthPillarScore {
    const explanation = 'Confiabilidade dos Dados (application/dataReadiness.ts) — completude ponderada por impacto real no Forecast, reaproveitada sem recálculo. Saudável ≥80%, atenção ≥50%, crítico abaixo.';
    const score = crmQuality.dataReadiness.overallScore;
    if (score == null) {
        return {
            pillar: 'qualidadeCrm', label: 'Qualidade do CRM', score: null, classification: null, explanation,
            metricsUsed: ['CrmQualityIndex.dataReadiness.overallScore'], unavailableReason: 'sem_negocios_avaliaveis',
        };
    }
    return {
        pillar: 'qualidadeCrm', label: 'Qualidade do CRM', score,
        classification: crmQuality.dataReadiness.classification,
        explanation, metricsUsed: ['CrmQualityIndex.dataReadiness.overallScore'], unavailableReason: null,
    };
}

function pillarFollowUp(aging: AgingReport): HealthPillarScore {
    const explanation = `% do valor de pipeline aberto que NÃO está acima do aging crítico da etapa (${aging.criticalThresholdDays} dias) — 100% menos a fração em risco de estagnação. Saudável ≥ ${HEALTH_SCORE_RULES.FOLLOWUP_HEALTHY_PCT}%, atenção ≥ ${HEALTH_SCORE_RULES.FOLLOWUP_WARNING_PCT}%.`;
    const totalOpenAmount = aging.buckets.reduce((sum, b) => sum + b.amount, 0);
    if (totalOpenAmount <= 0) {
        return {
            pillar: 'followUp', label: 'Follow-up', score: null, classification: null, explanation,
            metricsUsed: ['AgingReport.buckets', 'AgingReport.byStage'], unavailableReason: 'sem_negocios_abertos',
        };
    }
    const overdueAmount = aging.byStage.reduce((sum, s) => sum + s.amountOverThreshold, 0);
    const score = roundMoney(clamp(100 - (overdueAmount / totalOpenAmount) * 100, 0, 100));
    return {
        pillar: 'followUp', label: 'Follow-up', score,
        classification: classifyAscending(score, HEALTH_SCORE_RULES.FOLLOWUP_HEALTHY_PCT, HEALTH_SCORE_RULES.FOLLOWUP_WARNING_PCT),
        explanation, metricsUsed: ['AgingReport.buckets[].amount', 'AgingReport.byStage[].amountOverThreshold'], unavailableReason: null,
    };
}

function pillarConfiabilidadeForecast(forecastAccuracy: ForecastAccuracySummary): HealthPillarScore {
    const explanation = `100 − Erro Percentual Absoluto Médio do Forecast entre os períodos já fechados com snapshot registrado (application/forecastAccuracy.ts). Saudável quando o erro médio ≤ ${HEALTH_SCORE_RULES.FORECAST_RELIABILITY_HEALTHY_ERROR_PCT}%, atenção ≤ ${HEALTH_SCORE_RULES.FORECAST_RELIABILITY_WARNING_ERROR_PCT}%.`;
    if (!forecastAccuracy.available || forecastAccuracy.meanAbsoluteErrorPercent == null) {
        return {
            pillar: 'confiabilidadeForecast', label: 'Confiabilidade de Forecast', score: null, classification: null, explanation,
            metricsUsed: ['ForecastAccuracySummary.meanAbsoluteErrorPercent'],
            unavailableReason: forecastAccuracy.reason ?? 'sem_historico_suficiente',
        };
    }
    const score = roundMoney(clamp(100 - forecastAccuracy.meanAbsoluteErrorPercent, 0, 100));
    return {
        pillar: 'confiabilidadeForecast', label: 'Confiabilidade de Forecast', score,
        classification: classifyDescending(forecastAccuracy.meanAbsoluteErrorPercent, HEALTH_SCORE_RULES.FORECAST_RELIABILITY_HEALTHY_ERROR_PCT, HEALTH_SCORE_RULES.FORECAST_RELIABILITY_WARNING_ERROR_PCT),
        explanation, metricsUsed: ['ForecastAccuracySummary.meanAbsoluteErrorPercent', 'ForecastAccuracySummary.sampleSize'], unavailableReason: null,
    };
}

const PILLAR_BUILDERS: Record<HealthPillarKey, (input: HealthScoreInput) => HealthPillarScore> = {
    pipeline: (i) => pillarPipeline(i.overview),
    conversao: (i) => pillarConversao(i.performance),
    produtividade: (i) => pillarProdutividade(i.leadingIndicators),
    qualidadeCrm: (i) => pillarQualidadeCrm(i.crmQuality),
    followUp: (i) => pillarFollowUp(i.aging),
    confiabilidadeForecast: (i) => pillarConfiabilidadeForecast(i.forecastAccuracy),
};

/** Ordem de exibição fixa dos 6 pilares — sempre as mesmas 6 chaves, mesmo quando `score` é `null`. */
export const HEALTH_PILLAR_ORDER: HealthPillarKey[] = ['pipeline', 'conversao', 'produtividade', 'qualidadeCrm', 'followUp', 'confiabilidadeForecast'];

/**
 * Agrega os 6 pilares. `overallScore` é a média simples (não ponderada, de propósito — cada pilar
 * já tem sua própria fórmula ponderada internamente onde faz sentido; ponderar os pilares entre si
 * exigiria uma política de negócio que não existe hoje) dos pilares com `score` não-nulo.
 */
export function computeHealthScore(input: HealthScoreInput, now: Date): HealthScoreResult {
    const pillars = HEALTH_PILLAR_ORDER.map((key) => PILLAR_BUILDERS[key](input));
    const available = pillars.filter((p): p is HealthPillarScore & { score: number } => p.score != null);
    const overallScore = available.length > 0 ? roundMoney(available.reduce((sum, p) => sum + p.score, 0) / available.length) : null;

    return {
        period: input.overview.period,
        pillars,
        overallScore,
        generatedAt: now.toISOString(),
    };
}
