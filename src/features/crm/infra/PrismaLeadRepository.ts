import { Lead, LeadRepository } from '../domain/Lead';
import { prisma } from '../../../lib/prisma';
import { Prisma } from '@prisma/client';
import {
    toPrismaLeadStatus,
    fromPrismaLeadStatus,
    fromPrismaCompanyStatus,
    fromPrismaActivityType,
    fromPrismaActivityStatus,
} from '../../../lib/enumMap';

function serializeLead<
    T extends {
        status: string;
        company?: { status: string } | null;
        activities?: Array<{ type: string; status: string }>;
    }
>(lead: T): unknown {
    return {
        ...lead,
        status: fromPrismaLeadStatus(lead.status),
        ...(lead.company ? { company: { ...lead.company, status: fromPrismaCompanyStatus(lead.company.status) } } : {}),
        ...(lead.activities
            ? {
                  activities: lead.activities.map((a) => ({
                      ...a,
                      type: fromPrismaActivityType(a.type),
                      status: fromPrismaActivityStatus(a.status),
                  })),
              }
            : {}),
    };
}

export class PrismaLeadRepository implements LeadRepository {
    async findAllWithFilters(organizationId: string, status?: string, page: number = 1, limit: number = 50): Promise<{ data: Lead[], meta: unknown }> {
        const where: Prisma.LeadWhereInput = { organizationId };
        if (status) {
            where.status = toPrismaLeadStatus(status as unknown) as unknown as unknown;
        }

        const skip = (page - 1) * limit;

        const [leads, total] = await prisma.$transaction([
            prisma.lead.findMany({
                where,
                skip,
                take: limit,
                include: { company: true, contact: true },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.lead.count({ where })
        ]);

        return {
            data: leads.map(serializeLead) as unknown as Lead[],
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };
    }

    async findById(organizationId: string, id: string): Promise<Lead | null> {
        const lead = await prisma.lead.findFirst({
            where: { id, organizationId },
            include: {
                company: true,
                contact: true,
                activities: { orderBy: { date: 'desc' } },
                timeline: { orderBy: { createdAt: 'desc' } },
                internalNotes: { orderBy: { createdAt: 'desc' } }
            }
        });
        return lead ? (serializeLead(lead) as unknown as Lead) : null;
    }

    async create(organizationId: string, data: Partial<Lead> & { status: string }): Promise<Lead> {
        const lead = await prisma.lead.create({
            data: {
                ...data,
                status: toPrismaLeadStatus(data.status as unknown) as unknown as unknown,
                organizationId,
                company: undefined,
                contact: undefined,
                activities: undefined,
                internalNotes: undefined,
                timeline: {
                    create: {
                        type: 'creation',
                        description: 'Lead criado no sistema'
                    }
                }
            } as Prisma.LeadCreateInput,
            include: { company: true, contact: true }
        });
        return serializeLead(lead) as unknown as Lead;
    }

    async update(organizationId: string, id: string, data: Partial<Lead> & { status?: string }): Promise<Lead> {
        const currentLead = await prisma.lead.findFirst({ where: { id, organizationId } });
        if (!currentLead) throw new Error('Lead not found');

        const lead = await prisma.lead.update({
            where: { id },
            data: {
                ...data,
                ...(data.status ? { status: toPrismaLeadStatus(data.status as unknown) as unknown as unknown } : {}),
                organizationId: undefined,
                company: undefined,
                contact: undefined,
                activities: undefined,
                internalNotes: undefined,
                timeline: {
                    create: {
                        type: 'edition',
                        description: 'Dados do lead atualizados'
                    }
                }
            } as Prisma.LeadUpdateInput,
        });
        return serializeLead(lead) as unknown as Lead;
    }

    async updateStatus(organizationId: string, id: string, newStatus: string): Promise<Lead> {
        const currentLead = await prisma.lead.findFirst({ where: { id, organizationId } });
        if (!currentLead) throw new Error('Lead not found');

        const previousStatusLabel = fromPrismaLeadStatus(currentLead.status);
        const lead = await prisma.lead.update({
            where: { id },
            data: {
                status: toPrismaLeadStatus(newStatus as unknown) as unknown as unknown,
                timeline: {
                    create: {
                        type: 'movement',
                        description: `Lead movido de '${previousStatusLabel}' para '${newStatus}'`
                    }
                }
            },
            include: { company: true, contact: true, timeline: { orderBy: { createdAt: 'desc' }, take: 1 } }
        });
        return serializeLead(lead) as unknown as Lead;
    }

    async delete(organizationId: string, id: string): Promise<Lead> {
        const currentLead = await prisma.lead.findFirst({ where: { id, organizationId } });
        if (!currentLead) throw new Error('Lead not found');
        return prisma.lead.delete({ where: { id } }) as unknown as Lead;
    }

    async findAllForExport(organizationId: string): Promise<Lead[]> {
        const leads = await prisma.lead.findMany({
            where: { organizationId },
            include: { company: true, contact: true },
            orderBy: { createdAt: 'desc' },
        });
        return leads as unknown as Lead[];
    }
}
