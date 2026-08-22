import { api } from '../../lib/api';
import { brazilMonthKey } from '../../shared/time/brazilCalendar';

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

export type CoverageProtectionStatus = 'saudavel' | 'atencao' | 'critico' | 'sem_dados';

export interface CoverageProtectionEntry {
    period: string;
    label: string;
    goalAmount: number | null;
    pipelineEligible: number;
    remainingGoal: number | null;
    coverage: number | null;
    coverageRecommended: number | null;
    status: CoverageProtectionStatus;
}

export interface PreviousPeriodComparison {
    period: string;
    closedAmount: number;
    closedCount: number;
    winRate: number | null;
}

export type ForecastConfidenceClassification = 'saudavel' | 'atencao' | 'critico';

export interface ForecastConfidence {
    score: number | null;
    classification: ForecastConfidenceClassification | null;
    sampleSize: number;
    fieldCompletenessScore: number | null;
    stageHistoryCoverage: number | null;
    sampleSizePenaltyApplied: boolean;
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
    coverageProtection: CoverageProtectionEntry[];
    previousPeriod: PreviousPeriodComparison | null;
    forecastConfidence: ForecastConfidence;
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
    elapsedBusinessDays: number;
    totalBusinessDays: number;
    paceExpectedAmount: number | null;
    pacePercent: number | null;
    paceGapAmount: number | null;
}

export type ExportFormat = 'csv' | 'json' | 'html';

export interface FunnelStageConversion {
    stageId: string;
    label: string;
    sortOrder: number;
    count: number;
    amount: number;
    conversionFromPrevious: number | null;
    averageDaysInStage: number | null;
    historicalReachedCount: number;
    historicalReachedAmount: number;
    historicalConversionFromPrevious: number | null;
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
    funnelHistoricalTrackingSince: string | null;
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

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'positive';
export interface ExecutiveAlert { id: string; severity: AlertSeverity; title: string; description: string; metricValue: number | null }

export interface CrmQualityField { field: string; label: string; filled: number; total: number; completeness: number | null }

export interface DataReadinessField {
    field: string; label: string; filled: number; total: number; completeness: number | null;
    weight: number; forecastImpact: 'alto' | 'medio' | 'baixo'; classification: 'saudavel' | 'atencao' | 'critico' | null;
}
export interface DataReadinessScore {
    overallScore: number | null; classification: 'saudavel' | 'atencao' | 'critico' | null; fields: DataReadinessField[];
}

export interface BitrixSyncFailure { leadId: string; title: string | null; companyName: string | null; error: string | null; lastAttemptAt: string | null }
export interface BitrixSyncHealth {
    connected: boolean; totalOpen: number; linked: number; notLinked: number; failed: number;
    linkedRate: number | null; failures: BitrixSyncFailure[];
    lastSyncAt: string | null; syncedCount30d: number; failedCount30d: number;
}

export interface CrmQualityIndex {
    period: string; overallScore: number | null; fields: CrmQualityField[]; dataReadiness: DataReadinessScore;
    suspectedDuplicateGroups: number; evaluatedCount: number;
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
    product?: string;
    source?: string;
    icp?: string;
    company?: string;
}

export interface FilterOptions { owners: string[]; products: string[]; sources: string[]; icps: string[]; companies: string[] }

export interface HistoricalTrendPoint {
    period: string; label: string; winRate: number | null; salesCycleMeanDays: number | null;
    averageTicketWon: number | null; pipelineCreatedAmount: number | null; closedSampleSize: number;
}
export interface HistoricalTrendsReport { points: HistoricalTrendPoint[] }

export interface ExecutiveSummaryResult { summary: string; generatedAt: string }
export interface BitrixNoteDraftResult { draft: string }

// ─── Previsor — Faixa de Cenário (derivada client-side de ExecutiveOverview já carregado) ────────

export interface ForecastScenario { label: string; amount: number; gapToGoal: number | null }
export interface ForecastRange { conservative: ForecastScenario; likely: ForecastScenario; optimistic: ForecastScenario; currency: string }
export type TrendDirection = 'melhorando' | 'estavel' | 'piorando';
export interface TrendMomentum { direction: TrendDirection; latestWinRate: number; previousAverageWinRate: number; deltaPercentagePoints: number }

// ─── Mentor Comercial (playbook de recomendações por IA) ─────────────────────

export type MentorRecommendationPriority = 'alta' | 'media' | 'baixa';
export interface MentorRecommendation {
    priority: MentorRecommendationPriority; title: string; rationale: string; suggestedAction: string; relatedDealIds: string[];
}
export interface MentorPlaybookResult { recommendations: MentorRecommendation[]; source: 'ai' | 'fallback'; generatedAt: string }

function qs(filter: CommercialFilter, extra?: Record<string, string | number | boolean | undefined>): string {
    const params = new URLSearchParams();
    params.set('month', filter.month);
    if (filter.owner) params.set('owner', filter.owner);
    if (filter.product) params.set('product', filter.product);
    if (filter.source) params.set('source', filter.source);
    if (filter.icp) params.set('icp', filter.icp);
    if (filter.company) params.set('company', filter.company);
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
    aging: (filter: CommercialFilter) => api.get<AgingReport>(`${BASE}/aging?${qs(filter)}`),
    losses: (filter: CommercialFilter) => api.get<LossAnalysis>(`${BASE}/losses?${qs(filter)}`),
    leadingIndicators: () => api.get<LeadingIndicatorsReport>(`${BASE}/leading-indicators`),
    alerts: (filter: CommercialFilter) => api.get<ExecutiveAlert[]>(`${BASE}/alerts?${qs(filter)}`),
    crmQuality: (filter: CommercialFilter) => api.get<CrmQualityIndex>(`${BASE}/crm-quality?${qs(filter)}`),
    deals: (filter: CommercialFilter, extra?: { tier?: ForecastTier; stageId?: string; agingCritical?: boolean; missingNextAction?: boolean; ids?: string; limit?: number; offset?: number; sort?: 'recent' | 'riskImpact' }) =>
        api.get<DealDrillDownResult>(`${BASE}/deals?${qs(filter, extra)}`),
    metricsDictionary: () => api.get<MetricDefinition[]>(`${BASE}/metrics-dictionary`),
    filterOptions: () => api.get<FilterOptions>(`${BASE}/filter-options`),
    trends: (filter: CommercialFilter) => api.get<HistoricalTrendsReport>(`${BASE}/trends?${qs(filter)}`),
    getGoal: (month: string) => api.get<CommercialGoalDTO | null>(`${BASE}/goals?month=${month}`),
    setGoal: (period: string, amount: number, currency = 'BRL') => api.put<CommercialGoalDTO>(`${BASE}/goals`, { period, amount, currency }),
    notifyBitrix: (leadId: string, comment: string) => api.post<{ entityType: 'lead' | 'deal'; bitrixRecordId: string }>(`/api/bitrix/leads/${leadId}/comment`, { comment }),
    aiExecutiveSummary: (filter: CommercialFilter) => api.post<ExecutiveSummaryResult>(`${BASE}/ai/executive-summary`, filter),
    aiBitrixNote: (leadId: string) => api.post<BitrixNoteDraftResult>(`${BASE}/ai/bitrix-note`, { leadId }),
    aiMentorPlaybook: (filter: CommercialFilter) => api.post<MentorPlaybookResult>(`${BASE}/ai/mentor-playbook`, filter),
};

/**
 * Exportação HTML/CSV/JSON do Relatório Executivo — a rota devolve o CONTEÚDO cru (não o envelope
 * `{success,data}` que `apiFetch`/`api.get` espera), então não passa por `commercialIntelligenceApi`
 * acima. Mesmo padrão já usado em `CrmBoard.tsx` (`handleExportCsv`, `/api/leads/export/csv`):
 * `fetch` bruto + `Blob` + link `<a download>` temporário.
 */
export async function downloadExecutiveExport(filter: CommercialFilter, format: ExportFormat): Promise<void> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${BASE}/export?${qs(filter, { format })}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || errorData?.message || 'Falha ao exportar o relatório executivo.');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] || `comercial-inteligente-${filter.month}.${format}`;
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
}

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

/** DATA-007: implementação única e pura, compartilhada por backend e frontend. */
export {
    buildForecastRange,
    computeTrendMomentum,
    TREND_MOMENTUM_THRESHOLD_PP,
} from './application/predictiveForecast';

export function currentMonth(): string {
    return brazilMonthKey(new Date());
}
