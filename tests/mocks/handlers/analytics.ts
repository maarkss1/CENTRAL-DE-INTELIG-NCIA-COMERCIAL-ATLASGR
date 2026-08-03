import { http } from 'msw';
import { ok } from './http';
import type { AnalyticsDashboard } from '@/features/analytics/analytics.api';

/** Dashboard vazio — cada teste que precisa de dados sobrescreve via `server.use(...)`. */
export const emptyDashboard: AnalyticsDashboard = {
    overview: {
        totalCompanies: 0, totalContacts: 0, totalLeads: 0, totalActivities: 0,
        pendingActivities: 0, overdueActivities: 0, closedThisMonth: 0, lostThisMonth: 0,
        conversionRate: 0, averageScore: null, pipelineValue: null,
    },
    funnel: [],
    byTemperature: [],
    bySource: [],
    byOwner: [],
    activitiesByType: [],
    activitiesByStatus: [],
    monthly: [],
    isEmpty: true,
};

export const analyticsHandlers = [
    http.get('/api/analytics/dashboard', () => ok(emptyDashboard)),
];
