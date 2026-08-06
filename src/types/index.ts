// Re-export domain enum types from the single source of truth (zod.ts)
// This ensures frontend types stay in sync with backend validation schemas.
export type {
    CompanyStatus,
    LeadStatus,

    ActivityType,
    ActivityStatus,
    LeadTemperature,
    ContactStatus,
} from '../lib/zod';

export type { COMPANY_STATUS, LEAD_STATUS,   ACTIVITY_TYPE, ACTIVITY_STATUS, LEAD_TEMPERATURE, CONTACT_STATUS } from '../lib/zod';
// Arrays das etapas de cada funil (não tipos) — usados pelos dois Kanbans para montar as colunas.

/**
 * Checklist de qualificação do SDR — Playbook Comercial AtlasGR, seção 4.2. Preenchido
 * manualmente pelo time comercial durante a qualificação, nunca inferido automaticamente.
 */
export interface LeadQualification {
    // 4.2.1 Contexto Operacional
    segmentoOperacao?: string;
    tipoCarga?: string;
    principaisRotas?: string;
    usaTerceiros?: 'Sim' | 'Não' | '';
    mediaContratacaoTerceiros?: string;
    viagensPorMes?: string;
    frotaPropria?: string;
    frotaAgregados?: string;
    frotaTerceiros?: string;
    // 4.2.2 Estrutura Atual
    ermTms?: string;
    rastreador?: string;
    seguradora?: string;
    corretora?: string;
    possuiGR?: string;
    fornecedorGRAtual?: string;
    possuiCadastroMotorista?: string;
    consultaCadastroAtual?: string;
    possuiSoftwareLogistico?: string;
    softwareLogisticoAtual?: string;
    // 4.2.3 Dor Mapeada
    dorPrincipal?: string;
    detalhamentoDor?: string;
    impactoPercebido?: string;
    solucaoAtlas?: 'Profile' | 'GR' | 'Connect' | 'Combinação' | '';
    // 4.2.4 Interesse e Autoridade
    nivelAutoridade?: 'Decisor' | 'Influenciador' | 'Usuário' | '';
    interessePercebido?: 'Baixo' | 'Médio' | 'Alto' | '';
    horizonteDecisao?: 'Imediato' | '30 dias' | '60-90 dias' | 'Indefinido' | '';
    // 4.2.5 Próximo Passo
    expectativaProximaCall?: string;
    temaProximaReuniao?: string;
}

export interface PaginatedMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: PaginatedMeta;
}

export interface Company {
    id: string;
    legalName: string;
    tradeName: string;
    cnpj?: string | null;
    stateRegistration?: string | null;
    segment?: string | null;
    cnae?: string | null;
    size?: string | null;
    employeeCount?: number | null;
    estimatedRevenue?: number | null;
    website?: string | null;
    linkedin?: string | null;
    instagram?: string | null;
    twitter?: string | null;
    facebook?: string | null;
    phones: string[];
    emails: string[];
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    owner?: string | null;
    status: import('../lib/zod').CompanyStatus;
    tags: string[];
    observations?: string | null;
    organizationId?: string | null;
    createdAt: string;
    updatedAt: string;

    // Enriquecimento (Receita Federal)
    situacaoCadastral?: string | null;
    naturezaJuridica?: string | null;
    capitalSocial?: number | null;

    // Google Negócios (Places API)
    googleRating?: number | null;
    googleReviewsCount?: number | null;
    businessHours?: { openNow?: boolean; weekdayDescriptions?: string[] } | null;

    // Firmographics (Apollo Organization Enrich)
    technologies?: string[];
    keywords?: string[];
    logoUrl?: string | null;
    apolloOrgId?: string | null;

    contacts?: Contact[];
    leads?: Lead[];
}

export interface Contact {
    id: string;
    name: string;
    role?: string | null;
    department?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    linkedin?: string | null;
    birthDate?: string | null;
    observations?: string | null;
    status: import('../lib/zod').ContactStatus;
    source?: string | null;
    seniority?: string | null;
    emailStatus?: string | null;
    companyId: string;
    company?: Company;
    organizationId?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Lead {
    id: string;

    // CRM Core
    status: import('../lib/zod').LeadStatus;
    /** Qual dos dois Kanbans (Leads ou Negócios) este registro pertence agora. */

    source?: string | null;
    channel?: string | null;
    temperature?: import('../lib/zod').LeadTemperature | null;
    score?: number | null;
    owner?: string | null;
    lastInteraction?: string | null;
    nextAction?: string | null;
    organizationId?: string | null;
    /** PIC (Perfil de Cliente Ideal) do Playbook de Pré-Vendas Atlas — setado manualmente, nunca inferido automaticamente. */
    pic?: 'PIC1_Expansao' | 'PIC2_Risco' | 'PIC3_Transicao' | null;
    /** Checklist de qualificação do SDR (Playbook Comercial AtlasGR, seção 4.2). */
    qualification?: LeadQualification | null;

    // Campos comerciais espelhados do Bitrix24 (ver bitrixFieldMap.ts)
    resumeDate?: string | null;
    cadenceStage?: string | null;
    lossReason?: string | null;
    dealPackage?: string | null;
    dealStatus?: string | null;
    relationshipLevel?: string | null;
    commissionPercent?: string | null;
    partnerBroker?: string | null;
    qualificationValidatedByAM?: boolean | null;

    companyId?: string | null;
    company?: Company | null;
    contactId?: string | null;
    contact?: Contact | null;

    activities?: Activity[];
    timeline?: TimelineEvent[];
    internalNotes?: Note[];

    createdAt?: string;
    updatedAt?: string;
}

export interface Activity {
    id: string;
    type: import('../lib/zod').ActivityType;
    owner: string;
    date: string;
    time?: string | null;
    status: import('../lib/zod').ActivityStatus;
    observations?: string | null;
    leadId: string;
    lead?: Lead;
    organizationId?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TimelineEvent {
    id: string;
    type: string;
    description: string;
    leadId: string;
    createdAt: string;
}

export interface Note {
    id: string;
    content: string;
    author: string;
    leadId: string;
    createdAt: string;
    updatedAt: string;
}
