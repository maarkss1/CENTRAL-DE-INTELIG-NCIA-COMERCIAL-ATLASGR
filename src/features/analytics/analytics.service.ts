import { prisma } from '../../lib/prisma.js';
import {
    fromPrismaLeadStatus,
    fromPrismaActivityType,
    fromPrismaActivityStatus,
} from '../../lib/enumMap.js';

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

const WON = 'Negocios_Ganhos';
const LOST = 'Negocios_Perdidos';
const DESQUALIFICADO = 'Lead_Desqualificado';

export interface OverviewMetrics {
    totalCompanies: number;
    totalContacts: number;
    /** Leads em aberto (fora de ganho/perdido). */
    totalLeads: number;
    totalActivities: number;
    pendingActivities: number;
    overdueActivities: number;
    closedThisMonth: number;
    lostThisMonth: number;
    conversionRate: number;
    /** Média do score dos leads em aberto, ou null se nenhum lead tem score preenchido. */
    averageScore: number | null;
    /**
     * Sempre null: não existe campo de valor monetário no modelo Lead. O frontend exibe "—" em vez
     * de inventar um número. Quando a coluna existir, é aqui que ela entra.
     */
    pipelineValue: null;
}

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
    /** `true` quando a organização ainda não tem nenhum dado — o frontend mostra o estado vazio. */
    isEmpty: boolean;
}

function startOfCurrentMonth(now: Date): Date {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Primeiro dia do mês, `monthsBack` meses atrás. */
function startOfMonthsAgo(now: Date, monthsBack: number): Date {
    const d = startOfCurrentMonth(now);
    d.setMonth(d.getMonth() - monthsBack);
    return d;
}

function monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
    /**
     * Métricas de topo. Ao contrário da versão anterior desta rota, não devolve números fictícios
     * quando a base está vazia: zero é uma resposta legítima e o frontend sabe exibir isso.
     */
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
        ] = await Promise.all([
            prisma.company.count({ where: scope }),
            prisma.contact.count({ where: scope }),
            prisma.lead.count({ where: { ...scope, status: { notIn: [WON, LOST, DESQUALIFICADO] } } }),
            prisma.lead.count({ where: scope }),
            prisma.activity.count({ where: scope }),
            prisma.activity.count({ where: { ...scope, status: 'Pendente' } }),
            // Atrasada = pendente com data no passado. É o número que o time comercial cobra.
            prisma.activity.count({ where: { ...scope, status: 'Pendente', date: { lt: now } } }),
            // closedAt (não updatedAt: esse é @updatedAt e sobe em QUALQUER update do lead — sync do
            // Bitrix, uma ligação do SDR de voz tocando só lastInteraction — não só em fechamento).
            prisma.lead.count({ where: { ...scope, status: WON, closedAt: { gte: monthStart } } }),
            prisma.lead.count({ where: { ...scope, status: { in: [LOST, DESQUALIFICADO] }, closedAt: { gte: monthStart } } }),
            prisma.lead.count({ where: { ...scope, status: WON } }),
            prisma.lead.aggregate({
                where: { ...scope, status: { notIn: [WON, LOST, DESQUALIFICADO] }, score: { not: null } },
                _avg: { score: true },
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
            pipelineValue: null,
        };
    }

    /** Funil por etapa, com a conversão de cada etapa em relação à anterior. */
    async funnel(organizationId: string): Promise<FunnelStage[]> {
        const rows = await prisma.lead.groupBy({
            by: ['status'],
            where: { organizationId, deletedAt: null },
            _count: { _all: true },
        });

        const counts = new Map<string, number>();
        for (const row of rows) counts.set(row.status as string, row._count._all);

        // O funil é cumulativo: quem está em "Proposta" já passou por "Qualificação". Somamos as
        // etapas seguintes (mais os ganhos) para que o gráfico não pareça furado quando o lead
        // avança e some da etapa de origem.
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

    /** Evolução mensal de leads criados, ganhos e perdidos nos últimos `months` meses. */
    async monthly(organizationId: string, months = 6, now = new Date()): Promise<MonthlyPoint[]> {
        const since = startOfMonthsAgo(now, months - 1);
        const scope = { organizationId, deletedAt: null };

        const [created, closed] = await Promise.all([
            prisma.lead.findMany({
                where: { ...scope, createdAt: { gte: since } },
                select: { createdAt: true },
            }),
            prisma.lead.findMany({
                where: { ...scope, status: { in: [WON, LOST, DESQUALIFICADO] }, closedAt: { gte: since } },
                select: { closedAt: true, status: true },
            }),
        ]);

        // Pré-popula todos os meses do intervalo para o gráfico não ter buracos.
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
            // closedAt não pode ser null aqui: a query acima já filtra `closedAt: { gte: since }`.
            const bucket = buckets.get(monthKey(lead.closedAt as Date));
            if (!bucket) continue;
            if (lead.status === WON) bucket.won++;
            else bucket.lost++;
        }

        return [...buckets.values()];
    }

    /** Monta o dashboard inteiro. Uma chamada só, para a tela não fazer 8 requisições. */
    async dashboard(organizationId: string, months = 6, now = new Date()): Promise<AnalyticsDashboard> {
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
            // Um ranking de vendedores longo demais vira ruído; a cauda raramente importa.
            .slice(0, 10);

        const isEmpty =
            overview.totalCompanies === 0 &&
            overview.totalContacts === 0 &&
            overview.totalActivities === 0 &&
            funnel.every((stage) => stage.count === 0);

        return {
            overview,
            funnel,
            monthly,
            byTemperature: toDistribution(temperatureRows, 'temperature', (v: string) => v, 'Sem temperatura'),
            bySource: toDistribution(sourceRows, 'source', (v: string) => v, 'Origem não informada'),
            byOwner,
            activitiesByType: toDistribution(activityTypeRows, 'type', fromPrismaActivityType),
            activitiesByStatus: toDistribution(activityStatusRows, 'status', fromPrismaActivityStatus),
            isEmpty,
        };
    }
}

export const analyticsService = new AnalyticsService();
