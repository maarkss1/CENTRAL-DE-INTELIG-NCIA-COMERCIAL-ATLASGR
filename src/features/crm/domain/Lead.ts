import { Repository } from '../../../shared/domain/Repository';
import { LeadStatus, LeadTemperature } from '@prisma/client';

export interface Lead {
    id: string;
    status: LeadStatus;
    /** Qual dos dois Kanbans (Leads ou Negócios) este registro pertence agora. */
        source: string | null;
    channel: string | null;
    temperature: LeadTemperature | null;
    score: number | null;
    owner: string | null;
    lastInteraction: Date | null;
    nextAction: Date | null;
    closedAt: Date | null;
    companyId: string | null;
    contactId: string | null;
    organizationId: string | null;
    pic: string | null;
    qualification: Record<string, unknown> | null;
    // Campos comerciais espelhados do Bitrix24 (ver bitrixFieldMap.ts)
    resumeDate: Date | null;
    cadenceStage: string | null;
    lossReason: string | null;
    dealPackage: string | null;
    dealStatus: string | null;
    relationshipLevel: string | null;
    commissionPercent: string | null;
    partnerBroker: string | null;
    qualificationValidatedByAM: boolean | null;
    createdAt: Date;
    updatedAt: Date;
    company?: unknown;
    contact?: unknown;
    activities?: unknown[];
    timeline?: unknown[];
    internalNotes?: unknown[];
}

export interface LeadRepository extends Repository<Lead> {
    findAllWithFilters(organizationId: string, status?: string, page?: number, limit?: number): Promise<{ data: Lead[], meta: unknown }>;
    updateStatus(organizationId: string, id: string, newStatus: string): Promise<Lead>;
    findAllForExport(organizationId: string): Promise<Lead[]>;
}
