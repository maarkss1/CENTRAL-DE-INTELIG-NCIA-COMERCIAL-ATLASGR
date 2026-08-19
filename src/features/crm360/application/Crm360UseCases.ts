import type { ICrm360Repository } from '../domain/ICrm360Repository.js';
import type { CrmDealItemInput, CrmDocumentInput, CrmDocumentUpdateInput, CrmProductInput } from '../crm360.schema.js';

export class Crm360UseCases {
    constructor(private crm360Repository: ICrm360Repository) {}

    async getOverview(organizationId: string) {
        return this.crm360Repository.getOverviewData(organizationId);
    }

    async getPipelines(organizationId: string) {
        return this.crm360Repository.getPipelines(organizationId);
    }

    async getBoardLeads(organizationId: string, funnel?: string, pipelineId?: string) {
        return this.crm360Repository.getBoardLeads(organizationId, funnel, pipelineId);
    }

    async updateLeadStage(organizationId: string, leadId: string, stageId: string, expectedCloseDate?: Date, actorUserId?: string) {
        return this.crm360Repository.updateLeadStage(organizationId, leadId, stageId, expectedCloseDate, actorUserId);
    }

    async convertLead(organizationId: string, leadId: string) {
        return this.crm360Repository.convertLead(organizationId, leadId);
    }

    async listProducts(organizationId: string, search?: string) {
        return this.crm360Repository.listProducts(organizationId, search);
    }

    async createProduct(organizationId: string, data: CrmProductInput) {
        return this.crm360Repository.createProduct(organizationId, data);
    }

    async getDealItems(organizationId: string, leadId: string) {
        return this.crm360Repository.getDealItems(organizationId, leadId);
    }

    async addDealItem(organizationId: string, leadId: string, input: CrmDealItemInput) {
        return this.crm360Repository.addDealItem(organizationId, leadId, input);
    }

    async removeDealItem(organizationId: string, leadId: string, itemId: string) {
        return this.crm360Repository.removeDealItem(organizationId, leadId, itemId);
    }

    async listDocuments(organizationId: string, leadId?: string) {
        return this.crm360Repository.listDocuments(organizationId, leadId);
    }

    async createDocument(organizationId: string, input: CrmDocumentInput, actorUserId?: string) {
        return this.crm360Repository.createDocument(organizationId, input, actorUserId);
    }

    async updateDocumentContent(organizationId: string, documentId: string, input: CrmDocumentUpdateInput, actorUserId?: string) {
        return this.crm360Repository.updateDocumentContent(organizationId, documentId, input, actorUserId);
    }

    async listDocumentVersions(organizationId: string, documentId: string) {
        return this.crm360Repository.listDocumentVersions(organizationId, documentId);
    }

    async updateDocumentStatus(organizationId: string, documentId: string, status: string) {
        return this.crm360Repository.updateDocumentStatus(organizationId, documentId, status);
    }

    /** Rota pública — sem organizationId conhecido a priori, ver `PrismaCrm360Repository.recordDocumentView`. */
    async recordDocumentView(publicToken: string) {
        return this.crm360Repository.recordDocumentView(publicToken);
    }
}
