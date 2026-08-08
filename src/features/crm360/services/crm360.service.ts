import {
    CrmDocumentStatus,
    CrmDocumentType,
    CrmPipelineEntity,
    CrmProductType,
    LeadFunnel,
    LeadStatus,
    Prisma,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { fromPrismaActivityStatus, fromPrismaActivityType, fromPrismaLeadStatus, toPrismaLeadStatus } from '../../../lib/enumMap.js';
import type { CrmDealItemInput, CrmDocumentInput } from '../crm360.schema.js';

type DefaultStage = {
    name: string;
    code: string;
    color: string;
    probability: number;
    leadStatus: LeadStatus;
    isWon?: boolean;
    isLost?: boolean;
};

const LEAD_STAGES: DefaultStage[] = [
    { name: 'Lead Recebido', code: 'lead-recebido', color: '#3b82f6', probability: 5, leadStatus: LeadStatus.Lead_Recebido },
    { name: 'Cadência Iniciada', code: 'cadencia-iniciada', color: '#6366f1', probability: 10, leadStatus: LeadStatus.Cadencia_Iniciada },
    { name: 'Qualificação (SDR)', code: 'qualificacao-sdr', color: '#8b5cf6', probability: 25, leadStatus: LeadStatus.Qualificacao_SDR },
    { name: 'Reunião Agendada', code: 'reuniao-agendada', color: '#06b6d4', probability: 45, leadStatus: LeadStatus.Reuniao_Agendada },
    { name: 'Convertido em Oportunidade', code: 'convertido', color: '#10b981', probability: 60, leadStatus: LeadStatus.Convertido_em_Oportunidade },
    { name: 'Lead Desqualificado', code: 'desqualificado', color: '#ef4444', probability: 0, leadStatus: LeadStatus.Lead_Desqualificado, isLost: true },
];

const DEAL_STAGES: DefaultStage[] = [
    { name: 'Nova Oportunidade', code: 'nova-oportunidade', color: '#3b82f6', probability: 15, leadStatus: LeadStatus.Nova_Oportunidade },
    { name: 'Proposta Enviada', code: 'proposta-enviada', color: '#8b5cf6', probability: 45, leadStatus: LeadStatus.Proposta_Enviada },
    { name: 'Call/Visita Agendada', code: 'call-visita', color: '#06b6d4', probability: 60, leadStatus: LeadStatus.Call_Visita_Agendada },
    { name: 'Piloto VTECH', code: 'piloto-vtech', color: '#f59e0b', probability: 70, leadStatus: LeadStatus.Piloto_VTECH },
    { name: 'Piloto Atlas Profile', code: 'piloto-profile', color: '#f97316', probability: 75, leadStatus: LeadStatus.Piloto_Atlas_Profile },
    { name: 'Piloto Atlas Profile - Concluído', code: 'piloto-profile-concluido', color: '#84cc16', probability: 85, leadStatus: LeadStatus.Piloto_Atlas_Profile_Concluido },
    { name: 'Piloto Atlas Profile - Cancelado', code: 'piloto-profile-cancelado', color: '#f43f5e', probability: 0, leadStatus: LeadStatus.Piloto_Atlas_Profile_Cancelado, isLost: true },
    { name: 'Piloto Logística', code: 'piloto-logistica', color: '#eab308', probability: 75, leadStatus: LeadStatus.Piloto_Logistica },
    { name: 'Piloto Logístico - Concluído', code: 'piloto-logistico-concluido', color: '#22c55e', probability: 90, leadStatus: LeadStatus.Piloto_Logistico_Concluido },
    { name: 'Piloto Logístico - Cancelado', code: 'piloto-logistico-cancelado', color: '#ef4444', probability: 0, leadStatus: LeadStatus.Piloto_Logistico_Cancelado, isLost: true },
    { name: 'Negócios Ganhos', code: 'ganho', color: '#10b981', probability: 100, leadStatus: LeadStatus.Negocios_Ganhos, isWon: true },
    { name: 'Negócios Perdidos', code: 'perdido', color: '#dc2626', probability: 0, leadStatus: LeadStatus.Negocios_Perdidos, isLost: true },
];

const CLOSED_DEAL_STATUSES = [LeadStatus.Negocios_Ganhos, LeadStatus.Negocios_Perdidos];

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateItem(input: CrmDealItemInput) {
    const discounted = input.quantity * input.unitPrice * (1 - input.discountPercent / 100);
    return { ...input, total: roundMoney(discounted * (1 + input.taxPercent / 100)) };
}

function prismaLeadStatus(value?: string | null): LeadStatus | null {
    if (!value) return null;
    const normalized = toPrismaLeadStatus(value as Parameters<typeof toPrismaLeadStatus>[0]);
    return Object.values(LeadStatus).includes(normalized as LeadStatus) ? normalized as LeadStatus : null;
}

async function upsertDefaultPipeline(
    organizationId: string,
    name: string,
    entity: CrmPipelineEntity,
    sortOrder: number,
    stages: DefaultStage[],
) {
    const pipeline = await prisma.crmPipeline.upsert({
        where: { organizationId_name: { organizationId, name } },
        update: { active: true, isDefault: true, entity, sortOrder },
        create: {
            name,
            entity,
            isDefault: true,
            sortOrder,
            organizationId,
            stages: {
                create: stages.map((stage, index) => ({ ...stage, sortOrder: index })),
            },
        },
        include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });

    if (pipeline.stages.length === 0) {
        await prisma.crmPipelineStage.createMany({
            data: stages.map((stage, index) => ({ ...stage, sortOrder: index, pipelineId: pipeline.id })),
            skipDuplicates: true,
        });
    }

    return prisma.crmPipeline.findFirstOrThrow({
        where: { id: pipeline.id, organizationId },
        include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
}

async function attachLegacyRecords(organizationId: string, pipeline: Awaited<ReturnType<typeof upsertDefaultPipeline>>, funnel: LeadFunnel) {
    for (const stage of pipeline.stages) {
        if (!stage.leadStatus) continue;
        await prisma.lead.updateMany({
            where: { organizationId, funnel, status: stage.leadStatus, pipelineId: null },
            data: { pipelineId: pipeline.id, pipelineStageId: stage.id, probability: stage.probability },
        });
    }
}

export async function ensureDefaultPipelines(organizationId: string) {
    const leadPipeline = await upsertDefaultPipeline(organizationId, 'Funil de Leads', CrmPipelineEntity.Lead, 0, LEAD_STAGES);
    const dealPipeline = await upsertDefaultPipeline(organizationId, 'Funil de Negócios', CrmPipelineEntity.Negocio, 1, DEAL_STAGES);
    await attachLegacyRecords(organizationId, leadPipeline, LeadFunnel.Lead);
    await attachLegacyRecords(organizationId, dealPipeline, LeadFunnel.Negocio);
    return { leadPipeline, dealPipeline };
}

async function refreshLeadAmount(organizationId: string, leadId: string) {
    const aggregate = await prisma.crmDealItem.aggregate({
        where: { organizationId, leadId },
        _sum: { total: true },
    });
    return prisma.lead.update({
        where: { id: leadId, organizationId },
        data: { amount: roundMoney(aggregate._sum.total ?? 0) },
    });
}

export const crm360Service = {
    async overview(organizationId: string) {
        await ensureDefaultPipelines(organizationId);
        const now = new Date();
        const startToday = new Date(now);
        startToday.setHours(0, 0, 0, 0);
        const endToday = new Date(startToday);
        endToday.setDate(endToday.getDate() + 1);

        const [
            leads, openDeals, wonDeals, lostDeals, pipelineValue, overdueActivities,
            todayActivities, pendingDocuments, focusActivities, recentDeals, stageCounts,
        ] = await prisma.$transaction([
            prisma.lead.count({ where: { organizationId, funnel: LeadFunnel.Lead } }),
            prisma.lead.count({ where: { organizationId, funnel: LeadFunnel.Negocio, status: { notIn: CLOSED_DEAL_STATUSES } } }),
            prisma.lead.count({ where: { organizationId, funnel: LeadFunnel.Negocio, status: LeadStatus.Negocios_Ganhos } }),
            prisma.lead.count({ where: { organizationId, funnel: LeadFunnel.Negocio, status: LeadStatus.Negocios_Perdidos } }),
            prisma.lead.findMany({
                where: { organizationId, funnel: LeadFunnel.Negocio, status: { notIn: CLOSED_DEAL_STATUSES } },
                select: { amount: true, probability: true },
            }),
            prisma.activity.count({ where: { organizationId, status: { in: ['Pendente', 'Em_andamento'] }, date: { lt: startToday } } }),
            prisma.activity.count({ where: { organizationId, status: { in: ['Pendente', 'Em_andamento'] }, date: { gte: startToday, lt: endToday } } }),
            prisma.crmCommercialDocument.count({ where: { organizationId, status: { in: [CrmDocumentStatus.Rascunho, CrmDocumentStatus.Enviado, CrmDocumentStatus.Visualizado] } } }),
            prisma.activity.findMany({
                where: { organizationId, status: { in: ['Pendente', 'Em_andamento'] } },
                orderBy: [{ date: 'asc' }, { time: 'asc' }],
                take: 12,
                include: { lead: { include: { company: true, contact: true } } },
            }),
            prisma.lead.findMany({
                where: { organizationId, funnel: LeadFunnel.Negocio },
                orderBy: { updatedAt: 'desc' },
                take: 8,
                include: { company: true, contact: true, pipelineStage: true },
            }),
            prisma.lead.groupBy({
                where: { organizationId },
                by: ['funnel', 'status'] as const,
                orderBy: [{ funnel: 'asc' }, { status: 'asc' }],
                _count: { _all: true },
                _sum: { amount: true },
            }),
        ]);

        const totalPipeline = pipelineValue.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
        const weightedPipeline = pipelineValue.reduce((sum, deal) => sum + (deal.amount ?? 0) * ((deal.probability ?? 0) / 100), 0);

        return {
            kpis: {
                leads,
                openDeals,
                wonDeals,
                lostDeals,
                conversionRate: wonDeals + lostDeals > 0 ? roundMoney((wonDeals / (wonDeals + lostDeals)) * 100) : 0,
                pipelineValue: roundMoney(totalPipeline),
                weightedPipeline: roundMoney(weightedPipeline),
                overdueActivities,
                todayActivities,
                pendingDocuments,
            },
            focusActivities: focusActivities.map((activity) => ({
                ...activity,
                type: fromPrismaActivityType(activity.type),
                status: fromPrismaActivityStatus(activity.status),
                lead: activity.lead ? { ...activity.lead, status: fromPrismaLeadStatus(activity.lead.status) } : null,
            })),
            recentDeals: recentDeals.map((deal) => ({ ...deal, status: fromPrismaLeadStatus(deal.status) })),
            // Prisma não especializa o tipo de retorno de groupBy() dentro de um array de
            // $transaction heterogêneo — o shape real de _count/_sum aqui é garantido pelos
            // parâmetros explícitos `_count: { _all: true }` e `_sum: { amount: true }` acima.
            stageCounts: stageCounts.map((row) => {
                const count = row._count as unknown as { _all: number };
                const sum = row._sum as unknown as { amount: number | null };
                return {
                    funnel: row.funnel,
                    status: fromPrismaLeadStatus(row.status),
                    count: count._all,
                    amount: sum.amount ?? 0,
                };
            }),
        };
    },

    async listPipelines(organizationId: string) {
        await ensureDefaultPipelines(organizationId);
        return prisma.crmPipeline.findMany({
            where: { organizationId },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            include: { stages: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { leads: true } } } } },
        });
    },

    async createPipeline(organizationId: string, input: {
        name: string;
        entity: 'Lead' | 'Negocio' | 'SmartProcess';
        isDefault: boolean;
        active: boolean;
        sortOrder: number;
        currency: string;
        stages: Array<{
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
        }>;
    }) {
        const entity = CrmPipelineEntity[input.entity];
        return prisma.crmPipeline.create({
            data: {
                name: input.name,
                entity,
                isDefault: input.isDefault,
                active: input.active,
                sortOrder: input.sortOrder,
                currency: input.currency.toUpperCase(),
                organizationId,
                stages: {
                    create: input.stages.map((stage) => ({
                        ...stage,
                        leadStatus: prismaLeadStatus(stage.leadStatus),
                        automation: stage.automation as Prisma.InputJsonValue | undefined,
                    })),
                },
            },
            include: { stages: { orderBy: { sortOrder: 'asc' } } },
        });
    },

    async moveRecord(organizationId: string, leadId: string, stageId: string) {
        const requestedStage = await prisma.crmPipelineStage.findFirst({
            where: { id: stageId, pipeline: { organizationId, active: true } },
            include: { pipeline: true },
        });
        if (!requestedStage) throw new Error('Etapa do pipeline não encontrada');

        let stage = requestedStage;
        if (requestedStage.tunnelTargetStageId) {
            const target = await prisma.crmPipelineStage.findFirst({
                where: { id: requestedStage.tunnelTargetStageId, pipeline: { organizationId, active: true } },
                include: { pipeline: true },
            });
            if (target) stage = target;
        }

        const funnel = stage.pipeline.entity === CrmPipelineEntity.Negocio ? LeadFunnel.Negocio : LeadFunnel.Lead;
        const isClosed = stage.isWon || stage.isLost;
        return prisma.lead.update({
            where: { id: leadId, organizationId },
            data: {
                funnel,
                pipelineId: stage.pipelineId,
                pipelineStageId: stage.id,
                probability: stage.probability,
                ...(stage.leadStatus ? { status: stage.leadStatus } : {}),
                closedAt: isClosed ? new Date() : null,
                timeline: {
                    create: {
                        type: requestedStage.tunnelTargetStageId ? 'tunnel' : 'movement',
                        description: `Movido para ${stage.pipeline.name} › ${stage.name}`,
                    },
                },
            },
            include: { company: true, contact: true, pipeline: true, pipelineStage: true },
        });
    },

    async createDeal(organizationId: string, input: {
        title: string;
        companyId?: string | null;
        contactId?: string | null;
        owner?: string | null;
        source?: string | null;
        amount: number;
        currency: string;
        probability?: number | null;
        expectedCloseAt?: string | null;
        pipelineId?: string;
        pipelineStageId?: string;
        customFields?: Record<string, unknown> | null;
    }) {
        const { dealPipeline } = await ensureDefaultPipelines(organizationId);
        const pipelineId = input.pipelineId ?? dealPipeline.id;
        const pipeline = await prisma.crmPipeline.findFirst({ where: { id: pipelineId, organizationId, entity: CrmPipelineEntity.Negocio } });
        if (!pipeline) throw new Error('Pipeline de negócios não encontrado');
        const stage = input.pipelineStageId
            ? await prisma.crmPipelineStage.findFirst({ where: { id: input.pipelineStageId, pipelineId, pipeline: { organizationId } } })
            : await prisma.crmPipelineStage.findFirst({ where: { pipelineId }, orderBy: { sortOrder: 'asc' } });
        if (!stage) throw new Error('O pipeline não possui etapas');

        return prisma.lead.create({
            data: {
                funnel: LeadFunnel.Negocio,
                status: stage.leadStatus ?? LeadStatus.Nova_Oportunidade,
                title: input.title,
                companyId: input.companyId,
                contactId: input.contactId,
                owner: input.owner,
                source: input.source,
                amount: input.amount,
                currency: input.currency.toUpperCase(),
                probability: input.probability ?? stage.probability,
                expectedCloseAt: input.expectedCloseAt ? new Date(input.expectedCloseAt) : null,
                pipelineId,
                pipelineStageId: stage.id,
                customFields: input.customFields as Prisma.InputJsonValue | undefined,
                organizationId,
                timeline: { create: { type: 'creation', description: `Negócio criado em ${pipeline.name} › ${stage.name}` } },
            },
            include: { company: true, contact: true, pipeline: true, pipelineStage: true },
        });
    },

    async convertLead(organizationId: string, leadId: string) {
        const { dealPipeline } = await ensureDefaultPipelines(organizationId);
        const stage = dealPipeline.stages[0];
        if (!stage) throw new Error('O funil de negócios não possui etapa inicial');
        return prisma.lead.update({
            where: { id: leadId, organizationId },
            data: {
                funnel: LeadFunnel.Negocio,
                status: stage.leadStatus ?? LeadStatus.Nova_Oportunidade,
                pipelineId: dealPipeline.id,
                pipelineStageId: stage.id,
                probability: stage.probability,
                closedAt: null,
                timeline: { create: { type: 'conversion', description: 'Lead convertido em negócio' } },
            },
            include: { company: true, contact: true, pipeline: true, pipelineStage: true },
        });
    },

    async listProducts(organizationId: string, query?: string) {
        return prisma.crmProduct.findMany({
            where: {
                organizationId,
                ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { sku: { contains: query, mode: 'insensitive' } }, { category: { contains: query, mode: 'insensitive' } }] } : {}),
            },
            orderBy: [{ active: 'desc' }, { name: 'asc' }],
        });
    },

    createProduct(organizationId: string, input: {
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
        customFields?: Record<string, unknown> | null;
    }) {
        return prisma.crmProduct.create({
            data: {
                ...input,
                type: CrmProductType[input.type],
                currency: input.currency.toUpperCase(),
                customFields: input.customFields as Prisma.InputJsonValue | undefined,
                organizationId,
            },
        });
    },

    updateProduct(organizationId: string, id: string, input: Partial<{
        name: string;
        description: string | null;
        sku: string | null;
        type: 'Produto' | 'Servico';
        category: string | null;
        unit: string;
        price: number;
        cost: number | null;
        currency: string;
        taxPercent: number;
        active: boolean;
        stockQuantity: number | null;
        customFields: Record<string, unknown> | null;
    }>) {
        const { customFields, ...rest } = input;
        return prisma.crmProduct.update({
            where: { id, organizationId },
            data: {
                ...rest,
                ...(rest.type ? { type: CrmProductType[rest.type] } : {}),
                ...(rest.currency ? { currency: rest.currency.toUpperCase() } : {}),
                ...(customFields !== undefined
                    ? { customFields: customFields === null ? Prisma.JsonNull : (customFields as Prisma.InputJsonValue) }
                    : {}),
            },
        });
    },

    async archiveProduct(organizationId: string, id: string) {
        return prisma.crmProduct.update({ where: { id, organizationId }, data: { active: false } });
    },

    async listDealItems(organizationId: string, leadId: string) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true } });
        if (!lead) throw new Error('Negócio não encontrado');
        return prisma.crmDealItem.findMany({ where: { organizationId, leadId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { product: true } });
    },

    async addDealItem(organizationId: string, leadId: string, input: CrmDealItemInput) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true } });
        if (!lead) throw new Error('Negócio não encontrado');
        if (input.productId) {
            const product = await prisma.crmProduct.findFirst({ where: { id: input.productId, organizationId } });
            if (!product) throw new Error('Produto não encontrado');
        }
        const item = await prisma.crmDealItem.create({ data: { ...calculateItem(input), leadId, organizationId } });
        await refreshLeadAmount(organizationId, leadId);
        return item;
    },

    async updateDealItem(organizationId: string, leadId: string, id: string, input: CrmDealItemInput) {
        const item = await prisma.crmDealItem.update({
            where: { id, organizationId },
            data: { ...calculateItem(input), leadId },
        });
        await refreshLeadAmount(organizationId, leadId);
        return item;
    },

    async deleteDealItem(organizationId: string, leadId: string, id: string) {
        await prisma.crmDealItem.delete({ where: { id, organizationId, leadId } });
        await refreshLeadAmount(organizationId, leadId);
    },

    async listDocuments(organizationId: string, query?: string) {
        return prisma.crmCommercialDocument.findMany({
            where: {
                organizationId,
                ...(query ? { OR: [{ number: { contains: query, mode: 'insensitive' } }, { title: { contains: query, mode: 'insensitive' } }] } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: { lead: { include: { company: true, contact: true } }, company: true, contact: true },
        });
    },

    async createDocument(organizationId: string, input: CrmDocumentInput) {
        if (input.leadId) {
            const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId }, include: { company: true, contact: true } });
            if (!lead) throw new Error('Negócio não encontrado');
            input.companyId ??= lead.companyId;
            input.contactId ??= lead.contactId;
        }
        const calculated = input.lineItems.map((item) => calculateItem({ ...item, sortOrder: 0 }));
        const subtotal = roundMoney(calculated.reduce((sum, item) => sum + item.quantity * item.unitPrice * (1 - item.discountPercent / 100), 0));
        const tax = roundMoney(calculated.reduce((sum, item) => sum + item.total, 0) - subtotal);
        const number = input.number ?? `${input.type.toUpperCase()}-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
        return prisma.crmCommercialDocument.create({
            data: {
                number,
                type: CrmDocumentType[input.type],
                status: CrmDocumentStatus[input.status],
                title: input.title,
                currency: input.currency.toUpperCase(),
                issueDate: input.issueDate ? new Date(input.issueDate) : new Date(),
                validUntil: input.validUntil ? new Date(input.validUntil) : null,
                dueDate: input.dueDate ? new Date(input.dueDate) : null,
                subtotal,
                discount: input.discount,
                tax,
                total: roundMoney(Math.max(0, subtotal + tax - input.discount)),
                lineItems: calculated as unknown as Prisma.InputJsonValue,
                notes: input.notes,
                terms: input.terms,
                leadId: input.leadId,
                companyId: input.companyId,
                contactId: input.contactId,
                organizationId,
            },
            include: { lead: true, company: true, contact: true },
        });
    },

    async updateDocumentStatus(organizationId: string, id: string, status: CrmDocumentStatus) {
        return prisma.crmCommercialDocument.update({ where: { id, organizationId }, data: { status } });
    },

    async search(organizationId: string, query: string) {
        const q = query.trim();
        if (q.length < 2) return { leads: [], companies: [], contacts: [], products: [], documents: [] };
        const [leads, companies, contacts, products, documents] = await prisma.$transaction([
            prisma.lead.findMany({ where: { organizationId, OR: [{ title: { contains: q, mode: 'insensitive' } }, { company: { tradeName: { contains: q, mode: 'insensitive' } } }, { contact: { name: { contains: q, mode: 'insensitive' } } }] }, take: 8, include: { company: true, contact: true } }),
            prisma.company.findMany({ where: { organizationId, OR: [{ legalName: { contains: q, mode: 'insensitive' } }, { tradeName: { contains: q, mode: 'insensitive' } }, { cnpj: { contains: q } }] }, take: 8 }),
            prisma.contact.findMany({ where: { organizationId, OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }, take: 8, include: { company: true } }),
            prisma.crmProduct.findMany({ where: { organizationId, OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] }, take: 8 }),
            prisma.crmCommercialDocument.findMany({ where: { organizationId, OR: [{ number: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }] }, take: 8 }),
        ]);
        return { leads: leads.map((lead) => ({ ...lead, status: fromPrismaLeadStatus(lead.status) })), companies, contacts, products, documents };
    },
};
