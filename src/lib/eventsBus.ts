import { EventEmitter } from 'events';

class CrmEventBus extends EventEmitter {}

export const crmEventBus = new CrmEventBus();

export interface CrmEvent {
    type: 'DEAL_WON' | 'DEAL_LOST' | 'NEW_OBJECTION' | 'NEW_LEAD' | 'MEETING_SCHEDULED';
    payload: Record<string, any>;
    timestamp: Date;
    organizationId: string;
}

export function broadcastEvent(event: Omit<CrmEvent, 'timestamp'>) {
    const fullEvent: CrmEvent = {
        ...event,
        timestamp: new Date(),
    };
    crmEventBus.emit('crm_event', fullEvent);
}
