import type { LeadStatus, CompanyStatus, ActivityType, ActivityStatus } from './zod';

// O schema.prisma usa identificadores de enum (ex: Lead_Recebido) com @map para o texto
// exibido na UI (ex: "Lead Recebido"). Este módulo faz a ponte entre os dois mundos:
// o resto do sistema (zod, frontend, rotas) só conhece o texto exibido.

const LEAD_STATUS_TO_PRISMA: Record<LeadStatus, string> = {
    'Lead Recebido': 'Lead_Recebido',
    'Cadência Iniciada': 'Cadencia_Iniciada',
    'Qualificação (SDR)': 'Qualificacao_SDR',
    'Reunião Agendada': 'Reuniao_Agendada',
    'Lead Desqualificado': 'Lead_Desqualificado',
    'Convertido em Oportunidade': 'Convertido_em_Oportunidade',
    'Nova Oportunidade': 'Nova_Oportunidade',
    'Proposta Enviada': 'Proposta_Enviada',
    'Call/Visita Agendada': 'Call_Visita_Agendada',
    'Piloto VTECH': 'Piloto_VTECH',
    'Piloto Atlas Profile': 'Piloto_Atlas_Profile',
    'Piloto Atlas Profile - Concluído': 'Piloto_Atlas_Profile_Concluido',
    'Piloto Atlas Profile - Cancelado': 'Piloto_Atlas_Profile_Cancelado',
    'Piloto Logística': 'Piloto_Logistica',
    'Piloto Logístico - Concluído': 'Piloto_Logistico_Concluido',
    'Piloto Logístico - Cancelado': 'Piloto_Logistico_Cancelado',
    'Negócios Perdidos': 'Negocios_Perdidos',
    'Negócios Ganhos': 'Negocios_Ganhos',
};

const COMPANY_STATUS_TO_PRISMA: Record<CompanyStatus, string> = {
    Ativo: 'Ativo',
    Inativo: 'Inativo',
    'Em análise': 'Em_analise',
};

const ACTIVITY_TYPE_TO_PRISMA: Record<ActivityType, string> = {
    'Ligação': 'Ligacao',
    WhatsApp: 'WhatsApp',
    'E-mail': 'Email',
    'Reunião': 'Reuniao',
    'Follow-up': 'Follow_up',
    Visita: 'Visita',
    Tarefa: 'Tarefa',
};

const ACTIVITY_STATUS_TO_PRISMA: Record<ActivityStatus, string> = {
    Pendente: 'Pendente',
    'Em andamento': 'Em_andamento',
    'Concluída': 'Concluida',
    Cancelada: 'Cancelada',
};

export type AutomationTriggerLabel = 'Lead criado' | 'Lead mudou de status' | 'Atividade concluída' | 'Lead sem interação';
export type AutomationActionLabel = 'Notificar equipe' | 'Criar atividade' | 'Ligar via SDR de Voz';

const AUTOMATION_TRIGGER_TO_PRISMA: Record<AutomationTriggerLabel, string> = {
    'Lead criado': 'Lead_Criado',
    'Lead mudou de status': 'Lead_Mudou_Status',
    'Atividade concluída': 'Atividade_Concluida',
    'Lead sem interação': 'Lead_Sem_Interacao',
};

const AUTOMATION_ACTION_TO_PRISMA: Record<AutomationActionLabel, string> = {
    'Notificar equipe': 'Notificar_Equipe',
    'Criar atividade': 'Criar_Atividade',
    'Ligar via SDR de Voz': 'Ligar_SDR_Voz',
};

function invert(map: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}

const LEAD_STATUS_FROM_PRISMA = invert(LEAD_STATUS_TO_PRISMA);
const COMPANY_STATUS_FROM_PRISMA = invert(COMPANY_STATUS_TO_PRISMA);
const ACTIVITY_TYPE_FROM_PRISMA = invert(ACTIVITY_TYPE_TO_PRISMA);
const ACTIVITY_STATUS_FROM_PRISMA = invert(ACTIVITY_STATUS_TO_PRISMA);
const AUTOMATION_TRIGGER_FROM_PRISMA = invert(AUTOMATION_TRIGGER_TO_PRISMA);
const AUTOMATION_ACTION_FROM_PRISMA = invert(AUTOMATION_ACTION_TO_PRISMA);

export const toPrismaLeadStatus = (v: LeadStatus): string => LEAD_STATUS_TO_PRISMA[v] ?? v;
export const fromPrismaLeadStatus = (v: string): LeadStatus => (LEAD_STATUS_FROM_PRISMA[v] ?? v) as LeadStatus;

// DATA-004 (Sprint 05/Onda 17): fonte única do que conta como "fechado" para Lead.closedAt.
// Antes desta correção, PrismaLeadRepository.update(), PrismaLeadRepository.updateStatus() e
// PrismaCrm360Repository.updateLeadStage() mantinham 3 listas divergentes (2, 4 e 2 status
// respectivamente) — a mesma transição de status fechava closedAt por um caminho e não por
// outro, dependendo de qual rota o cliente chamava. União dos 3 conjuntos que já existiam:
// nenhum comportamento existente é revertido, só os dois caminhos mais estreitos (update() e
// updateLeadStage()) passam a tratar os 2 estágios "Cancelado" como fechamento, igual updateStatus()
// já fazia.
export const LEAD_CLOSING_STATUSES: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
    'Negócios Ganhos',
    'Negócios Perdidos',
    'Piloto Atlas Profile - Cancelado',
    'Piloto Logístico - Cancelado',
]);

export const isLeadClosingStatus = (v: LeadStatus | string | null | undefined): boolean =>
    v != null && LEAD_CLOSING_STATUSES.has(v as LeadStatus);

// DATA-004 (Sprint 05/Onda 17): antes desta correção, KanbanColumn.tsx e LeadDetailDrawer.tsx
// mantinham a mesma constante duplicada manualmente (o próprio comentário do drawer já reconhecia
// isso: "mantido em sincronia manualmente até haver um único lugar para essa constante").
export const LEAD_STATUS_EMOJI: Record<LeadStatus, string> = {
    'Lead Recebido': '🆕',
    'Cadência Iniciada': '📣',
    'Qualificação (SDR)': '🔎',
    'Reunião Agendada': '📅',
    'Lead Desqualificado': '🚫',
    'Convertido em Oportunidade': '⭐',
    'Nova Oportunidade': '💡',
    'Proposta Enviada': '📄',
    'Call/Visita Agendada': '🤝',
    'Piloto VTECH': '🧪',
    'Piloto Atlas Profile': '🧪',
    'Piloto Atlas Profile - Concluído': '✅',
    'Piloto Atlas Profile - Cancelado': '⛔',
    'Piloto Logística': '🚚',
    'Piloto Logístico - Concluído': '✅',
    'Piloto Logístico - Cancelado': '⛔',
    'Negócios Perdidos': '❌',
    'Negócios Ganhos': '🏆',
};

export const toPrismaCompanyStatus = (v: CompanyStatus): string => COMPANY_STATUS_TO_PRISMA[v] ?? v;
export const fromPrismaCompanyStatus = (v: string): CompanyStatus => (COMPANY_STATUS_FROM_PRISMA[v] ?? v) as CompanyStatus;

export const toPrismaActivityType = (v: ActivityType): string => ACTIVITY_TYPE_TO_PRISMA[v];
export const fromPrismaActivityType = (v: string): ActivityType => (ACTIVITY_TYPE_FROM_PRISMA[v] ?? v) as ActivityType;

export const toPrismaActivityStatus = (v: ActivityStatus): string => ACTIVITY_STATUS_TO_PRISMA[v];
export const fromPrismaActivityStatus = (v: string): ActivityStatus => (ACTIVITY_STATUS_FROM_PRISMA[v] ?? v) as ActivityStatus;

export const toPrismaAutomationTrigger = (v: AutomationTriggerLabel): string => AUTOMATION_TRIGGER_TO_PRISMA[v] ?? v;
export const fromPrismaAutomationTrigger = (v: string): AutomationTriggerLabel => (AUTOMATION_TRIGGER_FROM_PRISMA[v] ?? v) as AutomationTriggerLabel;

export const toPrismaAutomationAction = (v: AutomationActionLabel): string => AUTOMATION_ACTION_TO_PRISMA[v] ?? v;
export const fromPrismaAutomationAction = (v: string): AutomationActionLabel => (AUTOMATION_ACTION_FROM_PRISMA[v] ?? v) as AutomationActionLabel;


