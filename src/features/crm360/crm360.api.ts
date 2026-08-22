import { api } from '../../lib/api';
import type {
    CrmCommercialDocument,
    CrmCommercialDocumentVersionDTO,
    CrmDocumentLineItem,
    CrmProduct,
} from './crm360.types';

export interface CrmDocumentInput {
    number?: string;
    type: CrmCommercialDocument['type'];
    status?: CrmCommercialDocument['status'];
    title: string;
    currency?: string;
    issueDate?: string;
    validUntil?: string | null;
    dueDate?: string | null;
    discount?: number;
    lineItems: CrmDocumentLineItem[];
    notes?: string | null;
    terms?: string | null;
    leadId?: string | null;
    companyId?: string | null;
    contactId?: string | null;
}

export interface CrmDocumentUpdateInput {
    title: string;
    currency?: string;
    validUntil?: string | null;
    dueDate?: string | null;
    discount?: number;
    lineItems: CrmDocumentLineItem[];
    notes?: string | null;
    terms?: string | null;
    changeReason?: string | null;
}

export const crm360Api = {
    listDocuments: (leadId?: string) =>
        api.get<CrmCommercialDocument[]>(`/api/crm/documents${leadId ? `?leadId=${encodeURIComponent(leadId)}` : ''}`),
    createDocument: (input: CrmDocumentInput) =>
        api.post<CrmCommercialDocument>('/api/crm/documents', input),
    updateDocument: (id: string, input: CrmDocumentUpdateInput) =>
        api.put<CrmCommercialDocument>(`/api/crm/documents/${id}`, input),
    updateDocumentStatus: (id: string, status: CrmCommercialDocument['status']) =>
        api.put<CrmCommercialDocument>(`/api/crm/documents/${id}/status`, { status }),
    listDocumentVersions: (id: string) =>
        api.get<CrmCommercialDocumentVersionDTO[]>(`/api/crm/documents/${id}/versions`),
    requestSignature: (id: string, input: { signerEmail?: string; signerName?: string }) =>
        api.post<{ id: string; providerRequestId: string | null }>(`/api/crm/documents/${id}/request-signature`, input),
    listProducts: (search?: string) =>
        api.get<CrmProduct[]>(`/api/crm/products${search ? `?q=${encodeURIComponent(search)}` : ''}`),
};
