import { Lead, LeadRepository } from '../domain/Lead';
import { prisma } from '../../../lib/prisma';
import { Prisma } from '@prisma/client';
import type { LeadStatus } from '../../../lib/zod';
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
            where.status = toPrismaLeadStatus(status as LeadStatus) as unknown as Prisma.LeadWhereInput['status'];
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
                status: toPrismaLeadStatus(data.status as LeadStatus) as unknown as Prisma.LeadCreateInput['status'],
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
        // Não fazemos findFirst prévio: se o lead não existir (ou não pertencer ao org),
        // o Prisma lança P2025 que o errorHandler mapeia para 404 — sem N+1 queries.
        // O `where` inclui organizationId para garantir isolamento de tenant.
        const lead = await prisma.lead.update({
            where: { id, organizationId },
            data: {
                ...data,
                ...(data.status ? { status: toPrismaLeadStatus(data.status as LeadStatus) as unknown as Prisma.LeadUpdateInput['status'] } : {}),
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
        // Busca o status atual para compor a mensagem de timeline, e valida a existência + tenant
        // numa única query. Se não encontrar, lança Error que o errorHandler converte em 404.
        const currentLead = await prisma.lead.findFirst({ where: { id, organizationId } });
        if (!currentLead) throw new Error('Lead not found');

        const previousStatusLabel = fromPrismaLeadStatus(currentLead.status);
        // O `where` inclui organizationId para garantir isolamento de tenant no update.
        const lead = await prisma.lead.update({
            where: { id, organizationId },
            data: {
                status: toPrismaLeadStatus(newStatus as LeadStatus) as unknown as Prisma.LeadUpdateInput['status'],
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
        // CORREÇÃO: Usar soft delete (update com deletedAt) em vez de hard delete.
        // A chamada direta a prisma.lead.delete() bypassava a extensão em prisma.ts que
        // intercepta deletes e os converte para update com deletedAt — o registro era
        // removido fisicamente do banco. Agora aplicamos o soft delete explicitamente,
        // garantindo consistência com o resto do sistema (filtros de findMany, cascade, etc.).
        // O `where` inclui organizationId para garantir isolamento de tenant.
        const lead = await prisma.lead.update({
            where: { id, organizationId },
            data: { deletedAt: new Date() },
        }).catch((err) => {
            // Prisma lança P2025 quando o registro não existe — propagamos como erro simples
            // para o errorHandler mapear para 404.
            if (err?.code === 'P2025') throw new Error('Lead not found');
            throw err;
        });
        return lead as unknown as Lead;
    }

    async findAllForExport(organizationId: string): Promise<Lead[]> {
        const leads = await prisma.lead.findMany({
            where: { organizationId },
            include: { company: true, contact: true },
            orderBy: { createdAt: 'desc' },
        });
        // CORREÇÃO: Aplicar serializeLead para converter enums internos do Prisma
        // (ex: 'Novo_Lead') para os rótulos legíveis usados na UI e no CSV
        // (ex: 'Novo Lead'). Sem isso, o Bitrix24 recebia valores ilegíveis.
        return leads.map(serializeLead) as unknown as Lead[];
    }
}
