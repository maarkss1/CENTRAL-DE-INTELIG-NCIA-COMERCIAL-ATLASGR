import type { LeadStatus as PrismaLeadStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { connection } from '../../lib/queue/redis.js';
import {
    fromPrismaLeadStatus,
    fromPrismaActivityType,
    fromPrismaActivityStatus,
} from '../../lib/enumMap.js';
import type { OverviewMetrics } from '../../shared/contracts/analytics.contract.js';

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
// Os dois estágios "...Cancelado" dos pilotos comerciais (funil Negócio) — crm360.service.ts
// (DEAL_STAGES) já os trata como isLost:true, mas este serviço (que lê Lead.status diretamente,
// caminho legado) não os reconhecia como fechamento. Sem isso, um lead cancelado num piloto
// contava como "pipeline ainda aberto" nestas métricas — inconsistente com o resto do produto.
const PILOT_CANCELLED_STATUSES: PrismaLeadStatus[] = ['Piloto_Atlas_Profile_Cancelado', 'Piloto_Logistico_Cancelado'];
/** Todo status que representa fechamento sem venda (perdido/desqualificado/piloto cancelado). */
const CLOSED_LOST_STATUSES: PrismaLeadStatus[] = [LOST, DESQUALIFICADO, ...PILOT_CANCELLED_STATUSES];

// `OverviewMetrics` vem da fonte canônica compartilhada (Onda 10, Agente 04, resolvendo
// `.agents/handoffs/onda-8/18-para-04-unificar-overviewmetrics.md`) — antes desta unificação, o
// mesmo formato estava declarado de forma independente aqui e em `domain/Analytics.ts`, sem
// nenhuma relação de import entre si, podendo divergir silenciosamente sem que o typecheck
// acusasse. Não redeclare localmente: qualquer campo novo/alterado entra em
// `src/shared/contracts/analytics.contract.ts`. (Este serviço legado continua em uso real por
// `src/features/crm/jobs/weeklyPdfReport.worker.ts` — não é código morto.)
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
    /**
     * "Tempo até qualificação". Sempre `null` — ver o mesmo campo em domain/Analytics.ts
     * (AnalyticsDashboard) para a explicação completa: não existe timestamp real de quando um Lead
     * entrou na etapa de qualificação, e `updatedAt` (usado por uma versão anterior deste método)
     * não é um proxy válido porque sobe em qualquer escrita no registro, não só em mudança de
     * etapa.
     */
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
            pipelineAggregate,
            pipelineCount,
        ] = await Promise.all([
            prisma.company.count({ where: scope }),
            prisma.contact.count({ where: scope }),
            prisma.lead.count({ where: { ...scope, status: { notIn: [WON, ...CLOSED_LOST_STATUSES] } } }),
            prisma.lead.count({ where: scope }),
            prisma.activity.count({ where: scope }),
            prisma.activity.count({ where: { ...scope, status: 'Pendente' } }),
            // Atrasada = pendente com data no passado. É o número que o time comercial cobra.
            prisma.activity.count({ where: { ...scope, status: 'Pendente', date: { lt: now } } }),
            // closedAt (não updatedAt: esse é @updatedAt e sobe em QUALQUER update do lead — sync do
            // Bitrix, uma ligação do SDR de voz tocando só lastInteraction — não só em fechamento).
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
            // count === 0: nenhum lead em aberto tem `amount` preenchido — "Não disponível", não 0.
            pipelineValue: pipelineCount > 0 ? (pipelineAggregate._sum.amount ?? 0) : null,
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
                where: { ...scope, status: { in: [WON, ...CLOSED_LOST_STATUSES] }, closedAt: { gte: since } },
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
        const cacheKey = `analytics:dash:${organizationId}:${months}`;
        if (connection) {
            try {
                const cached = await connection.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (err) {
                // Se falhar o cache, apenas continua e busca do banco
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
            // Um ranking de vendedores longo demais vira ruído; a cauda raramente importa.
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
                // Silenciosamente ignora falha de gravação de cache
            }
        }

        return result;
    }

    private async performanceReport(organizationId: string, scope: any) {
        const ownerStats = await prisma.lead.groupBy({
            by: ['owner'],
            where: scope,
            _count: { _all: true }
        });
        const qualifiedStats = await prisma.lead.groupBy({
            by: ['owner'],
            where: { ...scope, status: { notIn: ['Lead_Recebido', 'Cadencia_Iniciada', 'Lead_Desqualificado'] } },
            _count: { _all: true }
        });

        const qualMap = new Map<string, number>();
        qualifiedStats.forEach(q => qualMap.set(q.owner || '', q._count._all));

        return ownerStats.map(s => {
            const owner = s.owner || 'Sem Dono';
            const assigned = s._count._all;
            const qualified = qualMap.get(s.owner || '') || 0;
            return {
                agent: owner,
                isAi: owner.includes('IA') || owner.includes('SDR'),
                leadsAssigned: assigned,
                leadsQualified: qualified,
                conversionRate: assigned > 0 ? (qualified / assigned) * 100 : 0
            };
        }).sort((a, b) => b.leadsQualified - a.leadsQualified);
    }

    private async callHeatmap(organizationId: string, scope: any) {
        // 'Ligacao' é o valor real do enum ActivityType (ver schema.prisma) — este método filtrava
        // por `type: 'call'`, valor que não existe no enum, então a query sempre devolvia zero
        // linhas silenciosamente (heatmap sempre vazio, indistinguível de "nenhuma ligação
        // registrada" mesmo com ligações reais no banco). Corrigido para o valor real.
        const activities = await prisma.activity.findMany({
            where: { ...scope, type: 'Ligacao' },
            select: { createdAt: true }
        });
        const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
        
        activities.forEach(a => {
            const date = new Date(a.createdAt);
            heatmap[date.getDay()][date.getHours()]++;
        });

        const result = [];
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                if (heatmap[d][h] > 0) {
                    result.push({ dayOfWeek: d, hour: h, count: heatmap[d][h] });
                }
            }
        }
        return result;
    }

    /**
     * TMQ (Tempo até Qualificação): sempre `null` — ver o comentário completo em
     * `AnalyticsDashboard['tmqMetric']` (domain/Analytics.ts). Este método calculava
     * `updatedAt - createdAt` como proxy, mas `updatedAt` é `@updatedAt` e sobe em QUALQUER escrita
     * no lead (sync do Bitrix, uma ligação de voz tocando só `lastInteraction`), não só quando o
     * lead entra na etapa de qualificação — o número resultante não media "tempo até qualificar",
     * media "há quanto tempo alguém mexeu nisso pela última vez". Sem uma coluna/tabela real com o
     * timestamp de entrada na etapa (o funil Lead não tem o equivalente do
     * `LeadStageHistory.enteredAt` que o funil Negócio tem), `null` é mais honesto que um número
     * que parece preciso e não é (ver AGENTS.md > "Dados reais x demonstração").
     */
    private async tmqMetric(_organizationId: string, _scope: any): Promise<number | null> {
        return null;
    }
}

export const analyticsService = new AnalyticsService();
