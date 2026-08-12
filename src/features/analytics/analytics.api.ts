import { api } from '../../lib/api';

export interface DistributionSlice {
    label: string;
    count: number;
}

export interface FunnelStage extends DistributionSlice {
    conversionFromPrevious: number | null;
}

export interface MonthlyPoint {
    month: string;
    created: number;
    won: number;
    lost: number;
}

export interface OverviewMetrics {
    totalCompanies: number;
    totalContacts: number;
    totalLeads: number;
    totalActivities: number;
    pendingActivities: number;
    overdueActivities: number;
    closedThisMonth: number;
    lostThisMonth: number;
    conversionRate: number;
    averageScore: number | null;
    pipelineValue: number | null;
}

export interface AnalyticsDashboard {
    overview: OverviewMetrics;
    funnel: FunnelStage[];
    byTemperature: DistributionSlice[];
    bySource: DistributionSlice[];
    byOwner: Array<DistributionSlice & { won: number }>;
    activitiesByType: DistributionSlice[];
    activitiesByStatus: DistributionSlice[];
    monthly: MonthlyPoint[];
    tmqMetric: number | null; // Tempo médio de qualificação em dias
    lostReasons: DistributionSlice[];
    callHeatmap: { dayOfWeek: number, hour: number, count: number }[];
    performanceReport: {
        agent: string;
        isAi: boolean;
        leadsAssigned: number;
        leadsQualified: number;
        conversionRate: number;
    }[];
    isEmpty: boolean;
}

/** Períodos oferecidos no filtro. O backend limita a 3–24 meses. */
export const PERIOD_OPTIONS = [3, 6, 12, 24] as const;

export const analyticsApi = {
    dashboard: (months: number) =>
        api.get<AnalyticsDashboard>(`/api/analytics/dashboard?months=${months}`, {
            timeoutMs: 30_000,
        }),
};

/** Converte "2026-07" no rótulo curto usado nos eixos ("jul/26"). */
export function formatMonthLabel(month: string): string {
    const [year, m] = month.split('-').map(Number);
    if (!year || !m) return month;
    const date = new Date(year, m - 1, 1);
    return date
        .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', '');
}
