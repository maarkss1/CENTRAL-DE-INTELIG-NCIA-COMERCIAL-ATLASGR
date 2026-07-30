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

export class ActivityService {
    async findAll(organizationId: string, dateStr?: string) {
        const where: Prisma.ActivityWhereInput = { organizationId };
        if (dateStr) {
            const searchDate = new Date(dateStr);
            where.date = {
                gte: new Date(searchDate.setHours(0, 0, 0, 0)),
                lt: new Date(searchDate.setHours(23, 59, 59, 999))
            };
        }
        const activities = await prisma.activity.findMany({
            where,
            include: { lead: { include: { company: true, contact: true } } },
            orderBy: { date: 'asc' }
        });
        return activities.map(serializeActivity);
    }

    async create(organizationId: string, data: z.infer<typeof activitySchema>) {
        const validated = activitySchema.parse(data);
        const activity = await prisma.activity.create({
            data: {
                ...validated,
                type: toPrismaActivityType(validated.type) as unknown,
                status: toPrismaActivityStatus(validated.status) as unknown,
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

        const updateData: Prisma.ActivityUpdateInput = { ...data } as Prisma.ActivityUpdateInput;
        if (data.date) updateData.date = new Date(data.date);
        if (data.type) updateData.type = toPrismaActivityType(data.type) as unknown;
        if (data.status) updateData.status = toPrismaActivityStatus(data.status) as unknown;

        const activity = await prisma.activity.update({
            where: { id },
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
        }
        return serializeActivity(activity);
    }

    async delete(organizationId: string, id: string) {
        const existing = await prisma.activity.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Activity not found');
        return prisma.activity.delete({ where: { id } });
    }
}
export const activityService = new ActivityService();
