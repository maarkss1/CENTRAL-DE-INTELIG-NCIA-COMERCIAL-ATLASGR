import {
    fromPrismaLeadStatus,
    fromPrismaActivityType,
    fromPrismaActivityStatus,
} from '../../../lib/enumMap.js';
import {
    FUNNEL_STAGES,
    WON,
    LOST,
    type OverviewMetrics,
    type DistributionSlice,
    type FunnelStage,
    type MonthlyPoint,
    type AnalyticsDashboard,
    type AnalyticsRepository,
    type GroupCount,
} from '../domain/Analytics';

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

/** Converte um agrupamento bruto do repositório numa distribuição ordenada por contagem. */
function toDistribution(
    rows: GroupCount[],
    translate: (raw: string) => string,
    fallbackLabel = 'Não informado',
): DistributionSlice[] {
    return rows
        .map((row) => ({
            label: row.value == null || row.value === '' ? fallbackLabel : translate(row.value),
            count: row.count,
        }))
        .sort((a, b) => b.count - a.count);
}

/** Agrupa timestamps de ligação em (dia da semana, hora), omitindo células sem nenhuma ligação. */
function buildCallHeatmap(callTimestamps: Date[]): { dayOfWeek: number; hour: number; count: number }[] {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const createdAt of callTimestamps) {
        grid[createdAt.getDay()][createdAt.getHours()]++;
    }

    const result: { dayOfWeek: number; hour: number; count: number }[] = [];
    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            if (grid[day][hour] > 0) result.push({ dayOfWeek: day, hour, count: grid[day][hour] });
        }
    }
    return result;
}

/**
 * `isAi` é uma heurística de exibição (não uma coluna real): tenta reconhecer donos automatizados
 * pelo texto ("IA"/"SDR" no valor de `owner`) para trocar o ícone no relatório. `Lead.owner` guarda
 * o `User.id` de quem capturou o lead na maioria dos casos (ver LeadUseCases.createLead) — um cuid
 * nunca bate nesse teste de texto, então a heurística erra sempre para "não é IA" (falso negativo
 * seguro) em vez de rotular uma pessoa real como IA por engano.
 */
function buildPerformanceReport(
    assignedRows: GroupCount[],
    qualifiedRows: GroupCount[],
): AnalyticsDashboard['performanceReport'] {
    const qualifiedByOwner = new Map<string, number>();
    for (const row of qualifiedRows) qualifiedByOwner.set(row.value ?? '', row.count);

    return assignedRows
        .map((row) => {
            const owner = row.value || '';
            const assigned = row.count;
            const qualified = qualifiedByOwner.get(owner) ?? 0;
            return {
                agent: owner || 'Sem Dono',
                isAi: owner.includes('IA') || owner.includes('SDR'),
                leadsAssigned: assigned,
                leadsQualified: qualified,
                conversionRate: assigned > 0 ? (qualified / assigned) * 100 : 0,
            };
        })
        .sort((a, b) => b.leadsQualified - a.leadsQualified);
}

/**
 * Ao contrário de company/contact/lead/activity/note (entidades CRUD que estendem BaseUseCases),
 * Analytics é leitura agregada cross-model sem uma "entidade" própria — não estende BaseUseCases
 * (que assume findAll/findById/create/update/delete de UM tipo). Segue a mesma camada
 * routes -> controller -> use case -> repository -> prisma dos outros módulos migrados.
 */
export class AnalyticsUseCases {
    constructor(private repository: AnalyticsRepository) {}

    /**
     * Métricas de topo. Ao contrário da versão anterior desta rota, não devolve números fictícios
     * quando a base está vazia: zero é uma resposta legítima e o frontend sabe exibir isso.
     */
    async overview(organizationId: string, now = new Date()): Promise<OverviewMetrics> {
        const monthStart = startOfCurrentMonth(now);

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
            averageScore,
            pipeline,
        ] = await Promise.all([
            this.repository.countCompanies(organizationId),
            this.repository.countContacts(organizationId),
            this.repository.countOpenLeads(organizationId),
            this.repository.countAllLeads(organizationId),
            this.repository.countActivities(organizationId),
            this.repository.countPendingActivities(organizationId),
            this.repository.countOverdueActivities(organizationId, now),
            this.repository.countLeadsByStatusSince(organizationId, WON, monthStart),
            this.repository.countLeadsByStatusSince(organizationId, LOST, monthStart),
            this.repository.countLeadsByStatus(organizationId, WON),
            this.repository.averageOpenLeadScore(organizationId),
            this.repository.sumOpenPipelineValue(organizationId),
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
            averageScore,
            // count === 0: nenhum lead em aberto tem `amount` preenchido — "Não disponível", não 0.
            pipelineValue: pipeline.count > 0 ? pipeline.total : null,
        };
    }

    /** Funil por etapa, com a conversão de cada etapa em relação à anterior. */
    async funnel(organizationId: string): Promise<FunnelStage[]> {
        const rows = await this.repository.groupLeadsByStatus(organizationId);

        const counts = new Map<string, number>();
        for (const row of rows) if (row.value) counts.set(row.value, row.count);

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

        const [created, closed] = await Promise.all([
            this.repository.findLeadsCreatedSince(organizationId, since),
            this.repository.findLeadsClosedSince(organizationId, since),
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
            const bucket = buckets.get(monthKey(lead.closedAt));
            if (!bucket) continue;
            if (lead.status === WON) bucket.won++;
            else bucket.lost++;
        }

        return [...buckets.values()];
    }

    /** Monta o dashboard inteiro. Uma chamada só, para a tela não fazer 8 requisições. */
    async dashboard(organizationId: string, months = 6, now = new Date()): Promise<AnalyticsDashboard> {
        const [
            overview,
            funnel,
            monthly,
            temperatureRows,
            sourceRows,
            ownerRows,
            wonByOwnerRows,
            qualifiedByOwnerRows,
            activityTypeRows,
            activityStatusRows,
            lostReasonRows,
            callTimestamps,
        ] = await Promise.all([
            this.overview(organizationId, now),
            this.funnel(organizationId),
            this.monthly(organizationId, months, now),
            this.repository.groupLeadsByTemperature(organizationId),
            this.repository.groupLeadsBySource(organizationId),
            this.repository.groupLeadsByOwner(organizationId),
            this.repository.groupLeadsByOwner(organizationId, WON),
            this.repository.groupQualifiedLeadsByOwner(organizationId),
            this.repository.groupActivitiesByType(organizationId),
            this.repository.groupActivitiesByStatus(organizationId),
            this.repository.groupLostLeadsByReason(organizationId),
            this.repository.findCallActivityTimestamps(organizationId),
        ]);

        const wonByOwner = new Map<string, number>();
        for (const row of wonByOwnerRows) {
            wonByOwner.set(row.value ?? '', row.count);
        }

        const byOwner = ownerRows
            .map((row) => {
                const owner = row.value || '';
                return {
                    label: owner || 'Sem responsável',
                    count: row.count,
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
            byTemperature: toDistribution(temperatureRows, (v) => v, 'Sem temperatura'),
            bySource: toDistribution(sourceRows, (v) => v, 'Origem não informada'),
            byOwner,
            activitiesByType: toDistribution(activityTypeRows, fromPrismaActivityType),
            activitiesByStatus: toDistribution(activityStatusRows, fromPrismaActivityStatus),
            // Sem timestamp real de entrada na etapa de qualificação para o funil Lead — ver
            // comentário completo no tipo `AnalyticsDashboard['tmqMetric']` (domain/Analytics.ts).
            tmqMetric: null,
            lostReasons: toDistribution(lostReasonRows, (v) => v, 'Sem motivo registrado'),
            callHeatmap: buildCallHeatmap(callTimestamps),
            performanceReport: buildPerformanceReport(ownerRows, qualifiedByOwnerRows),
            isEmpty,
        };
    }
}
