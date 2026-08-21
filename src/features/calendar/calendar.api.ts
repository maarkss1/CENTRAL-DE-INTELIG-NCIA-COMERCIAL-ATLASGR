import { api } from '../../lib/api';
import type { ActivityType, ActivityStatus } from '../../lib/zod';

export type { ActivityType, ActivityStatus };

export interface CalendarActivity {
    id: string;
    type: ActivityType;
    owner: string;
    date: string;
    time: string | null;
    status: ActivityStatus;
    observations: string | null;
    leadId: string;
    lead?: {
        id: string;
        company?: { tradeName?: string | null; legalName?: string | null } | null;
        contact?: { name?: string | null } | null;
    } | null;
}

export const ACTIVITY_STATUSES: ActivityStatus[] = ['Pendente', 'Em andamento', 'Concluída', 'Cancelada'];

export const calendarApi = {
    range: (from: Date, to: Date) =>
        api.get<CalendarActivity[]>(
            `/api/activities?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        ),

    /** Usado ao arrastar um card para outro dia e ao concluir/cancelar. */
    update: (id: string, patch: Partial<Pick<CalendarActivity, 'date' | 'status'>>) =>
        api.put<CalendarActivity>(`/api/activities/${id}`, patch),
};

/** Rótulo curto do lead exibido no card: empresa, senão contato, senão o id. */
export function activitySubject(activity: CalendarActivity): string {
    const company = activity.lead?.company;
    return (
        company?.tradeName ||
        company?.legalName ||
        activity.lead?.contact?.name ||
        'Lead sem empresa'
    );
}
