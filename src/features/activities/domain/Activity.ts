import { Repository } from '../../../shared/domain/Repository';
import { ActivityType, ActivityStatus } from '../../../lib/zod';

export interface Activity {
    id: string;
    type: ActivityType;
    owner: string;
    date: Date;
    time: string | null;
    status: ActivityStatus;
    observations: string | null;
    leadId: string;
    organizationId: string | null;
    createdAt: Date;
    updatedAt: Date;
    lead?: unknown;
}

export interface ActivityListFilters {
    leadId?: string;
    status?: ActivityStatus;
    type?: ActivityType;
}

export interface ActivityPage {
    data: Activity[];
    meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ActivityRepository extends Repository<Activity> {
    findAllWithFilters(organizationId: string, dateStr?: string): Promise<Activity[]>;
    findAllPaginated(organizationId: string, dateStr?: string, page?: number, limit?: number, filters?: ActivityListFilters): Promise<ActivityPage>;
    findRange(organizationId: string, from: Date, to: Date): Promise<Activity[]>;
    createWithTimeline(organizationId: string, data: Partial<Activity> & { type: ActivityType, status: ActivityStatus, leadId: string, date: string | Date }): Promise<Activity>;
    updateWithTimeline(organizationId: string, id: string, data: Partial<Activity> & { type?: ActivityType, status?: ActivityStatus, date?: string | Date }): Promise<Activity>;
}
