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
        return this.activityRepository.createWithTimeline(organizationId, validated as unknown);
    }

    async updateActivity(organizationId: string, id: string, data: Partial<z.infer<typeof activitySchema>>) {
        return this.activityRepository.updateWithTimeline(organizationId, id, data as unknown);
    }

    async deleteActivity(organizationId: string, id: string) {
        return this.activityRepository.delete!(organizationId, id);
    }
}
