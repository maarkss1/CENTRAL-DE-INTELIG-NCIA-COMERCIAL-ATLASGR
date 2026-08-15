import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { activitySchema, type ActivityType, type ActivityStatus } from '../../../lib/zod';
import { z } from 'zod';
import {
    toPrismaActivityType,
    fromPrismaActivityType,
    toPrismaActivityStatus,
    fromPrismaActivityStatus,
    fromPrismaLeadStatus,
    fromPrismaCompanyStatus,
} from '../../../lib/enumMap';
import { automationEngine } from '../../automations/automation.engine';
import { assertRealOwner } from '../domain/ownerGuard';

function serializeActivity<
    T extends {
        type: string;
        status: string;
        lead?: { status: string; company?: { status: string } | null } | null;
    }
>(activity: T): T & { type: ActivityType; status: ActivityStatus } {
    return {
        ...activity,
        type: fromPrismaActivityType(activity.type),
        status: fromPrismaActivityStatus(activity.status),
        ...(activity.lead
            ? {
                  lead: {
                      ...activity.lead,
                      status: fromPrismaLeadStatus(activity.lead.status),
                      ...(activity.lead.company
                          ? { company: { ...activity.lead.company, status: fromPrismaCompanyStatus(activity.lead.company.status) } }
                          : {}),
                  },
              }
            : {}),
    };
}

export interface ActivityListFilters {
    leadId?: string;
    status?: ActivityStatus;
    type?: ActivityType;
}

export class ActivityService {
    async findAll(
        organizationId: string,
        dateStr?: string,
        page: number = 1,
        limit: number = 50,
        filters: ActivityListFilters = {}
    ) {
        const where: Prisma.ActivityWhereInput = { organizationId };
        if (dateStr) {
            const searchDate = new Date(dateStr);
            where.date = {
                gte: new Date(searchDate.setHours(0, 0, 0, 0)),
                lt: new Date(searchDate.setHours(23, 59, 59, 999))
            };
        }
        if (filters.leadId) where.leadId = filters.leadId;
        if (filters.status) where.status = toPrismaActivityStatus(filters.status) as unknown as Prisma.ActivityWhereInput['status'];
        if (filters.type) where.type = toPrismaActivityType(filters.type) as unknown as Prisma.ActivityWhereInput['type'];

        const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
        const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
        const skip = (safePage - 1) * safeLimit;

        const [activities, total] = await prisma.$transaction([
            prisma.activity.findMany({
                where,
                include: { lead: { include: { company: true, contact: true } } },
                orderBy: { date: 'asc' },
                skip,
                take: safeLimit
            }),
            prisma.activity.count({ where })
        ]);

        return {
            data: activities.map(serializeActivity),
            meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) }
        };
    }

    /**
     * Atividades num intervalo fechado-aberto [from, to). O calendário carrega o mês inteiro de
     * uma vez — buscar dia a dia seriam ~35 requisições para montar uma grade.
     *
     * As datas chegam como ISO do frontend; `to` é exclusivo para o chamador poder passar o
     * primeiro instante do dia seguinte sem se preocupar com milissegundos de borda.
     */
    async findRange(organizationId: string, fromStr: string, toStr: string) {
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new Error('Intervalo de datas inválido.');
        }
        if (from >= to) throw new Error('A data inicial deve ser anterior à final.');

        const activities = await prisma.activity.findMany({
            where: { organizationId, date: { gte: from, lt: to } },
            include: { lead: { include: { company: true, contact: true } } },
            orderBy: { date: 'asc' },
        });
        return activities.map(serializeActivity);
    }

    async create(organizationId: string, data: z.infer<typeof activitySchema>) {
        const validated = activitySchema.parse(data);
        assertRealOwner(validated.owner);
        const activity = await prisma.activity.create({
            data: {
                ...validated,
                type: toPrismaActivityType(validated.type) as unknown as Prisma.ActivityCreateInput['type'],
                status: toPrismaActivityStatus(validated.status) as unknown as Prisma.ActivityCreateInput['status'],
                organizationId,
                date: new Date(validated.date)
            }
        });
        await prisma.timelineEvent.create({
            data: {
                type: 'activity',
                description: `Atividade '${validated.type}' agendada para ${new Date(validated.date).toLocaleDateString()}`,
                leadId: validated.leadId
            }
        });
        return serializeActivity(activity);
    }

    async update(organizationId: string, id: string, data: Partial<z.infer<typeof activitySchema>>) {
        const currentActivity = await prisma.activity.findFirst({ where: { id, organizationId } });
        if (!currentActivity) throw new Error('Activity not found');
        if (data.owner) assertRealOwner(data.owner);

        const updateData: Prisma.ActivityUpdateInput = { ...data } as Prisma.ActivityUpdateInput;
        if (data.date) updateData.date = new Date(data.date);
        if (data.type) updateData.type = toPrismaActivityType(data.type) as unknown as Prisma.ActivityUpdateInput['type'];
        if (data.status) updateData.status = toPrismaActivityStatus(data.status) as unknown as Prisma.ActivityUpdateInput['status'];

        // organizationId também no `where` do update em si (mesmo padrão de PrismaLeadRepository)
        // — hardening, não corrige falha explorável (pré-check acima + RLS já bloqueiam).
        const activity = await prisma.activity.update({
            where: { id, organizationId },
            data: updateData
        });

        if (data.status && updateData.status !== currentActivity.status) {
            await prisma.timelineEvent.create({
                data: {
                    type: 'activity',
                    description: `Status da atividade '${fromPrismaActivityType(currentActivity.type)}' alterado para '${data.status}'`,
                    leadId: currentActivity.leadId
                }
            });

            // Gatilho de automação. Sem await: automação é efeito colateral e não pode atrasar nem
            // derrubar a conclusão da atividade em si.
            if (data.status === 'Concluída') {
                void automationEngine.handle({
                    organizationId,
                    trigger: 'Atividade concluída',
                    entity: 'Activity',
                    entityId: id,
                    data: {
                        type: fromPrismaActivityType(currentActivity.type),
                        owner: currentActivity.owner,
                        leadId: currentActivity.leadId,
                    },
                }).catch(() => {});
            }
        }
        return serializeActivity(activity);
    }

    async delete(organizationId: string, id: string) {
        const existing = await prisma.activity.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Activity not found');
        return prisma.activity.delete({ where: { id, organizationId } });
    }
}
export const activityService = new ActivityService();
