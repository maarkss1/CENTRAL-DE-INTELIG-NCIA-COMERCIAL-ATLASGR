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

export const WON = 'Negocios_Ganhos';
export const LOST = 'Negocios_Perdidos';

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

export interface GroupCount {
    /** Valor bruto do campo agrupado (ex: status do Prisma, temperatura, origem) — `null`/`undefined` quando não preenchido. */
    value: string | null | undefined;
    count: number;
}

export interface ClosedLead {
    closedAt: Date;
    status: string;
}

/**
 * Camada de acesso a dado para as métricas de Analytics — ao contrário de company/contact/lead/
 * activity/note (entidades CRUD), Analytics não tem uma "entidade" própria: é leitura agregada
 * cross-model (Company/Contact/Lead/Activity). Por isso esta interface não estende
 * Repository<T>/CrudRepository<T> como os outros módulos migrados — cada método espelha uma
 * consulta agregada específica que a camada de aplicação precisa, não um CRUD genérico.
 */
export interface AnalyticsRepository {
    countCompanies(organizationId: string): Promise<number>;
    countContacts(organizationId: string): Promise<number>;
    /** Leads em aberto (status fora de WON/LOST). */
    countOpenLeads(organizationId: string): Promise<number>;
    /** Todos os leads já criados, independente de status. */
    countAllLeads(organizationId: string): Promise<number>;
    countActivities(organizationId: string): Promise<number>;
    countPendingActivities(organizationId: string): Promise<number>;
    countOverdueActivities(organizationId: string, now: Date): Promise<number>;
    /** Leads com este status fechados desde `since` (usa `closedAt`, nunca `updatedAt`). */
    countLeadsByStatusSince(organizationId: string, status: string, since: Date): Promise<number>;
    countLeadsByStatus(organizationId: string, status: string): Promise<number>;
    /** Média do score dos leads em aberto com score preenchido. */
    averageOpenLeadScore(organizationId: string): Promise<number | null>;
    groupLeadsByStatus(organizationId: string): Promise<GroupCount[]>;
    findLeadsCreatedSince(organizationId: string, since: Date): Promise<Array<{ createdAt: Date }>>;
    /** Leads com status WON ou LOST fechados desde `since` (usa `closedAt`, nunca `updatedAt`). */
    findLeadsClosedSince(organizationId: string, since: Date): Promise<ClosedLead[]>;
    groupLeadsByTemperature(organizationId: string): Promise<GroupCount[]>;
    groupLeadsBySource(organizationId: string): Promise<GroupCount[]>;
    /** `status` opcional filtra o agrupamento (usado para "ganhos por responsável"). */
    groupLeadsByOwner(organizationId: string, status?: string): Promise<GroupCount[]>;
    groupActivitiesByType(organizationId: string): Promise<GroupCount[]>;
    groupActivitiesByStatus(organizationId: string): Promise<GroupCount[]>;
}
