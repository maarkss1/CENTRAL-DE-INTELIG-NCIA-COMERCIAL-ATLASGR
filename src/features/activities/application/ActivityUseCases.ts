import { ActivityRepository, ActivityListFilters } from '../domain/Activity';
import { z } from 'zod';
import { activitySchema } from '../../../lib/zod';
import { assertRealOwner } from '../domain/ownerGuard';

export class ActivityUseCases {
    constructor(private activityRepository: ActivityRepository) {}

    async findActivities(organizationId: string, dateStr?: string) {
        return this.activityRepository.findAllWithFilters(organizationId, dateStr);
    }

    async findActivitiesPaginated(
        organizationId: string,
        dateStr?: string,
        page?: number,
        limit?: number,
        filters?: ActivityListFilters
    ) {
        return this.activityRepository.findAllPaginated(organizationId, dateStr, page, limit, filters);
    }

    async findActivitiesRange(organizationId: string, fromStr: string, toStr: string) {
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new Error('Intervalo de datas inválido.');
        }
        if (from >= to) throw new Error('A data inicial deve ser anterior à final.');
        return this.activityRepository.findRange(organizationId, from, to);
    }

    async createActivity(organizationId: string, data: z.infer<typeof activitySchema>) {
        const validated = activitySchema.parse(data);
        assertRealOwner(validated.owner);
        return this.activityRepository.createWithTimeline(
            organizationId,
            validated as Parameters<ActivityRepository['createWithTimeline']>[1]
        );
    }

    async updateActivity(organizationId: string, id: string, data: Partial<z.infer<typeof activitySchema>>) {
        if (data.owner) assertRealOwner(data.owner);
        return this.activityRepository.updateWithTimeline(
            organizationId,
            id,
            data as Parameters<ActivityRepository['updateWithTimeline']>[2]
        );
    }

    async deleteActivity(organizationId: string, id: string) {
        return this.activityRepository.delete!(organizationId, id);
    }
}
