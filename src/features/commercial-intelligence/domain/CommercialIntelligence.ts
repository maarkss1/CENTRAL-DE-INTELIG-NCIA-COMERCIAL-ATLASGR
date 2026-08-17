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
    product?: string;
    source?: string;
    icp?: string;
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

export type CoverageProtectionStatus = 'saudavel' | 'atencao' | 'critico' | 'sem_dados';

/**
 * Uma linha da tabela "Proteção 90 dias" (seção 11 do prompt de produto) — mês atual + M+1 + M+2 +
 * M+3, sempre em MESES DE CALENDÁRIO reais (distinto das janelas móveis de 30/60/90 dias corridos
 * de `coverage30/60/90`, que continuam existindo separadamente).
 */
export interface CoverageProtectionEntry {
    period: PeriodMonth;
    /** Rótulo curto pt-BR, ex.: "AGO/2026". */
    label: string;
    /** `null` quando não há meta cadastrada para este mês futuro específico. */
    goalAmount: number | null;
    pipelineEligible: number;
    /** Meta restante do mês (meta − já fechado, só se aplica ao mês corrente; meses futuros usam a meta cheia). Nunca negativa. */
    remainingGoal: number | null;
    coverage: number | null;
    coverageRecommended: number | null;
    /**
     * `'sem_dados'` sem meta ou sem coverage calculável. Quando há Win Rate histórico, os limiares
     * saudável/atenção/crítico derivam de `coverageRecommended` (1 / Win Rate). Sem Win Rate
     * calculável ainda, cai no limiar-padrão documentado (3x saudável / 1,5x atenção) — política
     * inicial, não medição — ver `CommercialIntelligenceUseCases.classifyCoverageProtection`.
     */
    status: CoverageProtectionStatus;
}

/** Comparação com o mês anterior (seção 7/23) — só populada quando o período anterior tem negócios fechados avaliáveis. */
export interface PreviousPeriodComparison {
    period: PeriodMonth;
    closedAmount: number;
    closedCount: number;
    winRate: number | null;
}

export type ForecastConfidenceClassification = 'saudavel' | 'atencao' | 'critico';

/**
 * Forecast Confidence (seção 22) — NÃO é uma probabilidade inventada. Deriva de fatores
 * mensuráveis (completude dos campos que o forecast engine usa como sinal, cobertura de histórico
 * de etapa, tamanho da amostra de negócios abertos). Fórmula documentada em
 * `application/dataReadiness.ts` e `metricsDictionary.ts`. `score: null` quando não há negócio
 * aberto para avaliar — nunca um número fabricado.
 */
export interface ForecastConfidence {
    score: number | null;
    classification: ForecastConfidenceClassification | null;
    sampleSize: number;
    fieldCompletenessScore: number | null;
    stageHistoryCoverage: number | null;
    /** `true` quando o tamanho da amostra (negócios abertos) é pequeno o bastante para reduzir a confiança proporcionalmente (ver fórmula). */
    sampleSizePenaltyApplied: boolean;
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
    /** "Proteção 90 dias" (seção 11) — sempre 4 entradas: mês do filtro, M+1, M+2, M+3, em meses de calendário. */
    coverageProtection: CoverageProtectionEntry[];
    /** `null` sem base histórica suficiente (mês anterior sem nenhum negócio avaliável). */
    previousPeriod: PreviousPeriodComparison | null;
    forecastConfidence: ForecastConfidence;
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
    // ─── Pipeline Creation Pace (seção 21) ──────────────────────────────────
    /** Dias úteis já decorridos no período até `now` (ou o total, se o período já terminou). */
    elapsedBusinessDays: number;
    totalBusinessDays: number;
    /** Quanto de `pipelineNeeded` já deveria ter sido criado até hoje, proporcional a dias úteis. `null` sem `pipelineNeeded`. */
    paceExpectedAmount: number | null;
    /** `amount` / `paceExpectedAmount` × 100. `null` sem `paceExpectedAmount` calculável. */
    pacePercent: number | null;
    /** `paceExpectedAmount` − `amount`. Positivo = atrás do ritmo; negativo = à frente. `null` sem `paceExpectedAmount`. */
    paceGapAmount: number | null;
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
    /** Snapshot atual (quantos negócios estão nesta etapa ou além, agora mesmo). Preservado por compatibilidade — ver `historicalReachedCount` para a versão baseada em movimentação real (seção 12). */
    count: number;
    amount: number;
    /** % em relação à etapa anterior do funil, baseado no SNAPSHOT atual. `null` na primeira etapa. */
    conversionFromPrevious: number | null;
    averageDaysInStage: number | null;
    /**
     * Quantos negócios (abertos, ganhos OU perdidos) REALMENTE chegaram a esta etapa ou além em
     * algum momento, segundo `LeadStageHistory` — não o snapshot de onde estão agora (seção 12:
     * "evitar inferir conversão apenas pelo snapshot atual do funil quando houver histórico
     * disponível"). Um negócio perdido na etapa 1 conta para a etapa 0 mas não para a etapa 1+;
     * um negócio ganho conta para todas as etapas que sua história registra ter passado.
     */
    historicalReachedCount: number;
    historicalReachedAmount: number;
    /** % em relação à etapa anterior, calculado sobre `historicalReachedCount`. `null` na primeira etapa. */
    historicalConversionFromPrevious: number | null;
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
    /**
     * Data do registro mais antigo de `LeadStageHistory` da organização, ou `null` se não há
     * nenhum histórico ainda — quando `null`, `historicalReachedCount`/`historicalConversionFromPrevious`
     * do funil são pouco confiáveis (poucos ou nenhum negócio tem movimentação registrada) e a UI
     * deve avisar disso, mesmo natureza de `AgingReport.trackingSince`.
     */
    funnelHistoricalTrackingSince: string | null;
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
    /** As 4 semanas usadas para calcular `movingAverage4w`, mais antiga → mais recente — habilita o sparkline na UI em vez de só a média. */
    weeklySeries: number[];
}

export interface LeadingIndicatorsReport {
    weekStart: string;
    weekEnd: string;
    indicators: LeadingIndicatorPoint[];
    trackingSince: string | null;
}

// ─── Alertas executivos (Fase 6) ────────────────────────────────────────────

/** `'positive'` (seção 19) é um alerta favorável derivado de métrica real (ex.: Forecast acima da meta) — nunca um texto de incentivo genérico. */
export type AlertSeverity = 'critical' | 'warning' | 'info' | 'positive';

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

/**
 * Saúde da sincronização com o Bitrix24 (seção Qualidade do CRM) — mede quantos negócios abertos
 * do funil "Negócio" têm um vínculo real com o Bitrix (`Lead.bitrixLeadId`/`bitrixDealId`) e se a
 * última tentativa de sincronização teve sucesso. Não é sobre completude de campos comerciais (ver
 * `CrmQualityField` acima), é sobre a integração em si — um negócio pode estar 100% preenchido e
 * ainda assim nunca ter chegado ao Bitrix, ou ter chegado e falhado na última atualização.
 */
export interface BitrixSyncFailure {
    leadId: string;
    title: string | null;
    companyName: string | null;
    error: string | null;
    lastAttemptAt: string | null;
}

export interface BitrixSyncHealth {
    /** `true` quando a organização não tem nenhuma conexão Bitrix24 ativa — UI mostra CTA para conectar em vez de métricas zeradas. */
    connected: boolean;
    totalOpen: number;
    linked: number;
    notLinked: number;
    failed: number;
    /** `null` quando `totalOpen` é 0. Esta é a "cobertura da sincronização" da seção 28. */
    linkedRate: number | null;
    failures: BitrixSyncFailure[];
    /** Checkpoint da última importação bem-sucedida (`BitrixConnection.lastImportedAt`, a mais recente entre as conexões da organização). `null` sem nenhuma importação registrada ainda. */
    lastSyncAt: string | null;
    /** Registros sincronizados (status 'success' em `BitrixSyncLog`) nos últimos 30 dias — janela fixa documentada, não o período do filtro (atividade de sincronização é operacional, não comercial). */
    syncedCount30d: number;
    /** Registros com falha (status 'failed' em `BitrixSyncLog`) nos últimos 30 dias. */
    failedCount30d: number;
}

/** Campo da "Confiabilidade dos Dados" (seção 5) — mesma completude de `CrmQualityField`, mas com peso e classificação por impacto no Forecast. */
export interface DataReadinessField {
    field: string;
    label: string;
    filled: number;
    total: number;
    completeness: number | null;
    weight: number;
    forecastImpact: 'alto' | 'medio' | 'baixo';
    classification: 'saudavel' | 'atencao' | 'critico' | null;
}

/**
 * "Confiabilidade dos Dados" (seção 5) — score PONDERADO por impacto no forecast, distinto do
 * `overallScore` simples de `CrmQualityIndex` (média não-ponderada de completude bruta). Fórmula
 * documentada em `application/dataReadiness.ts` e `metricsDictionary.ts`.
 */
export interface DataReadinessScore {
    /** Média ponderada de completude por campo, em %. `null` sem nenhum campo avaliável. */
    overallScore: number | null;
    classification: 'saudavel' | 'atencao' | 'critico' | null;
    fields: DataReadinessField[];
}

export interface CrmQualityIndex {
    period: PeriodMonth;
    /** Média das completudes por campo, em %. `null` sem negócios abertos no funil. */
    overallScore: number | null;
    fields: CrmQualityField[];
    dataReadiness: DataReadinessScore;
    suspectedDuplicateGroups: number;
    evaluatedCount: number;
    bitrixSync: BitrixSyncHealth;
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
    /** `true` quando o negócio tem `bitrixLeadId`/`bitrixDealId` — habilita a ação "Notificar no Bitrix" no drill-down. */
    bitrixLinked: boolean;
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
    /** Restringe aos IDs informados (`Lead.id`) — usado por CTAs que já sabem exatamente qual negócio abrir (Centro de Decisão, recomendações do Mentor), em vez de reaproveitar um filtro amplo que poderia não incluir o negócio certo. */
    ids?: string[];
    limit?: number;
    offset?: number;
    /**
     * `'riskImpact'` ordena por valor em risco (`amount * (1 - probabilidade ponderada/100)`)
     * decrescente — base do Centro de Decisão. `undefined`/`'recent'` preserva a ordenação padrão
     * já existente (nunca muda o comportamento de quem já chama este endpoint sem o parâmetro).
     */
    sort?: 'recent' | 'riskImpact';
}

// ─── Projeção Estatística por Cenário / Previsor (seção nova) ───────────────

/**
 * Um cenário da faixa de previsão — nunca um número novo calculado aqui, sempre uma soma de campos
 * que já existem em `ExecutiveOverview` (ver `application/predictiveForecast.ts`). `gapToGoal` segue
 * a mesma regra de "nunca negativo fabricado" de `ExecutiveOverview.gapForecast`/`gapCommit`.
 */
export interface ForecastScenario {
    label: string;
    amount: number;
    /** Meta − cenário, nunca negativo. `null` sem meta cadastrada. */
    gapToGoal: number | null;
}

export interface ForecastRange {
    conservative: ForecastScenario;
    likely: ForecastScenario;
    optimistic: ForecastScenario;
    currency: string;
}

export type TrendDirection = 'melhorando' | 'estavel' | 'piorando';

/**
 * Momentum do Win Rate ao longo dos últimos meses com amostra suficiente (`HistoricalTrendsReport`)
 * — não uma previsão de ML, apenas comparação explícita do último ponto contra a média dos
 * anteriores, com limiar documentado em `predictiveForecast.ts`.
 */
export interface TrendMomentum {
    direction: TrendDirection;
    latestWinRate: number;
    previousAverageWinRate: number;
    deltaPercentagePoints: number;
}

// ─── Mentor Comercial por IA (playbook de recomendações) ────────────────────

export type MentorRecommendationPriority = 'alta' | 'media' | 'baixa';

export interface MentorRecommendation {
    priority: MentorRecommendationPriority;
    title: string;
    rationale: string;
    suggestedAction: string;
    /** IDs de `Lead` relacionados (quando aplicável) — habilita drill-down direto na UI. */
    relatedDealIds: string[];
}

export interface MentorPlaybookResult {
    recommendations: MentorRecommendation[];
    /** `'ai'` quando gerado pelo modelo; `'fallback'` quando a IA falhou/retornou algo não
     * parseável e as recomendações foram derivadas deterministicamente de `alerts`/negócios em
     * risco — a UI precisa rotular a origem, nunca apresentar fallback como se fosse IA. */
    source: 'ai' | 'fallback';
    generatedAt: string;
}

// ─── Exportações (HTML/CSV/JSON/Relatório Executivo) ────────────────────────
//
// "Proteção de Receita M/M+1/M+2/M+3" foi avaliada nesta integração e descartada como tipo próprio
// — já existe em `ExecutiveOverview.coverageProtection` (`CoverageProtectionEntry`, "Proteção 90
// dias"), mesmo conceito (coverage por mês-calendário M..M+3 derivado de `coverageRecommended`).
// Decisão do dono do repositório: manter só a versão já em produção, não duplicar com um segundo
// threshold de "atenção" (a versão descartada usava 70% do recomendado; a mantida usa 60%).

export type ExportFormat = 'csv' | 'json' | 'html';

/** Uma linha do export tabular (CSV/HTML) — um indicador por linha: bloco, indicador, valor, unidade. */
export interface ExportKpiRow {
    block: string;
    indicator: string;
    value: string;
    unit: string;
}

// ─── Opções de filtro reais (seção 18) ───────────────────────────────────────

/**
 * Valores REAIS já usados pelos negócios do funil "Negócio" da organização — alimenta os
 * seletores de vendedor/produto/origem/ICP em vez de campos de texto livre. Nunca inclui um valor
 * que não exista em pelo menos um negócio real.
 */
export interface FilterOptions {
    owners: string[];
    products: string[];
    sources: string[];
    icps: string[];
}

// ─── Tendências históricas (seção 23) ────────────────────────────────────────

export interface HistoricalTrendPoint {
    period: PeriodMonth;
    label: string;
    winRate: number | null;
    salesCycleMeanDays: number | null;
    averageTicketWon: number | null;
    pipelineCreatedAmount: number | null;
    /** Quantidade de negócios fechados no mês — usada para decidir se `winRate`/`salesCycleMeanDays` têm amostra suficiente para serem exibidos com confiança. */
    closedSampleSize: number;
}

/**
 * Últimos 6 meses (mês do filtro + 5 anteriores) de Win Rate, Sales Cycle, Ticket Médio (ganho) e
 * Pipeline Criado — seção 23. Cada ponto é `null` nos campos sem amostra suficiente daquele mês,
 * nunca um valor interpolado ou fabricado.
 */
export interface HistoricalTrendsReport {
    points: HistoricalTrendPoint[];
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
    bitrixLeadId: string | null;
    bitrixDealId: string | null;
    /** 'pending' | 'syncing' | 'synced' | 'failed' | null (nunca tentado) — ver comentário em Lead.bitrixSyncStatus no schema. */
    bitrixSyncStatus: string | null;
    bitrixSyncError: string | null;
    bitrixSyncedAt: Date | null;
    pipelineId: string | null;
    pipelineStageId: string | null;
    stageName: string | null;
    stageSortOrder: number | null;
    stageProbability: number | null;
    stageIsWon: boolean;
    stageIsLost: boolean;
    productSkus: string[];
    icp: string | null;
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
    /** `true` quando a organização tem ao menos uma conexão Bitrix24 ativa — usado por `bitrixSync` para distinguir "0 vinculado porque não tem Bitrix" de "0 vinculado apesar de ter Bitrix". */
    hasBitrixConnection(organizationId: string): Promise<boolean>;
    /** Checkpoint de sincronização + contagem de sucesso/falha em `BitrixSyncLog` desde `since` — seção 28. */
    getBitrixSyncActivity(organizationId: string, since: Date): Promise<{ lastSyncAt: Date | null; syncedCount: number; failedCount: number }>;
    /** Valores reais distintos de vendedor/produto/origem/ICP entre os negócios do funil "Negócio" — seção 18. */
    getFilterOptions(organizationId: string): Promise<FilterOptions>;

    getGoal(organizationId: string, period: PeriodMonth, metric: GoalMetric): Promise<CommercialGoalDTO | null>;
    upsertGoal(organizationId: string, period: PeriodMonth, metric: GoalMetric, amount: number, currency: string, createdBy: string): Promise<CommercialGoalDTO>;
}
