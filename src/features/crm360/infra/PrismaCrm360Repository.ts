import {
    CrmDocumentStatus,
    CrmPipelineEntity,
    LeadFunnel,
    LeadStatus,
    Prisma,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { fromPrismaActivityStatus, fromPrismaActivityType, fromPrismaLeadStatus } from '../../../lib/enumMap.js';
import type { CrmDealItemInput, CrmDocumentInput, CrmProductInput } from '../crm360.schema.js';
import { recordStageTransition } from '../../commercial-intelligence/infra/stageHistory.js';
import type { ICrm360Repository } from '../domain/ICrm360Repository.js';
import type { CrmCommercialDocument, CrmDealItem, CrmOverviewData, CrmPipeline, CrmProduct } from '../crm360.types.js';

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

const CLOSED_DEAL_STATUSES: LeadStatus[] = [LeadStatus.Negocios_Ganhos, LeadStatus.Negocios_Perdidos];

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateItem<T extends { quantity: number; unitPrice: number; discountPercent: number; taxPercent: number }>(input: T) {
    const discounted = input.quantity * input.unitPrice * (1 - input.discountPercent / 100);
    return { ...input, total: roundMoney(discounted * (1 + input.taxPercent / 100)) };
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

export class PrismaCrm360Repository implements ICrm360Repository {
    async getOverviewData(organizationId: string): Promise<CrmOverviewData> {
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
            prisma.lead.groupBy({ where: { organizationId }, by: ['funnel', 'status'], _count: { _all: true }, _sum: { amount: true }, orderBy: { funnel: 'asc' } }),
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
            })) as unknown as CrmOverviewData['focusActivities'],
            recentDeals: recentDeals.map((deal) => ({ ...deal, status: fromPrismaLeadStatus(deal.status) })) as unknown as CrmOverviewData['recentDeals'],
            stageCounts: stageCounts.map((row) => ({
                funnel: row.funnel as 'Lead' | 'Negocio',
                status: fromPrismaLeadStatus(row.status),
                count: (row._count as { _all?: number })._all ?? 0,
                amount: (row._sum as { amount?: number | null }).amount ?? 0,
            })),
        };
    }

    async getPipelines(organizationId: string): Promise<CrmPipeline[]> {
        await ensureDefaultPipelines(organizationId);
        const pipelines = await prisma.crmPipeline.findMany({
            where: { organizationId },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            include: { stages: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { leads: true } } } } },
        });
        return pipelines as unknown as CrmPipeline[];
    }

    async getBoardLeads(organizationId: string, funnelStr = 'Negocio', pipelineId?: string) {
        const funnel = funnelStr === 'Lead' ? LeadFunnel.Lead : LeadFunnel.Negocio;
        await ensureDefaultPipelines(organizationId);

        let pipeline = pipelineId
            ? await prisma.crmPipeline.findFirst({ where: { id: pipelineId, organizationId }, include: { stages: { orderBy: { sortOrder: 'asc' } } } })
            : null;

        if (!pipeline) {
            pipeline = await prisma.crmPipeline.findFirst({
                where: { organizationId, entity: funnel === LeadFunnel.Lead ? CrmPipelineEntity.Lead : CrmPipelineEntity.Negocio, isDefault: true },
                include: { stages: { orderBy: { sortOrder: 'asc' } } },
            });
        }

        const leads = await prisma.lead.findMany({
            where: { organizationId, funnel, ...(pipeline ? { pipelineId: pipeline.id } : {}) },
            include: { company: true, contact: true, pipelineStage: true, dealItems: true },
            orderBy: [{ probability: 'desc' }, { updatedAt: 'desc' }],
        });

        return {
            stages: (pipeline?.stages ?? []).map((stage) => ({ ...stage, leadStatus: stage.leadStatus ? fromPrismaLeadStatus(stage.leadStatus) : null })),
            leads: leads.map((lead) => ({ ...lead, status: fromPrismaLeadStatus(lead.status) })),
        };
    }

    async updateLeadStage(organizationId: string, leadId: string, stageId: string, expectedCloseDate?: Date) {
        const stage = await prisma.crmPipelineStage.findFirstOrThrow({
            where: { id: stageId, pipeline: { organizationId } },
            include: { pipeline: true },
        });

        const previousLead = await prisma.lead.findFirstOrThrow({ where: { id: leadId, organizationId } });

        const updateData: Prisma.LeadUpdateInput = {
            pipeline: { connect: { id: stage.pipelineId } },
            pipelineStage: { connect: { id: stage.id } },
            probability: stage.probability,
            funnel: stage.pipeline.entity === CrmPipelineEntity.Lead ? LeadFunnel.Lead : LeadFunnel.Negocio,
        };

        if (expectedCloseDate) updateData.expectedCloseAt = expectedCloseDate;

        if (stage.leadStatus) {
            updateData.status = stage.leadStatus;
            if (CLOSED_DEAL_STATUSES.includes(stage.leadStatus) && !previousLead.closedAt) {
                updateData.closedAt = new Date();
            } else if (!CLOSED_DEAL_STATUSES.includes(stage.leadStatus)) {
                updateData.closedAt = null;
            }
        }

        const updated = await prisma.lead.update({
            where: { id: leadId },
            data: updateData,
            include: { company: true, contact: true, pipelineStage: true, dealItems: true },
        });

        if (previousLead.pipelineStageId !== stage.id) {
            await recordStageTransition(
                organizationId,
                leadId,
                stage,
                stage.pipelineId
            );
        }

        return { ...updated, status: fromPrismaLeadStatus(updated.status) };
    }

    async listProducts(organizationId: string, search?: string): Promise<CrmProduct[]> {
        const products = await prisma.crmProduct.findMany({
            where: {
                organizationId,
                active: true,
                ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] } : {}),
            },
            orderBy: { name: 'asc' },
        });
        return products.map(p => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })) as unknown as CrmProduct[];
    }

    async createProduct(organizationId: string, data: CrmProductInput): Promise<CrmProduct> {
        const { customFields, currency, ...restData } = data;
        const product = await prisma.crmProduct.create({
            data: { 
                ...restData, 
                currency: currency.toUpperCase(), 
                organizationId, 
                customFields: customFields ? (customFields as Prisma.InputJsonValue) : Prisma.JsonNull 
            },
        });
        return { ...product, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString() } as unknown as CrmProduct;
    }

    async getDealItems(organizationId: string, leadId: string): Promise<CrmDealItem[]> {
        const items = await prisma.crmDealItem.findMany({
            where: { organizationId, leadId },
            include: { product: true },
            orderBy: { sortOrder: 'asc' },
        });
        return items as unknown as CrmDealItem[];
    }

    async addDealItem(organizationId: string, leadId: string, input: CrmDealItemInput): Promise<CrmDealItem> {
        const calculated = calculateItem(input);
        const item = await prisma.crmDealItem.create({
            data: { ...calculated, organizationId, leadId },
            include: { product: true },
        });

        const aggregate = await prisma.crmDealItem.aggregate({
            where: { organizationId, leadId },
            _sum: { total: true },
        });
        await prisma.lead.update({
            where: { id: leadId, organizationId },
            data: { amount: roundMoney(aggregate._sum.total ?? 0) },
        });

        return item as unknown as CrmDealItem;
    }

    async removeDealItem(organizationId: string, leadId: string, itemId: string): Promise<void> {
        await prisma.crmDealItem.deleteMany({ where: { id: itemId, leadId, organizationId } });

        const aggregate = await prisma.crmDealItem.aggregate({
            where: { organizationId, leadId },
            _sum: { total: true },
        });
        await prisma.lead.update({
            where: { id: leadId, organizationId },
            data: { amount: roundMoney(aggregate._sum.total ?? 0) },
        });
    }

    async listDocuments(organizationId: string, leadId?: string): Promise<CrmCommercialDocument[]> {
        const docs = await prisma.crmCommercialDocument.findMany({
            where: { organizationId, ...(leadId ? { leadId } : {}) },
            include: { lead: true, company: true, contact: true },
            orderBy: { createdAt: 'desc' },
        });
        return docs.map(d => ({
            ...d,
            lineItems: d.lineItems as unknown as CrmCommercialDocument['lineItems'],
            issueDate: d.issueDate.toISOString(),
            validUntil: d.validUntil?.toISOString() ?? null,
            dueDate: d.dueDate?.toISOString() ?? null,
            createdAt: d.createdAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
        })) as unknown as CrmCommercialDocument[];
    }

    async createDocument(organizationId: string, input: CrmDocumentInput): Promise<CrmCommercialDocument> {
        const lineItems = input.lineItems.map(calculateItem);
        const subtotal = roundMoney(lineItems.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0));
        const discount = roundMoney(lineItems.reduce((acc, i) => acc + (i.quantity * i.unitPrice * (i.discountPercent / 100)), 0));
        const tax = roundMoney(lineItems.reduce((acc, i) => acc + ((i.quantity * i.unitPrice - (i.quantity * i.unitPrice * (i.discountPercent / 100))) * (i.taxPercent / 100)), 0));
        const total = roundMoney(subtotal - discount + tax);

        const doc = await prisma.crmCommercialDocument.create({
            data: {
                ...input,
                number: input.number ?? `DOC-${Date.now()}`,
                subtotal,
                discount,
                tax,
                total,
                lineItems: lineItems as unknown as Prisma.InputJsonValue,
                organizationId,
                issueDate: input.issueDate ? new Date(input.issueDate) : new Date(),
                validUntil: input.validUntil ? new Date(input.validUntil) : null,
                dueDate: input.dueDate ? new Date(input.dueDate) : null,
            },
            include: { lead: true, company: true, contact: true },
        });

        return {
            ...doc,
            lineItems: doc.lineItems as unknown as CrmCommercialDocument['lineItems'],
            issueDate: doc.issueDate.toISOString(),
            validUntil: doc.validUntil?.toISOString() ?? null,
            dueDate: doc.dueDate?.toISOString() ?? null,
            createdAt: doc.createdAt.toISOString(),
            updatedAt: doc.updatedAt.toISOString(),
        } as unknown as CrmCommercialDocument;
    }

    async updateDocumentStatus(organizationId: string, documentId: string, status: string): Promise<CrmCommercialDocument> {
        const doc = await prisma.crmCommercialDocument.update({
            where: { id: documentId, organizationId },
            data: { status: status as CrmDocumentStatus },
            include: { lead: true, company: true, contact: true },
        });
        return {
            ...doc,
            lineItems: doc.lineItems as unknown as CrmCommercialDocument['lineItems'],
            issueDate: doc.issueDate.toISOString(),
            validUntil: doc.validUntil?.toISOString() ?? null,
            dueDate: doc.dueDate?.toISOString() ?? null,
            createdAt: doc.createdAt.toISOString(),
            updatedAt: doc.updatedAt.toISOString(),
        } as unknown as CrmCommercialDocument;
    }
}
