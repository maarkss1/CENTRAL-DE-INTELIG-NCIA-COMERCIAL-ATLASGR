import type { OverviewMetrics } from '../../../shared/contracts/analytics.contract.js';

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
const DESQUALIFICADO = 'Lead_Desqualificado';
// Os dois estágios "...Cancelado" dos pilotos comerciais (funil Negócio) contam como fechamento
// sem venda, assim como em crm360.service.ts (DEAL_STAGES, isLost:true) e em analytics.service.ts
// (o serviço legado usado pelo relatório semanal em PDF). Sem isso, um lead desqualificado ou com
// piloto cancelado contava como "pipeline ainda aberto" aqui mas não nos outros dois lugares —
// dashboard, relatório em PDF e API divergindo silenciosamente na mesma métrica (ver mission do
// Agente 04: "dicionário de métricas... para que dashboard, relatório exportado e API não
// divirjam silenciosamente").
export const CLOSED_LOST_STATUSES = [LOST, DESQUALIFICADO, 'Piloto_Atlas_Profile_Cancelado', 'Piloto_Logistico_Cancelado'] as const;
/** Todo status que representa fechamento, ganho ou sem venda — usado para excluir do "pipeline aberto". */
export const CLOSED_STATUSES = [WON, ...CLOSED_LOST_STATUSES] as const;

// `OverviewMetrics` vem da fonte canônica compartilhada (Onda 10, Agente 04, resolvendo
// `.agents/handoffs/onda-8/18-para-04-unificar-overviewmetrics.md`) — antes desta unificação, o
// mesmo formato estava declarado de forma independente aqui e em `analytics.service.ts`, sem
// nenhuma relação de import entre si, podendo divergir silenciosamente sem que o typecheck
// acusasse. Não redeclare localmente: qualquer campo novo/alterado entra em
// `src/shared/contracts/analytics.contract.ts`.
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
     * "Tempo até qualificação" (TMQ). Sempre `null`: o modelo `Lead` não tem um timestamp real de
     * quando um registro entrou na etapa "Qualificacao_SDR" (isso só existe para o funil Negócio,
     * via `LeadStageHistory.enteredAt` — ver AGENTS.md do módulo `commercial-intelligence`). Uma
     * versão anterior deste campo usava `updatedAt - createdAt` como proxy, mas `updatedAt` sobe em
     * QUALQUER escrita no lead (sync do Bitrix, uma ligação de voz tocando só `lastInteraction`),
     * então o número resultante não media tempo até qualificação — media "há quanto tempo alguém
     * mexeu nisso pela última vez", o que é outra coisa. Sem uma coluna/tabela real para essa
     * transição no funil Lead, `null` (estado vazio explícito) é mais honesto que um número que
     * parece preciso e não é. Ver AGENTS.md > "Dados reais x demonstração".
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
    /** Leads em aberto (status fora de `CLOSED_STATUSES`). */
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
    /**
     * Soma de `Lead.amount` dos leads em aberto que têm valor preenchido, e quantos leads em
     * aberto entraram nessa soma. `count === 0` é o sinal para a camada de aplicação devolver
     * `pipelineValue: null` em vez de fabricar 0 (nenhum dado real disponível ainda).
     */
    sumOpenPipelineValue(organizationId: string): Promise<{ total: number; count: number }>;
    groupLeadsByStatus(organizationId: string): Promise<GroupCount[]>;
    findLeadsCreatedSince(organizationId: string, since: Date): Promise<Array<{ createdAt: Date }>>;
    /** Leads com status WON ou LOST fechados desde `since` (usa `closedAt`, nunca `updatedAt`). */
    findLeadsClosedSince(organizationId: string, since: Date): Promise<ClosedLead[]>;
    groupLeadsByTemperature(organizationId: string): Promise<GroupCount[]>;
    groupLeadsBySource(organizationId: string): Promise<GroupCount[]>;
    /** `status` opcional filtra o agrupamento (usado para "ganhos por responsável"). */
    groupLeadsByOwner(organizationId: string, status?: string): Promise<GroupCount[]>;
    /**
     * Leads agrupados por dono, restritos aos que já saíram das duas primeiras etapas do funil e
     * não foram desqualificados — usado para "leads qualificados por responsável" no relatório de
     * performance (mesmo recorte de status que a versão legada em `analytics.service.ts`).
     */
    groupQualifiedLeadsByOwner(organizationId: string): Promise<GroupCount[]>;
    groupActivitiesByType(organizationId: string): Promise<GroupCount[]>;
    groupActivitiesByStatus(organizationId: string): Promise<GroupCount[]>;
    /** Motivo de perda dos leads fechados sem venda (`Lead.lossReason`, texto livre). */
    groupLostLeadsByReason(organizationId: string): Promise<GroupCount[]>;
    /** `createdAt` de toda atividade do tipo "Ligação" — usado para montar o heatmap de ligações. */
    findCallActivityTimestamps(organizationId: string): Promise<Date[]>;
}
