import { Activity, ActivityRepository, ActivityListFilters, ActivityPage } from '../domain/Activity';
import { prisma } from '../../../lib/prisma';
import { Prisma } from '@prisma/client';
import {
    toPrismaActivityType,
    fromPrismaActivityType,
    toPrismaActivityStatus,
    fromPrismaActivityStatus,
    fromPrismaLeadStatus,
    fromPrismaCompanyStatus,
} from '../../../lib/enumMap';
import { ActivityType, ActivityStatus } from '../../../lib/zod';

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

export class PrismaActivityRepository implements ActivityRepository {
    async findAllPaginated(
        organizationId: string,
        dateStr?: string,
        page = 1,
        limit = 50,
        filters: ActivityListFilters = {}
    ): Promise<ActivityPage> {
        const where: Prisma.ActivityWhereInput = { organizationId };
        if (dateStr) {
            const searchDate = new Date(dateStr);
            where.date = {
                gte: new Date(new Date(searchDate).setHours(0, 0, 0, 0)),
                lt: new Date(new Date(searchDate).setHours(23, 59, 59, 999))
            };
        }
        if (filters.leadId) where.leadId = filters.leadId;
        if (filters.status) where.status = filters.status as unknown as Prisma.ActivityWhereInput['status'];
        if (filters.type) where.type = filters.type as unknown as Prisma.ActivityWhereInput['type'];

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
            data: activities.map(serializeActivity) as unknown as Activity[],
            meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) }
        };
    }

    async findRange(organizationId: string, from: Date, to: Date): Promise<Activity[]> {
        const activities = await prisma.activity.findMany({
            where: { organizationId, date: { gte: from, lt: to } },
            include: { lead: { include: { company: true, contact: true } } },
            orderBy: { date: 'asc' },
        });
        return activities.map(serializeActivity) as unknown as Activity[];
    }

    async findAllWithFilters(organizationId: string, dateStr?: string): Promise<Activity[]> {
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
        return activities.map(serializeActivity) as unknown as Activity[];
    }

    async createWithTimeline(organizationId: string, data: Partial<Activity> & { type: ActivityType, status: ActivityStatus, leadId: string, date: string | Date }): Promise<Activity> {
        const [activity] = await prisma.$transaction([
            prisma.activity.create({
                data: {
                    ...data,
                    type: toPrismaActivityType(data.type) as unknown as Prisma.ActivityCreateInput['type'],
                    status: toPrismaActivityStatus(data.status) as unknown as Prisma.ActivityCreateInput['status'],
                    organizationId,
                    date: new Date(data.date),
                    lead: undefined
                } as unknown as Prisma.ActivityCreateInput
            }),
            prisma.timelineEvent.create({
                data: {
                    type: 'activity',
                    description: `Atividade '${data.type}' agendada para ${new Date(data.date).toLocaleDateString()}`,
                    leadId: data.leadId
                }
            })
        ]);

        return serializeActivity(activity) as unknown as Activity;
    }

    async updateWithTimeline(organizationId: string, id: string, data: Partial<Activity> & { type?: ActivityType, status?: ActivityStatus, date?: string | Date }): Promise<Activity> {
        const currentActivity = await prisma.activity.findFirst({ where: { id, organizationId } });
        if (!currentActivity) throw new Error('Activity not found');

        const updateData: Prisma.ActivityUpdateInput = { ...data } as Prisma.ActivityUpdateInput;
        if (data.date) updateData.date = new Date(data.date);
        if (data.type) updateData.type = toPrismaActivityType(data.type) as unknown as Prisma.ActivityUpdateInput['type'];
        if (data.status) updateData.status = toPrismaActivityStatus(data.status) as unknown as Prisma.ActivityUpdateInput['status'];

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
        return serializeActivity(activity) as unknown as Activity;
    }

    async delete(organizationId: string, id: string): Promise<Activity> {
        const existing = await prisma.activity.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Activity not found');

        const deleted = await prisma.activity.delete({ where: { id } });
        return serializeActivity(deleted) as unknown as Activity;
    }
}
