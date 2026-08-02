import { api } from '../../lib/api';

export interface ColdCallWindow {
    startHour: number;
    endHour: number;
    weekdaysOnly: boolean;
    timeZone: string;
}

export interface ColdCallPolicy {
    maxAttemptsPerLead: number;
    retryCooldownHours: number;
}

export interface ColdCallRun {
    id: string;
    scanned: number;
    called: number;
    skippedMaxAttempts: number;
    skippedCooldown: number;
    skippedNoPhone: number;
    skippedSuppressed: number;
    skippedError: number;
    haltedBy: 'outside-window' | 'not-configured' | null;
    runAt: string;
}

export interface ColdCallStatus {
    enabled: boolean;
    window: ColdCallWindow;
    policy: ColdCallPolicy;
    recentRuns: ColdCallRun[];
}

export const coldCallCampaignApi = {
    status: () => api.get<ColdCallStatus>('/api/integrations/birth-voice/cold-call/status'),
};
