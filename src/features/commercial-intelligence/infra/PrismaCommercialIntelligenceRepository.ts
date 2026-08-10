import { LeadFunnel, LeadStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import type {
    CommercialIntelligenceRepository,
    DealRow,
    StageDefinition,
    CommercialGoalDTO,
    GoalMetric,
} from '../domain/CommercialIntelligence';

/**
 * Status terminais usados como FALLBACK quando um negócio não tem `pipelineStageId` (registro
 * legado, nunca movido pelo Kanban de `crm360`). Espelha exatamente `CLOSED_DEAL_STATUSES`/
 * `DEAL_STAGES` de `src/features/crm360/services/crm360.service.ts` — a fonte real de quais
 * status são "ganho"/"perdido" hoje. Quando `pipelineStageId` existe, o repositório usa
 * `CrmPipelineStage.isWon`/`isLost` diretamente (mais robusto — reflete configuração real do
 * pipeline em vez de uma lista hardcoded que pode divergir de um pipeline customizado).
 */
const FALLBACK_WON_STATUSES = new Set<LeadStatus>([LeadStatus.Negocios_Ganhos]);
const FALLBACK_LOST_STATUSES = new Set<LeadStatus>([
    LeadStatus.Negocios_Perdidos,
    LeadStatus.Piloto_Atlas_Profile_Cancelado,
    LeadStatus.Piloto_Logistico_Cancelado,
]);

export class PrismaCommercialIntelligenceRepository implements CommercialIntelligenceRepository {
    async findDeals(organizationId: string): Promise<DealRow[]> {
        const leads = await prisma.lead.findMany({
            where: { organizationId, funnel: LeadFunnel.Negocio },
            include: {
                company: { select: { id: true, tradeName: true, legalName: true, cnpj: true } },
                pipelineStage: { select: { id: true, name: true, sortOrder: true, probability: true, isWon: true, isLost: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });

        return leads.map((lead) => {
            const stage = lead.pipelineStage;
            const stageIsWon = stage ? stage.isWon : FALLBACK_WON_STATUSES.has(lead.status);
            const stageIsLost = stage ? stage.isLost : FALLBACK_LOST_STATUSES.has(lead.status);

            return {
                id: lead.id,
                title: lead.title,
                amount: lead.amount ?? 0,
                owner: lead.owner,
                source: lead.source,
                companyId: lead.companyId,
                companyName: lead.company?.tradeName || lead.company?.legalName || null,
                companyCnpj: lead.company?.cnpj ?? null,
                contactId: lead.contactId,
                createdAt: lead.createdAt,
                updatedAt: lead.updatedAt,
                closedAt: lead.closedAt,
                expectedCloseAt: lead.expectedCloseAt,
                lastInteraction: lead.lastInteraction,
                nextAction: lead.nextAction,
                lossReason: lead.lossReason,
                // Não há coluna dedicada de "observação da perda" separada de lossReason hoje —
                // lossReason já é o único campo que o Bitrix/CRM preenche para isso (ver
                // comentário no schema). Mantido igual de propósito, não uma inconsistência.
                lossObservation: lead.lossReason,
                status: lead.status,
                pipelineId: lead.pipelineId,
                pipelineStageId: lead.pipelineStageId,
                stageName: stage?.name ?? null,
                stageSortOrder: stage?.sortOrder ?? null,
                stageProbability: stage?.probability ?? lead.probability ?? null,
                stageIsWon,
                stageIsLost,
            };
        });
    }

    async findDealPipelineStages(organizationId: string): Promise<StageDefinition[]> {
        const stages = await prisma.crmPipelineStage.findMany({
            where: { pipeline: { organizationId, entity: 'Negocio', active: true } },
            orderBy: { sortOrder: 'asc' },
        });
        return stages.map((stage) => ({
            id: stage.id,
            name: stage.name,
            code: stage.code,
            sortOrder: stage.sortOrder,
            probability: stage.probability,
            isWon: stage.isWon,
            isLost: stage.isLost,
        }));
    }

    async countCompletedMeetings(organizationId: string, from: Date, to: Date): Promise<number> {
        return prisma.activity.count({
            where: { organizationId, type: 'Reuniao', status: 'Concluida', date: { gte: from, lt: to } },
        });
    }

    async countTimelineEventsByType(organizationId: string, type: string, from: Date, to: Date): Promise<number> {
        return prisma.timelineEvent.count({
            where: { type, createdAt: { gte: from, lt: to }, lead: { organizationId, funnel: LeadFunnel.Negocio } },
        });
    }

    async findStageHistory(organizationId: string, leadIds?: string[]) {
        const rows = await prisma.leadStageHistory.findMany({
            where: { organizationId, ...(leadIds ? { leadId: { in: leadIds } } : {}) },
            select: { leadId: true, stageId: true, stageName: true, enteredAt: true, exitedAt: true, createdAt: true },
            orderBy: { enteredAt: 'asc' },
        });
        return rows;
    }

    async countDuplicateCompanyGroupsAmongOpenDeals(organizationId: string): Promise<number> {
        const grouped = await prisma.lead.groupBy({
            by: ['companyId'],
            where: {
                organizationId,
                funnel: LeadFunnel.Negocio,
                companyId: { not: null },
                status: { notIn: [...FALLBACK_WON_STATUSES, ...FALLBACK_LOST_STATUSES] },
            },
            _count: { _all: true },
        });
        return grouped.filter((g) => g._count._all > 1).length;
    }

    async getGoal(organizationId: string, period: string, metric: GoalMetric): Promise<CommercialGoalDTO | null> {
        const goal = await prisma.commercialGoal.findUnique({
            where: { organizationId_period_metric: { organizationId, period, metric } },
        });
        if (!goal) return null;
        return {
            period: goal.period,
            metric: goal.metric as GoalMetric,
            amount: goal.amount,
            currency: goal.currency,
            updatedAt: goal.updatedAt.toISOString(),
            createdBy: goal.createdBy,
        };
    }

    async upsertGoal(organizationId: string, period: string, metric: GoalMetric, amount: number, currency: string, createdBy: string): Promise<CommercialGoalDTO> {
        const goal = await prisma.commercialGoal.upsert({
            where: { organizationId_period_metric: { organizationId, period, metric } },
            update: { amount, currency, createdBy },
            create: { organizationId, period, metric, amount, currency, createdBy },
        });
        return {
            period: goal.period,
            metric: goal.metric as GoalMetric,
            amount: goal.amount,
            currency: goal.currency,
            updatedAt: goal.updatedAt.toISOString(),
            createdBy: goal.createdBy,
        };
    }
}
