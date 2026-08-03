import { http, HttpResponse } from 'msw';
import { ok } from './http';

export const automationsHandlers = [
    http.get('/api/automations', () => ok([])),
    http.post('/api/automations', () => ok({})),
    http.put('/api/automations/:id', () => ok({})),
    http.delete('/api/automations/:id', () => new HttpResponse(null, { status: 204 })),

    http.get('/api/integrations/birth-voice/cold-call/status', () => ok({
        enabled: false,
        window: { startHour: 9, endHour: 18, weekdaysOnly: true, timeZone: 'America/Sao_Paulo' },
        policy: { maxAttemptsPerLead: 3, retryCooldownHours: 48 },
        recentRuns: [],
    })),
];
