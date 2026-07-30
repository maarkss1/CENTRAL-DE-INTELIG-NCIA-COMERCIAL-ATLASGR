import { ActivityRepository } from '../domain/Activity';
import { z } from 'zod';
import { activitySchema } from '../../../lib/zod';

export class ActivityUseCases {
    constructor(private activityRepository: ActivityRepository) {}

    async findActivities(organizationId: string, dateStr?: string) {
        return this.activityRepository.findAllWithFilters(organizationId, dateStr);
    }

    async createActivity(organizationId: string, data: z.infer<typeof activitySchema>) {
        const validated = activitySchema.parse(data);
        return this.activityRepository.createWithTimeline(organizationId, validated as Partial<import('../domain/Activity').Activity> & { type: import('../../../lib/zod').ActivityType, status: import('../../../lib/zod').ActivityStatus, leadId: string, date: string | Date });
    }

    async updateActivity(organizationId: string, id: string, data: Partial<z.infer<typeof activitySchema>>) {
        return this.activityRepository.updateWithTimeline(organizationId, id, data as Partial<import('../domain/Activity').Activity> & { type?: import('../../../lib/zod').ActivityType, status?: import('../../../lib/zod').ActivityStatus, date?: string | Date });
    }

    async deleteActivity(organizationId: string, id: string) {
        return this.activityRepository.delete!(organizationId, id);
    }
}
