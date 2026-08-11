import { api } from '../../lib/api';

export type ForecastTier = 'Commit' | 'BestCase' | 'Pipeline' | 'Upside';

export interface CommercialGoalDTO {
    period: string;
    metric: 'NEW_MRR';
    amount: number;
    currency: string;
    updatedAt: string;
    createdBy: string | null;
}

export interface CoverageSnapshot {
    coverage: number | null;
    coverageRecommended: number | null;
    pipelineEligible: number;
    remainingGoal: number;
}

export interface ExecutiveOverview {
    period: string;
    goal: CommercialGoalDTO | null;
    closedAmount: number;
    closedCount: number;
    pctOfGoal: number | null;
    commitAmount: number;
    commitCount: number;
    bestCaseAmount: number;
    bestCaseCount: number;
    upsideAmount: number;
    upsideCount: number;
    forecastAmount: number;
    gapForecast: number | null;
    gapCommit: number | null;
    pipelineTotal: number;
    pipelineTotalCount: number;
    pipelineEligible: number;
    pipelineEligibleCount: number;
    coverageMonth: CoverageSnapshot;
    coverage30: CoverageSnapshot;
    coverage60: CoverageSnapshot;
    coverage90: CoverageSnapshot;
    isEmpty: boolean;
    dataAsOf: string;
}

export interface PipelineCreationBreakdown {
    label: string;
    count: number;
    amount: number;
}

export interface PipelineCreation {
    period: string;
    count: number;
    amount: number;
    averageTicket: number | null;
    bySource: PipelineCreationBreakdown[];
    byOwner: PipelineCreationBreakdown[];
    pipelineNeeded: number | null;
    creationCoverage: number | null;
}

export interface FunnelStageConversion {
    stageId: string;
    label: string;
    sortOrder: number;
    count: number;
    amount: number;
    conversionFromPrevious: number | null;
    averageDaysInStage: number | null;
}

export interface PerformanceMetrics {
    period: string;
    winRate: number | null;
    wonCount: number;
    lostCount: number;
    opportunities: {
        open: number; createdInPeriod: number; won: number; lost: number; advanced: number;
        stalled: number; eligible: number; commit: number; bestCase: number; atRisk: number;
    };
    averageTicket: { created: number | null; open: number | null; won: number | null; lost: number | null };
    salesCycle: { meanDays: number | null; medianDays: number | null; sampleSize: number };
    funnel: FunnelStageConversion[];
}

export interface AgingBucket { label: string; minDays: number; maxDays: number | null; count: number; amount: number }
export interface StageAging {
    stageId: string; stageName: string; count: number; amountOverThreshold: number;
    averageDaysInStage: number | null; dataQuality: 'measured' | 'estimated' | 'unknown';
}
export interface AgingReport { buckets: AgingBucket[]; byStage: StageAging[]; criticalThresholdDays: number; trackingSince: string | null }

export interface LossReasonBreakdown { reason: string; count: number; amount: number }
export interface LossAnalysis {
    period: string; totalCount: number; totalAmount: number; byReason: LossReasonBreakdown[];
    sampleObservations: Array<{ leadId: string; title: string | null; reason: string; observation: string | null }>;
}

export interface LeadingIndicatorPoint {
    label: string; current: number; previousWeek: number; movingAverage4w: number; trend: 'up' | 'down' | 'flat';
    weeklySeries: number[];
}
export interface LeadingIndicatorsReport {
    weekStart: string; weekEnd: string; indicators: LeadingIndicatorPoint[]; trackingSince: string | null;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';
export interface ExecutiveAlert { id: string; severity: AlertSeverity; title: string; description: string; metricValue: number | null }

export interface CrmQualityField { field: string; label: string; filled: number; total: number; completeness: number | null }

export interface BitrixSyncFailure { leadId: string; title: string | null; companyName: string | null; error: string | null; lastAttemptAt: string | null }
export interface BitrixSyncHealth {
    connected: boolean; totalOpen: number; linked: number; notLinked: number; failed: number;
    linkedRate: number | null; failures: BitrixSyncFailure[];
}

export interface CrmQualityIndex {
    period: string; overallScore: number | null; fields: CrmQualityField[]; suspectedDuplicateGroups: number; evaluatedCount: number;
    bitrixSync: BitrixSyncHealth;
}

export interface DealDrillDownRow {
    id: string; title: string | null; companyName: string | null; amount: number; owner: string | null;
    stageName: string | null; probability: number | null; weightedProbability: number | null; tier: ForecastTier | null;
    agingDays: number; lastInteraction: string | null; nextAction: string | null; riskFactors: string[];
    expectedCloseAt: string | null; source: string | null; bitrixLinked: boolean;
}
export interface DealDrillDownResult { total: number; rows: DealDrillDownRow[] }

export interface MetricDefinition {
    key: string; name: string; description: string; formula: string; source: string;
    period: string; inclusionRules: string; exclusionRules: string;
}

export interface CommercialFilter {
    month: string;
    owner?: string;
}

export interface ExecutiveSummaryResult { summary: string; generatedAt: string }
export interface BitrixNoteDraftResult { draft: string }

function qs(filter: CommercialFilter, extra?: Record<string, string | number | boolean | undefined>): string {
    const params = new URLSearchParams();
    params.set('month', filter.month);
    if (filter.owner) params.set('owner', filter.owner);
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            if (value !== undefined && value !== '') params.set(key, String(value));
        }
    }
    return params.toString();
}

const BASE = '/api/commercial-intelligence';

export const commercialIntelligenceApi = {
    overview: (filter: CommercialFilter) => api.get<ExecutiveOverview>(`${BASE}/overview?${qs(filter)}`),
    pipelineCreation: (filter: CommercialFilter) => api.get<PipelineCreation>(`${BASE}/pipeline-creation?${qs(filter)}`),
    performance: (filter: CommercialFilter) => api.get<PerformanceMetrics>(`${BASE}/performance?${qs(filter)}`),
    aging: () => api.get<AgingReport>(`${BASE}/aging`),
    losses: (filter: CommercialFilter) => api.get<LossAnalysis>(`${BASE}/losses?${qs(filter)}`),
    leadingIndicators: () => api.get<LeadingIndicatorsReport>(`${BASE}/leading-indicators`),
    alerts: (filter: CommercialFilter) => api.get<ExecutiveAlert[]>(`${BASE}/alerts?${qs(filter)}`),
    crmQuality: (filter: CommercialFilter) => api.get<CrmQualityIndex>(`${BASE}/crm-quality?${qs(filter)}`),
    deals: (filter: CommercialFilter, extra?: { tier?: ForecastTier; stageId?: string; agingCritical?: boolean; missingNextAction?: boolean; limit?: number; offset?: number }) =>
        api.get<DealDrillDownResult>(`${BASE}/deals?${qs(filter, extra)}`),
    metricsDictionary: () => api.get<MetricDefinition[]>(`${BASE}/metrics-dictionary`),
    getGoal: (month: string) => api.get<CommercialGoalDTO | null>(`${BASE}/goals?month=${month}`),
    setGoal: (period: string, amount: number, currency = 'BRL') => api.put<CommercialGoalDTO>(`${BASE}/goals`, { period, amount, currency }),
    // Ação de escrita no Bitrix24 — vive na rota do módulo de integração (não duplica a lógica de
    // sincronização aqui), mas fica exposta neste client porque quem a dispara é a UI do Comercial
    // Inteligente (drill-down de negócio em risco).
    notifyBitrix: (leadId: string, comment: string) => api.post<{ entityType: 'lead' | 'deal'; bitrixRecordId: string }>(`/api/bitrix/leads/${leadId}/comment`, { comment }),
    // Chamadas de IA (custo/latência reais) — POST de propósito, nunca disparadas automaticamente
    // ao carregar a tela, sempre por ação explícita da pessoa.
    aiExecutiveSummary: (filter: CommercialFilter) => api.post<ExecutiveSummaryResult>(`${BASE}/ai/executive-summary`, filter),
    aiBitrixNote: (leadId: string) => api.post<BitrixNoteDraftResult>(`${BASE}/ai/bitrix-note`, { leadId }),
};

export function formatCurrency(value: number | null | undefined, currency = 'BRL'): string {
    if (value == null) return 'Não disponível';
    return value.toLocaleString('pt-BR', { style: 'currency', currency });
}

export function formatPercent(value: number | null | undefined): string {
    if (value == null) return 'Não disponível';
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function formatMultiple(value: number | null | undefined): string {
    if (value == null) return 'Não disponível';
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
}

export function currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
