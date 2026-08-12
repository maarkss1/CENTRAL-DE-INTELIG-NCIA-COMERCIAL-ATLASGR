import type {
    CrmOverviewData,
    CrmPipeline,
    CrmProduct,
    CrmDealItem,
    CrmCommercialDocument
} from '../crm360.types.js';
import type { CrmDealItemInput, CrmDocumentInput, CrmProductInput } from '../crm360.schema.js';

export interface ICrm360Repository {
    getOverviewData(organizationId: string): Promise<CrmOverviewData>;
    getPipelines(organizationId: string, entity?: string): Promise<CrmPipeline[]>;
    getBoardLeads(organizationId: string, funnel?: string, pipelineId?: string): Promise<{ stages: unknown[]; leads: unknown[] }>;
    updateLeadStage(organizationId: string, leadId: string, stageId: string, expectedCloseDate?: Date): Promise<unknown>;
    convertLead(organizationId: string, leadId: string): Promise<unknown>;

    // Produtos & Itens de Negócio
    listProducts(organizationId: string, search?: string): Promise<CrmProduct[]>;
    createProduct(organizationId: string, data: CrmProductInput): Promise<CrmProduct>;
    getDealItems(organizationId: string, leadId: string): Promise<CrmDealItem[]>;
    addDealItem(organizationId: string, leadId: string, input: CrmDealItemInput): Promise<CrmDealItem>;
    removeDealItem(organizationId: string, leadId: string, itemId: string): Promise<void>;

    // Documentos Comerciais
    listDocuments(organizationId: string, leadId?: string): Promise<CrmCommercialDocument[]>;
    createDocument(organizationId: string, input: CrmDocumentInput): Promise<CrmCommercialDocument>;
    updateDocumentStatus(organizationId: string, documentId: string, status: string): Promise<CrmCommercialDocument>;
}
