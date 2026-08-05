import { Repository } from '../../../shared/domain/Repository';
import { LeadStatus, LeadTemperature } from '@prisma/client';

export interface Lead {
    id: string;
    status: LeadStatus;
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
