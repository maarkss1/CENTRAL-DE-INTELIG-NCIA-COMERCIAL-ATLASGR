import type { Activity, Company, Contact, Lead } from '../../types';

export interface CrmKpis {
    leads: number;
    openDeals: number;
    wonDeals: number;
    lostDeals: number;
    conversionRate: number;
    pipelineValue: number;
    weightedPipeline: number;
    overdueActivities: number;
    todayActivities: number;
    pendingDocuments: number;
}

export interface CrmOverviewData {
    kpis: CrmKpis;
    focusActivities: Array<Activity & { lead?: Lead | null }>;
    recentDeals: Lead[];
    stageCounts: Array<{ funnel: 'Lead' | 'Negocio'; status: string; count: number; amount: number }>;
}

export interface CrmPipelineStage {
    id: string;
    name: string;
    code: string;
    color: string;
    sortOrder: number;
    probability: number;
    leadStatus?: string | null;
    isWon: boolean;
    isLost: boolean;
    tunnelTargetStageId?: string | null;
    automation?: Record<string, unknown> | null;
    _count?: { leads: number };
}

export interface CrmPipeline {
    id: string;
    name: string;
    entity: 'Lead' | 'Negocio' | 'SmartProcess';
    isDefault: boolean;
    active: boolean;
    sortOrder: number;
    currency: string;
    stages: CrmPipelineStage[];
}

export interface CrmProduct {
    id: string;
    name: string;
    description?: string | null;
    sku?: string | null;
    type: 'Produto' | 'Servico';
    category?: string | null;
    unit: string;
    price: number;
    cost?: number | null;
    currency: string;
    taxPercent: number;
    active: boolean;
    stockQuantity?: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface CrmDealItem {
    id: string;
    name: string;
    sku?: string | null;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxPercent: number;
    total: number;
    sortOrder: number;
    leadId: string;
    productId?: string | null;
    product?: CrmProduct | null;
}

export interface CrmDocumentLineItem {
    productId?: string | null;
    name: string;
    sku?: string | null;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxPercent: number;
    total?: number;
}

export interface CrmCommercialDocument {
    id: string;
    number: string;
    type: 'Orcamento' | 'Proposta' | 'Fatura' | 'Contrato';
    status: 'Rascunho' | 'Enviado' | 'Visualizado' | 'Aceito' | 'Recusado' | 'Vencido' | 'Pago' | 'Cancelado';
    title: string;
    currency: string;
    issueDate: string;
    validUntil?: string | null;
    dueDate?: string | null;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    lineItems: CrmDocumentLineItem[];
    notes?: string | null;
    terms?: string | null;
    publicToken: string;
    leadId?: string | null;
    lead?: Lead | null;
    companyId?: string | null;
    company?: Company | null;
    contactId?: string | null;
    contact?: Contact | null;
    createdAt: string;
    updatedAt: string;
}
