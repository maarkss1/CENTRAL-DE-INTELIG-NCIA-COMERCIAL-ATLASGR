import { z } from 'zod';

// ─── Enums de Domínio ───────────────────────────────────────────────────────
// Ao invés de strings livres, definimos os valores aceitos explicitamente.
// Isso garante que o backend rejeite valores inválidos e o TS alerte em
// tempo de compilação se um valor desconhecido for passado.

export const COMPANY_STATUS = ['Ativo', 'Inativo', 'Em análise'] as const;

// Funil de Leads (pré-qualificação, 6 etapas) — mesma lista de status do objeto Lead no Bitrix24.
export const LEAD_FUNNEL_STATUS = [
    'Lead Recebido',
    'Cadência Iniciada',
    'Qualificação (SDR)',
    'Reunião Agendada',
    'Convertido em Oportunidade',
    'Lead Desqualificado',
] as const;

// Funil de Negócios (pipeline comercial real, 12 etapas) — mesmas etapas do pipeline "Negócios"
// padrão no Bitrix24 (categoria 0).
export const DEAL_FUNNEL_STATUS = [
    'Nova Oportunidade',
    'Proposta Enviada',
    'Call/Visita Agendada',
    'Piloto VTECH',
    'Piloto Atlas Profile',
    'Piloto Atlas Profile - Concluído',
    'Piloto Atlas Profile - Cancelado',
    'Piloto Logística',
    'Piloto Logístico - Concluído',
    'Piloto Logístico - Cancelado',
    'Negócios Ganhos',
    'Negócios Perdidos',
] as const;

export const LEAD_STATUS = [...LEAD_FUNNEL_STATUS, ...DEAL_FUNNEL_STATUS] as const;

// Qual dos dois Kanbans (e qual subconjunto de LEAD_STATUS) um Lead pertence agora. Todo Lead
// nasce em "Lead"; vira "Negocio" quando convertido em oportunidade real — mesma transição que o
// Bitrix24 faz quando um Lead vira Deal.
export const LEAD_FUNNEL = ['Lead', 'Negocio'] as const;

export const ACTIVITY_TYPE = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião', 'Follow-up', 'Visita', 'Tarefa'] as const;
export const ACTIVITY_STATUS = ['Pendente', 'Em andamento', 'Concluída', 'Cancelada'] as const;
export const LEAD_TEMPERATURE = ['Frio', 'Morno', 'Quente'] as const;
export const CONTACT_STATUS = ['Ativo', 'Inativo'] as const;

// TypeScript union types derivados dos arrays de enums
export type CompanyStatus = (typeof COMPANY_STATUS)[number];
export type LeadStatus = (typeof LEAD_STATUS)[number];
export type LeadFunnel = (typeof LEAD_FUNNEL)[number];
export type ActivityType = (typeof ACTIVITY_TYPE)[number];
export type ActivityStatus = (typeof ACTIVITY_STATUS)[number];
export type LeadTemperature = (typeof LEAD_TEMPERATURE)[number];
export type ContactStatus = (typeof CONTACT_STATUS)[number];

// ─── Schemas Zod ────────────────────────────────────────────────────────────

export const companySchema = z.object({
    legalName: z.string().min(1, 'Razão Social é obrigatória'),
    tradeName: z.string().min(1, 'Nome Fantasia é obrigatório'),
    cnpj: z.string().optional().nullable(),
    stateRegistration: z.string().optional().nullable(),
    segment: z.string().optional().nullable(),
    cnae: z.string().optional().nullable(),
    size: z.string().optional().nullable(),
    employeeCount: z.number().int().optional().nullable(),
    estimatedRevenue: z.number().optional().nullable(),
    website: z.string().optional().nullable(),
    linkedin: z.string().optional().nullable(),
    instagram: z.string().optional().nullable(),
    phones: z.array(z.string()).optional().default([]),
    emails: z.array(z.string()).optional().default([]),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    zipCode: z.string().optional().nullable(),
    owner: z.string().optional().nullable(),
    status: z.enum(COMPANY_STATUS).default('Ativo'),
    tags: z.array(z.string()).optional().default([]),
    observations: z.string().optional().nullable(),
});

export const contactSchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório'),
    role: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    whatsapp: z.string().optional().nullable(),
    email: z.string().email('E-mail inválido').optional().nullable().or(z.literal('')),
    linkedin: z.string().optional().nullable(),
    birthDate: z.string().optional().nullable(),
    observations: z.string().optional().nullable(),
    status: z.enum(CONTACT_STATUS).default('Ativo'),
    companyId: z.string(),
});

export const leadSchema = z.object({
    // Core CRM fields
    status: z.enum(LEAD_STATUS).default('Lead Recebido'),
    funnel: z.enum(LEAD_FUNNEL).default('Lead'),
    source: z.string().optional().nullable(),
    channel: z.string().optional().nullable(),
    temperature: z.enum(LEAD_TEMPERATURE).optional().nullable(),
    score: z.number().int().optional().nullable(),
    owner: z.string().optional().nullable(),
    companyId: z.string().optional().nullable(),
    contactId: z.string().optional().nullable(),
    // PIC (Perfil de Cliente Ideal) do Playbook de Pré-Vendas Atlas — setado manualmente pelo SDR/AM.
    pic: z.enum(['PIC1_Expansao', 'PIC2_Risco', 'PIC3_Transicao']).optional().nullable(),
    // Checklist de qualificação do SDR (Playbook Comercial AtlasGR, seção 4.2) — objeto livre, ver LeadQualification no frontend.
    qualification: z.record(z.string(), z.any()).optional().nullable(),
    // Campos comerciais espelhados do Bitrix24 (ver bitrixFieldMap.ts) — preenchidos manualmente
    // pelo time ou sincronizados na importação/exportação.
    resumeDate: z.string().optional().nullable(),
    cadenceStage: z.string().optional().nullable(),
    lossReason: z.string().optional().nullable(),
    dealPackage: z.string().optional().nullable(),
    dealStatus: z.string().optional().nullable(),
    relationshipLevel: z.string().optional().nullable(),
    commissionPercent: z.string().optional().nullable(),
    partnerBroker: z.string().optional().nullable(),
    qualificationValidatedByAM: z.boolean().optional().nullable(),
});

export const activitySchema = z.object({
    type: z.enum(ACTIVITY_TYPE),
    owner: z.string().min(1, 'Responsável é obrigatório'),
    date: z.string(),
    time: z.string().optional().nullable(),
    status: z.enum(ACTIVITY_STATUS).default('Pendente'),
    observations: z.string().optional().nullable(),
    leadId: z.string(),
});

export const noteSchema = z.object({
    content: z.string().min(1, 'Conteúdo é obrigatório'),
    author: z.string().min(1, 'Autor é obrigatório'),
});

export const registerSchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório'),
    email: z.string().email('E-mail inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    organizationId: z.string().optional().nullable(),
});

export const loginSchema = z.object({
    email: z.string().email('E-mail inválido'),
    password: z.string().min(1, 'Senha é obrigatória'),
});
