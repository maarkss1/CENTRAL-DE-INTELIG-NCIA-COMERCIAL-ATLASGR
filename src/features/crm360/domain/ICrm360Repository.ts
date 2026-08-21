import type {
    CrmOverviewData,
    CrmPipeline,
    CrmProduct,
    CrmDealItem,
    CrmCommercialDocument,
    CrmCommercialDocumentVersionDTO,
    CrmPublicDocumentView
} from '../crm360.types.js';
import type { CrmDealItemInput, CrmDocumentInput, CrmDocumentSignatureRequestInput, CrmDocumentUpdateInput, CrmProductInput } from '../crm360.schema.js';

export interface ICrm360Repository {
    getOverviewData(organizationId: string): Promise<CrmOverviewData>;
    getPipelines(organizationId: string, entity?: string): Promise<CrmPipeline[]>;
    getBoardLeads(organizationId: string, funnel?: string, pipelineId?: string): Promise<{ stages: unknown[]; leads: unknown[] }>;
    /** `actorUserId` obrigatório quando o destino é uma etapa "ganho" (CYC-007 — ver `dealClosureGate.ts`). */
    updateLeadStage(organizationId: string, leadId: string, stageId: string, expectedCloseDate?: Date, actorUserId?: string): Promise<unknown>;
    convertLead(organizationId: string, leadId: string): Promise<unknown>;

    // Produtos & Itens de Negócio
    listProducts(organizationId: string, search?: string): Promise<CrmProduct[]>;
    createProduct(organizationId: string, data: CrmProductInput): Promise<CrmProduct>;
    getDealItems(organizationId: string, leadId: string): Promise<CrmDealItem[]>;
    addDealItem(organizationId: string, leadId: string, input: CrmDealItemInput): Promise<CrmDealItem>;
    removeDealItem(organizationId: string, leadId: string, itemId: string): Promise<void>;

    // Documentos Comerciais (CYC-005, onda 25: versionamento + rastreamento de visualização)
    listDocuments(organizationId: string, leadId?: string): Promise<CrmCommercialDocument[]>;
    createDocument(organizationId: string, input: CrmDocumentInput, actorUserId?: string): Promise<CrmCommercialDocument>;
    /** Cria uma nova `CrmCommercialDocumentVersion` (nunca sobrescreve a anterior) e atualiza os campos de conteúdo do documento. */
    updateDocumentContent(organizationId: string, documentId: string, input: CrmDocumentUpdateInput, actorUserId?: string): Promise<CrmCommercialDocument>;
    listDocumentVersions(organizationId: string, documentId: string): Promise<CrmCommercialDocumentVersionDTO[]>;
    /** Grava `sentAt` na primeira transição para `Enviado`, além de aplicar o novo status. */
    updateDocumentStatus(organizationId: string, documentId: string, status: string): Promise<CrmCommercialDocument>;
    /** Rota pública (sem tenant conhecido a priori) — resolve o documento pelo `publicToken` opaco e registra a visualização. `null` quando o token não existe ou o documento foi excluído. */
    recordDocumentView(publicToken: string): Promise<CrmPublicDocumentView | null>;

    /** CYC-006 (onda 28): solicita assinatura eletrônica real (provedor `'govbr'`, stub de transporte — ver `GovBrSignatureProviderPort.ts`). */
    requestDocumentSignature(organizationId: string, documentId: string, actorUserId: string | undefined, input: CrmDocumentSignatureRequestInput): Promise<{ id: string; providerRequestId: string }>;
}
