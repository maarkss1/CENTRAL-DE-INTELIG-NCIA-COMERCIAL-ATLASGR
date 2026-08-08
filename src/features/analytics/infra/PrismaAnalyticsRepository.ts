import { prisma } from '../../../lib/prisma.js';
import type { AnalyticsRepository, GroupCount, ClosedLead } from '../domain/Analytics';

export class PrismaAnalyticsRepository implements AnalyticsRepository {
    async countCompanies(organizationId: string): Promise<number> {
        return prisma.company.count({ where: { organizationId, deletedAt: null } });
    }

    async countContacts(organizationId: string): Promise<number> {
        return prisma.contact.count({ where: { organizationId, deletedAt: null } });
    }

    async countOpenLeads(organizationId: string): Promise<number> {
        return prisma.lead.count({
            where: { organizationId, deletedAt: null, status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos'] } },
        });
    }

    async countAllLeads(organizationId: string): Promise<number> {
        return prisma.lead.count({ where: { organizationId, deletedAt: null } });
    }

    async countActivities(organizationId: string): Promise<number> {
        return prisma.activity.count({ where: { organizationId, deletedAt: null } });
    }

    async countPendingActivities(organizationId: string): Promise<number> {
        return prisma.activity.count({ where: { organizationId, deletedAt: null, status: 'Pendente' } });
    }

    // Atrasada = pendente com data no passado. É o número que o time comercial cobra.
    async countOverdueActivities(organizationId: string, now: Date): Promise<number> {
        return prisma.activity.count({
            where: { organizationId, deletedAt: null, status: 'Pendente', date: { lt: now } },
        });
    }

    // closedAt (não updatedAt: esse é @updatedAt e sobe em QUALQUER update do lead — sync do
    // Bitrix, uma ligação do SDR de voz tocando só lastInteraction — não só em fechamento).
    async countLeadsByStatusSince(organizationId: string, status: string, since: Date): Promise<number> {
        return prisma.lead.count({
            where: { organizationId, deletedAt: null, status: status as never, closedAt: { gte: since } },
        });
    }

    async countLeadsByStatus(organizationId: string, status: string): Promise<number> {
        return prisma.lead.count({ where: { organizationId, deletedAt: null, status: status as never } });
    }

    async averageOpenLeadScore(organizationId: string): Promise<number | null> {
        const result = await prisma.lead.aggregate({
            where: {
                organizationId,
                deletedAt: null,
                status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos'] },
                score: { not: null },
            },
            _avg: { score: true },
        });
        return result._avg.score ?? null;
    }

    async groupLeadsByStatus(organizationId: string): Promise<GroupCount[]> {
        const rows = await prisma.lead.groupBy({
            by: ['status'],
            where: { organizationId, deletedAt: null },
            _count: { _all: true },
        });
        return rows.map((row) => ({ value: row.status, count: row._count._all }));
    }

    async findLeadsCreatedSince(organizationId: string, since: Date): Promise<Array<{ createdAt: Date }>> {
        return prisma.lead.findMany({
            where: { organizationId, deletedAt: null, createdAt: { gte: since } },
            select: { createdAt: true },
        });
    }

    // closedAt (não updatedAt) — mesmo motivo de countLeadsByStatusSince acima.
    async findLeadsClosedSince(organizationId: string, since: Date): Promise<ClosedLead[]> {
        const rows = await prisma.lead.findMany({
            where: { organizationId, deletedAt: null, status: { in: ['Negocios_Ganhos', 'Negocios_Perdidos'] }, closedAt: { gte: since } },
            select: { closedAt: true, status: true },
        });
        // closedAt não pode ser null aqui: a query acima já filtra `closedAt: { gte: since }`.
        return rows.map((row) => ({ closedAt: row.closedAt as Date, status: row.status }));
    }

    async groupLeadsByTemperature(organizationId: string): Promise<GroupCount[]> {
        const rows = await prisma.lead.groupBy({
            by: ['temperature'],
            where: { organizationId, deletedAt: null },
            _count: { _all: true },
        });
        return rows.map((row) => ({ value: row.temperature, count: row._count._all }));
    }

    async groupLeadsBySource(organizationId: string): Promise<GroupCount[]> {
        const rows = await prisma.lead.groupBy({
            by: ['source'],
            where: { organizationId, deletedAt: null },
            _count: { _all: true },
        });
        return rows.map((row) => ({ value: row.source, count: row._count._all }));
    }

    async groupLeadsByOwner(organizationId: string, status?: string): Promise<GroupCount[]> {
        const rows = await prisma.lead.groupBy({
            by: ['owner'],
            where: { organizationId, deletedAt: null, ...(status ? { status: status as never } : {}) },
            _count: { _all: true },
        });
        return rows.map((row) => ({ value: row.owner, count: row._count._all }));
    }

    async groupActivitiesByType(organizationId: string): Promise<GroupCount[]> {
        const rows = await prisma.activity.groupBy({
            by: ['type'],
            where: { organizationId, deletedAt: null },
            _count: { _all: true },
        });
        return rows.map((row) => ({ value: row.type, count: row._count._all }));
    }

    async groupActivitiesByStatus(organizationId: string): Promise<GroupCount[]> {
        const rows = await prisma.activity.groupBy({
            by: ['status'],
            where: { organizationId, deletedAt: null },
            _count: { _all: true },
        });
        return rows.map((row) => ({ value: row.status, count: row._count._all }));
    }
}
