/**
 * Tipos de domínio do módulo "Comercial Inteligente" (Revenue Command Center executivo).
 *
 * Este módulo NÃO substitui o CRM (`src/features/crm`, `crm360`) nem o Bitrix24 — ele é uma
 * camada de consolidação/cálculo/previsão sobre os mesmos dados (`Lead` com `funnel: 'Negocio'`,
 * `CrmPipeline`/`CrmPipelineStage`, `Activity`, `CommercialGoal`, `LeadStageHistory`). Todo número
 * aqui precisa ser reproduzível a partir de dado real — ver `metricsDictionary.ts` para a fórmula
 * e as regras de inclusão/exclusão de cada indicador (seção 39 do prompt de produto).
 */

/** Formato "YYYY-MM" usado em toda a granularidade mensal do módulo (metas, período do cockpit). */
export type PeriodMonth = string;

export interface CommercialIntelligenceFilter {
    /** Mês de referência ("YYYY-MM"). Todo cálculo "do mês" usa este período. */
    month: PeriodMonth;
    /** Filtra por responsável (Lead.owner) quando informado — mesma semântica usada no Kanban. */
    owner?: string;
}

// ─── Metas ──────────────────────────────────────────────────────────────────

export type GoalMetric = 'NEW_MRR';

export interface CommercialGoalDTO {
    period: PeriodMonth;
    metric: GoalMetric;
    amount: number;
    currency: string;
    updatedAt: string;
    createdBy: string | null;
}

// ─── Cockpit executivo (Fase 2 + Fase 3) ───────────────────────────────────

export interface CoverageSnapshot {
    /** Múltiplo de cobertura (pipeline elegível / meta restante da janela). `null` quando não計算ável (meta zerada/ausente). */
    coverage: number | null;
    /** Cobertura mínima recomendada para a janela, derivada do Win Rate histórico real (1 / winRate) — `null` se ainda não há Win Rate calculável. */
    coverageRecommended: number | null;
    pipelineEligible: number;
    /** Meta restante da janela (meta proporcional menos o já fechado no período). Nunca negativa — meta batida vira 0. */
    remainingGoal: number;
}

export interface ExecutiveOverview {
    period: PeriodMonth;
    goal: CommercialGoalDTO | null;
    closedAmount: number;
    closedCount: number;
    /** `null` quando não há meta cadastrada — nunca 0 fabricado. */
    pctOfGoal: number | null;
    commitAmount: number;
    commitCount: number;
    bestCaseAmount: number;
    bestCaseCount: number;
    upsideAmount: number;
    upsideCount: number;
    /** Fechado + Commit + Best Case + Pipeline (ponderado pela probabilidade explicável). */
    forecastAmount: number;
    /** `null` sem meta cadastrada. */
    gapForecast: number | null;
    /** `null` sem meta cadastrada. Meta − (Fechado + Commit). */
    gapCommit: number | null;
    pipelineTotal: number;
    pipelineTotalCount: number;
    pipelineEligible: number;
    pipelineEligibleCount: number;
    coverageMonth: CoverageSnapshot;
    coverage30: CoverageSnapshot;
    coverage60: CoverageSnapshot;
    coverage90: CoverageSnapshot;
    /** `true` quando a organização não tem nenhum negócio no funil "Negócio" — a UI mostra o estado vazio em vez de zeros. */
    isEmpty: boolean;
    dataAsOf: string;
}

// ─── Pipeline criado (Fase 3) ───────────────────────────────────────────────

export interface PipelineCreationBreakdown {
    label: string;
    count: number;
    amount: number;
}

export interface PipelineCreation {
    period: PeriodMonth;
    count: number;
    amount: number;
    averageTicket: number | null;
    bySource: PipelineCreationBreakdown[];
    byOwner: PipelineCreationBreakdown[];
    /** Pipeline necessário (meta futura / win rate esperado) e cobertura de criação — seção 15. */
    pipelineNeeded: number | null;
    creationCoverage: number | null;
}

// ─── Eficiência (Fase 4) ─────────────────────────────────────────────────────

export interface OpportunityCounts {
    open: number;
    createdInPeriod: number;
    won: number;
    lost: number;
    advanced: number;
    stalled: number;
    eligible: number;
    commit: number;
    bestCase: number;
    atRisk: number;
}

export interface AverageTicket {
    created: number | null;
    open: number | null;
    won: number | null;
    lost: number | null;
}

export interface SalesCycleStats {
    /** Em dias. `null` quando não há negócios fechados suficientes no período (nunca 0 fabricado). */
    meanDays: number | null;
    medianDays: number | null;
    sampleSize: number;
}

export interface FunnelStageConversion {
    stageId: string;
    label: string;
    sortOrder: number;
    count: number;
    amount: number;
    /** % em relação à etapa anterior do funil. `null` na primeira etapa. */
    conversionFromPrevious: number | null;
    averageDaysInStage: number | null;
}

export interface PerformanceMetrics {
    period: PeriodMonth;
    /** Ganhos / (Ganhos + Perdidos) no período, em %. `null` sem negócios fechados. */
    winRate: number | null;
    wonCount: number;
    lostCount: number;
    opportunities: OpportunityCounts;
    averageTicket: AverageTicket;
    salesCycle: SalesCycleStats;
    funnel: FunnelStageConversion[];
}

// ─── Aging (Fase 5) ──────────────────────────────────────────────────────────

export interface AgingBucket {
    label: string;
    minDays: number;
    maxDays: number | null;
    count: number;
    amount: number;
}

export interface StageAging {
    stageId: string;
    stageName: string;
    count: number;
    amountOverThreshold: number;
    averageDaysInStage: number | null;
    /** `'measured'` quando vem de LeadStageHistory real; `'estimated'` quando cai para o fallback (`updatedAt`) por falta de histórico; `'unknown'` quando nem isso existe. */
    dataQuality: 'measured' | 'estimated' | 'unknown';
}

export interface AgingReport {
    buckets: AgingBucket[];
    byStage: StageAging[];
    criticalThresholdDays: number;
    trackingSince: string | null;
}

// ─── Perdas (Fase 7) ─────────────────────────────────────────────────────────

export interface LossReasonBreakdown {
    reason: string;
    count: number;
    amount: number;
}

export interface LossAnalysis {
    period: PeriodMonth;
    totalCount: number;
    totalAmount: number;
    byReason: LossReasonBreakdown[];
    sampleObservations: Array<{ leadId: string; title: string | null; reason: string; observation: string | null }>;
}

// ─── Leading Indicators (Fase 5/6) ──────────────────────────────────────────

export interface LeadingIndicatorPoint {
    label: string;
    current: number;
    previousWeek: number;
    movingAverage4w: number;
    trend: 'up' | 'down' | 'flat';
}

export interface LeadingIndicatorsReport {
    weekStart: string;
    weekEnd: string;
    indicators: LeadingIndicatorPoint[];
    trackingSince: string | null;
}

// ─── Alertas executivos (Fase 6) ────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface ExecutiveAlert {
    id: string;
    severity: AlertSeverity;
    title: string;
    description: string;
    metricValue: number | null;
}

// ─── Forecast ponderado explicável (Fase 6) ─────────────────────────────────

export type ForecastTier = 'Commit' | 'BestCase' | 'Pipeline' | 'Upside';

export interface ForecastExplain {
    leadId: string;
    title: string | null;
    companyName: string | null;
    owner: string | null;
    amount: number;
    stageProbability: number;
    weightedProbability: number;
    weightedValue: number;
    tier: ForecastTier;
    positiveFactors: string[];
    negativeFactors: string[];
    lastUpdatedAt: string;
}

// ─── Qualidade do CRM (Fase 7) ───────────────────────────────────────────────

export interface CrmQualityField {
    field: string;
    label: string;
    filled: number;
    total: number;
    /** % de preenchimento. `null` quando `total` é 0 (nada a avaliar, não é "ruim"). */
    completeness: number | null;
}

export interface CrmQualityIndex {
    period: PeriodMonth;
    /** Média das completudes por campo, em %. `null` sem negócios abertos no funil. */
    overallScore: number | null;
    fields: CrmQualityField[];
    suspectedDuplicateGroups: number;
    evaluatedCount: number;
}

// ─── Drill-down (seção 29) ───────────────────────────────────────────────────

export interface DealDrillDownRow {
    id: string;
    title: string | null;
    companyName: string | null;
    amount: number;
    owner: string | null;
    stageName: string | null;
    probability: number | null;
    weightedProbability: number | null;
    tier: ForecastTier | null;
    agingDays: number;
    lastInteraction: string | null;
    nextAction: string | null;
    riskFactors: string[];
    expectedCloseAt: string | null;
    source: string | null;
}

export interface DealDrillDownResult {
    total: number;
    rows: DealDrillDownRow[];
}

/** Filtros de drill-down aceitos por `GET /api/commercial-intelligence/deals`. */
export interface DealDrillDownQuery {
    month: PeriodMonth;
    owner?: string;
    tier?: ForecastTier;
    stageId?: string;
    agingCritical?: boolean;
    missingNextAction?: boolean;
    limit?: number;
    offset?: number;
}

// ─── Dicionário de métricas (seção 39) ──────────────────────────────────────

export interface MetricDefinition {
    key: string;
    name: string;
    description: string;
    formula: string;
    source: string;
    period: string;
    inclusionRules: string;
    exclusionRules: string;
}

// ─── Repositório ─────────────────────────────────────────────────────────────

/** Linha crua de negócio (funil "Negócio") usada pelos vários cálculos da camada de aplicação. */
export interface DealRow {
    id: string;
    title: string | null;
    amount: number;
    owner: string | null;
    source: string | null;
    companyId: string | null;
    companyName: string | null;
    companyCnpj: string | null;
    contactId: string | null;
    createdAt: Date;
    updatedAt: Date;
    closedAt: Date | null;
    expectedCloseAt: Date | null;
    lastInteraction: Date | null;
    nextAction: Date | null;
    lossReason: string | null;
    lossObservation: string | null;
    status: string;
    pipelineId: string | null;
    pipelineStageId: string | null;
    stageName: string | null;
    stageSortOrder: number | null;
    stageProbability: number | null;
    stageIsWon: boolean;
    stageIsLost: boolean;
}

export interface StageDefinition {
    id: string;
    name: string;
    code: string;
    sortOrder: number;
    probability: number;
    isWon: boolean;
    isLost: boolean;
}

export interface StageHistoryEntryInput {
    organizationId: string;
    leadId: string;
    pipelineId: string | null;
    stageId: string | null;
    stageName: string;
    probability: number | null;
    isWon: boolean;
    isLost: boolean;
}

export interface CommercialIntelligenceRepository {
    /** Todos os negócios (funil "Negócio", não excluídos) da organização — usado como base de quase todo cálculo do módulo. */
    findDeals(organizationId: string): Promise<DealRow[]>;
    findDealPipelineStages(organizationId: string): Promise<StageDefinition[]>;
    /** Reuniões concluídas (`Activity`) no intervalo — usado por Leading Indicators. */
    countCompletedMeetings(organizationId: string, from: Date, to: Date): Promise<number>;
    /** Contagem de eventos de timeline por tipo/intervalo — usado por "oportunidades qualificadas" (conversão Lead→Negócio). */
    countTimelineEventsByType(organizationId: string, type: string, from: Date, to: Date): Promise<number>;
    /** Histórico de etapa de um conjunto de leads (para aging por etapa e sales cycle). */
    findStageHistory(organizationId: string, leadIds?: string[]): Promise<
        Array<{ leadId: string; stageId: string | null; stageName: string; enteredAt: Date; exitedAt: Date | null }>
    >;
    /** Grupos de negócios abertos (funil Negócio) que compartilham a mesma empresa — heurística de duplicidade suspeita (seção 27), não determinística de identidade. */
    countDuplicateCompanyGroupsAmongOpenDeals(organizationId: string): Promise<number>;

    getGoal(organizationId: string, period: PeriodMonth, metric: GoalMetric): Promise<CommercialGoalDTO | null>;
    upsertGoal(organizationId: string, period: PeriodMonth, metric: GoalMetric, amount: number, currency: string, createdBy: string): Promise<CommercialGoalDTO>;
}
