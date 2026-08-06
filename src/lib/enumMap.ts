import type { LeadStatus, CompanyStatus, ActivityType, ActivityStatus } from './zod';

// O schema.prisma usa identificadores de enum (ex: Novo_Lead) com @map para o texto
// exibido na UI (ex: "Novo Lead"). Este módulo faz a ponte entre os dois mundos:
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

function invert(map: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}

const LEAD_STATUS_FROM_PRISMA = invert(LEAD_STATUS_TO_PRISMA);
const COMPANY_STATUS_FROM_PRISMA = invert(COMPANY_STATUS_TO_PRISMA);
const ACTIVITY_TYPE_FROM_PRISMA = invert(ACTIVITY_TYPE_TO_PRISMA);
const ACTIVITY_STATUS_FROM_PRISMA = invert(ACTIVITY_STATUS_TO_PRISMA);

export const toPrismaLeadStatus = (v: LeadStatus): string => LEAD_STATUS_TO_PRISMA[v] ?? v;
export const fromPrismaLeadStatus = (v: string): LeadStatus => (LEAD_STATUS_FROM_PRISMA[v] ?? v) as LeadStatus;

export const toPrismaCompanyStatus = (v: CompanyStatus): string => COMPANY_STATUS_TO_PRISMA[v] ?? v;
export const fromPrismaCompanyStatus = (v: string): CompanyStatus => (COMPANY_STATUS_FROM_PRISMA[v] ?? v) as CompanyStatus;

export const toPrismaActivityType = (v: ActivityType): string => ACTIVITY_TYPE_TO_PRISMA[v];
export const fromPrismaActivityType = (v: string): ActivityType => (ACTIVITY_TYPE_FROM_PRISMA[v] ?? v) as ActivityType;

export const toPrismaActivityStatus = (v: ActivityStatus): string => ACTIVITY_STATUS_TO_PRISMA[v];
export const fromPrismaActivityStatus = (v: string): ActivityStatus => (ACTIVITY_STATUS_FROM_PRISMA[v] ?? v) as ActivityStatus;
