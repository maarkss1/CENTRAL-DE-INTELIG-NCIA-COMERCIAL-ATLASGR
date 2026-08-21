import type { LeadStatus as PrismaLeadStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { connection } from '../../lib/queue/redis.js';
import {
    fromPrismaLeadStatus,
    fromPrismaActivityType,
    fromPrismaActivityStatus,
} from '../../lib/enumMap.js';
import type { OverviewMetrics } from '../../shared/contracts/analytics.contract.js';
import {
    brazilMonthKey,
    brazilMonthRange,
    shiftBrazilMonth,
} from '../../shared/time/brazilCalendar.js';

/** Ordem real do funil comercial — usada para o gráfico e para a conversão etapa a etapa. */
export const FUNNEL_STAGES = [
    'Lead_Recebido',
    'Cadencia_Iniciada',
    'Qualificacao_SDR',
    'Reuniao_Agendada',
    'Nova_Oportunidade',
    'Proposta_Enviada',
    'Call_Visita_Agendada',
] as const;

const WON: PrismaLeadStatus = 'Negocios_Ganhos';
const LOST: PrismaLeadStatus = 'Negocios_Perdidos';
const DESQUALIFICADO: PrismaLeadStatus = 'Lead_Desqualificado';
const PILOT_CANCELLED_STATUSES: PrismaLeadStatus[] = ['Piloto_Atlas_Profile_Cancelado', 'Piloto_Logistico_Cancelado'];
const CLOSED_LOST_STATUSES: PrismaLeadStatus[] = [LOST, DESQUALIFICADO, ...PILOT_CANCELLED_STATUSES];

export type { OverviewMetrics };

export interface DistributionSlice {
    label: string;
    count: number;
}

export interface FunnelStage extends DistributionSlice {
    /** Conversão desta etapa em relação à etapa anterior, em %. `null` na primeira etapa. */
    conversionFromPrevious: number | null;
}

export interface MonthlyPoint {
    /** Mês no formato YYYY-MM, para o frontend formatar como preferir. */
    month: string;
    created: number;
    won: number;
    lost: number;
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
    tmqMetric: number | null;
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

function startOfCurrentMonth(now: Date): Date {
    return brazilMonthRange(brazilMonthKey(now)).start;
}

/** Primeiro dia do mês, `monthsBack` meses atrás, sempre segundo Brasília. */
function startOfMonthsAgo(now: Date, monthsBack: number): Date {
    return brazilMonthRange(shiftBrazilMonth(brazilMonthKey(now), -monthsBack)).start;
}

function monthKey(date: Date): string {
    return brazilMonthKey(date);
}

/** Converte o resultado de um groupBy do Prisma numa distribuição ordenada por contagem. */
function toDistribution<T extends string>(
    rows: Array<{ _count: { _all: number } } & Record<string, unknown>>,
    field: string,
    translate: (raw: T) => string,
    fallbackLabel = 'Não informado',
): DistributionSlice[] {
    return rows
        .map((row) => {
            const raw = row[field];
            return {
                label: raw == null || raw === '' ? fallbackLabel : translate(raw as T),
                count: row._count._all,
            };
        })
        .sort((a, b) => b.count - a.count);
}

export class AnalyticsService {
    async overview(organizationId: string, now = new Date()): Promise<OverviewMetrics> {
        const monthStart = startOfCurrentMonth(now);
        const scope = { organizationId, deletedAt: null };

        const [
            totalCompanies,
            totalContacts,
            openLeads,
            totalLeadsEver,
            totalActivities,
            pendingActivities,
            overdueActivities,
            closedThisMonth,
            lostThisMonth,
            wonEver,
            scoreAggregate,
            pipelineAggregate,
            pipelineCount,
        ] = await Promise.all([
            prisma.company.count({ where: scope }),
            prisma.contact.count({ where: scope }),
            prisma.lead.count({ where: { ...scope, status: { notIn: [WON, ...CLOSED_LOST_STATUSES] } } }),
            prisma.lead.count({ where: scope }),
            prisma.activity.count({ where: scope }),
            prisma.activity.count({ where: { ...scope, status: 'Pendente' } }),
            prisma.activity.count({ where: { ...scope, status: 'Pendente', date: { lt: now } } }),
            prisma.lead.count({ where: { ...scope, status: WON, closedAt: { gte: monthStart } } }),
            prisma.lead.count({ where: { ...scope, status: { in: CLOSED_LOST_STATUSES }, closedAt: { gte: monthStart } } }),
            prisma.lead.count({ where: { ...scope, status: WON } }),
            prisma.lead.aggregate({
                where: { ...scope, status: { notIn: [WON, ...CLOSED_LOST_STATUSES] }, score: { not: null } },
                _avg: { score: true },
            }),
            prisma.lead.aggregate({
                where: { ...scope, status: { notIn: [WON, ...CLOSED_LOST_STATUSES] }, amount: { not: null } },
                _sum: { amount: true },
            }),
            prisma.lead.count({
                where: { ...scope, status: { notIn: [WON, ...CLOSED_LOST_STATUSES] }, amount: { not: null } },
            }),
        ]);

        return {
            totalCompanies,
            totalContacts,
            totalLeads: openLeads,
            totalActivities,
            pendingActivities,
            overdueActivities,
            closedThisMonth,
            lostThisMonth,
            conversionRate: totalLeadsEver > 0 ? (wonEver / totalLeadsEver) * 100 : 0,
            averageScore: scoreAggregate._avg.score ?? null,
            pipelineValue: pipelineCount > 0 ? (pipelineAggregate._sum.amount ?? 0) : null,
        };
    }

    async funnel(organizationId: string): Promise<FunnelStage[]> {
        const rows = await prisma.lead.groupBy({
            by: ['status'],
            where: { organizationId, deletedAt: null },
            _count: { _all: true },
        });

        const counts = new Map<string, number>();
        for (const row of rows) counts.set(row.status as string, row._count._all);

        const orderedStages = [...FUNNEL_STAGES];
        const cumulative = orderedStages.map((stage, index) => {
            const downstream = orderedStages
                .slice(index)
                .reduce((sum, s) => sum + (counts.get(s) ?? 0), 0);
            return downstream + (counts.get(WON) ?? 0);
        });

        return orderedStages.map((stage, index) => ({
            label: fromPrismaLeadStatus(stage),
            count: cumulative[index],
            conversionFromPrevious:
                index === 0 || cumulative[index - 1] === 0
                    ? null
                    : (cumulative[index] / cumulative[index - 1]) * 100,
        }));
    }

    async monthly(organizationId: string, months = 6, now = new Date()): Promise<MonthlyPoint[]> {
        const since = startOfMonthsAgo(now, months - 1);
        const scope = { organizationId, deletedAt: null };

        const [created, closed] = await Promise.all([
            prisma.lead.findMany({
                where: { ...scope, createdAt: { gte: since } },
                select: { createdAt: true },
            }),
            prisma.lead.findMany({
                where: { ...scope, status: { in: [WON, ...CLOSED_LOST_STATUSES] }, closedAt: { gte: since } },
                select: { closedAt: true, status: true },
            }),
        ]);

        const buckets = new Map<string, MonthlyPoint>();
        for (let i = months - 1; i >= 0; i--) {
            const key = monthKey(startOfMonthsAgo(now, i));
            buckets.set(key, { month: key, created: 0, won: 0, lost: 0 });
        }

        for (const lead of created) {
            const bucket = buckets.get(monthKey(lead.createdAt));
            if (bucket) bucket.created++;
        }
        for (const lead of closed) {
            const bucket = buckets.get(monthKey(lead.closedAt as Date));
            if (!bucket) continue;
            if (lead.status === WON) bucket.won++;
            else bucket.lost++;
        }

        return [...buckets.values()];
    }

    async dashboard(organizationId: string, months = 6, now = new Date()): Promise<AnalyticsDashboard> {
        const cacheKey = `analytics:dash:${organizationId}:${months}`;
        if (connection) {
            try {
                const cached = await connection.get(cacheKey);
                if (cached) return JSON.parse(cached);
            } catch (err) {
                // Falha de cache não impede leitura do banco.
            }
        }

        const scope = { organizationId, deletedAt: null };

        const [
            overview,
            funnel,
            monthly,
            temperatureRows,
            sourceRows,
            ownerRows,
            wonByOwnerRows,
            activityTypeRows,
            activityStatusRows,
            performanceReport,
            heatmap,
            tmqMetric,
            lostReasonsRows,
        ] = await Promise.all([
            this.overview(organizationId, now),
            this.funnel(organizationId),
            this.monthly(organizationId, months, now),
            prisma.lead.groupBy({ by: ['temperature'], where: scope, _count: { _all: true } }),
            prisma.lead.groupBy({ by: ['source'], where: scope, _count: { _all: true } }),
            prisma.lead.groupBy({ by: ['owner'], where: scope, _count: { _all: true } }),
            prisma.lead.groupBy({
                by: ['owner'],
                where: { ...scope, status: WON },
                _count: { _all: true },
            }),
            prisma.activity.groupBy({ by: ['type'], where: scope, _count: { _all: true } }),
            prisma.activity.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
            this.performanceReport(organizationId, scope),
            this.callHeatmap(organizationId, scope),
            this.tmqMetric(organizationId, scope),
            prisma.lead.groupBy({ by: ['lossReason'], where: { ...scope, status: { in: CLOSED_LOST_STATUSES } }, _count: { _all: true } }),
        ]);

        const wonByOwner = new Map<string, number>();
        for (const row of wonByOwnerRows) {
            wonByOwner.set((row.owner as string) ?? '', row._count._all);
        }

        const byOwner = ownerRows
            .map((row) => {
                const owner = (row.owner as string) || '';
                return {
                    label: owner || 'Sem responsável',
                    count: row._count._all,
                    won: wonByOwner.get(owner) ?? 0,
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const isEmpty =
            overview.totalCompanies === 0 &&
            overview.totalContacts === 0 &&
            overview.totalActivities === 0 &&
            funnel.every((stage) => stage.count === 0);

        const result = {
            overview,
            funnel,
            monthly,
            byTemperature: toDistribution(temperatureRows, 'temperature', (v: string) => v, 'Sem temperatura'),
            bySource: toDistribution(sourceRows, 'source', (v: string) => v, 'Origem não informada'),
            byOwner,
            activitiesByType: toDistribution(activityTypeRows, 'type', fromPrismaActivityType),
            activitiesByStatus: toDistribution(activityStatusRows, 'status', fromPrismaActivityStatus),
            lostReasons: toDistribution(lostReasonsRows, 'lossReason', (v: string) => v, 'Sem motivo registrado'),
            performanceReport,
            callHeatmap: heatmap,
            tmqMetric,
            isEmpty,
        };

        if (connection) {
            try {
                await connection.setex(cacheKey, 60, JSON.stringify(result));
            } catch (err) {
                // Falha de gravação de cache é não-fatal.
            }
        }

        return result;
    }

    private async performanceReport(organizationId: string, scope: any) {
        const ownerStats = await prisma.lead.groupBy({
            by: ['owner'],
            where: scope,
            _count: { _all: true },
        });
        const qualifiedStats = await prisma.lead.groupBy({
            by: ['owner'],
            where: { ...scope, status: { notIn: ['Lead_Recebido', 'Cadencia_Iniciada', 'Lead_Desqualificado'] } },
            _count: { _all: true },
        });

        const qualMap = new Map<string, number>();
        qualifiedStats.forEach((q) => qualMap.set(q.owner || '', q._count._all));

        return ownerStats.map((s) => {
            const owner = s.owner || 'Sem Dono';
            const assigned = s._count._all;
            const qualified = qualMap.get(s.owner || '') || 0;
            return {
                agent: owner,
                isAi: owner.includes('IA') || owner.includes('SDR'),
                leadsAssigned: assigned,
                leadsQualified: qualified,
                conversionRate: assigned > 0 ? (qualified / assigned) * 100 : 0,
            };
        }).sort((a, b) => b.leadsQualified - a.leadsQualified);
    }

    private async callHeatmap(organizationId: string, scope: any) {
        void organizationId;
        const activities = await prisma.activity.findMany({
            where: { ...scope, type: 'Ligacao' },
            select: { createdAt: true },
        });
        const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));

        activities.forEach((activity) => {
            const shifted = new Date(activity.createdAt.getTime() - 3 * 60 * 60 * 1000);
            heatmap[shifted.getUTCDay()][shifted.getUTCHours()]++;
        });

        const result = [];
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                if (heatmap[d][h] > 0) result.push({ dayOfWeek: d, hour: h, count: heatmap[d][h] });
            }
        }
        return result;
    }

    private async tmqMetric(_organizationId: string, _scope: any): Promise<number | null> {
        return null;
    }
}

export const analyticsService = new AnalyticsService();
