import { describe, it, expect } from 'vitest';
import {
    isVerifiableConfirmation,
    scheduleMeetingIfConfirmed,
    type AvailabilityConfirmation,
    type CalendarSchedulerPort,
} from '../domain/scheduling';

const NOW = new Date('2026-08-03T12:00:00Z');
const FUTURE_START = new Date('2026-08-05T14:00:00Z');
const FUTURE_END = new Date('2026-08-05T14:30:00Z');

function baseConfirmation(overrides: Partial<AvailabilityConfirmation> = {}): AvailabilityConfirmation {
    return {
        organizationId: 'org-1',
        leadId: 'lead-1',
        evidenceType: 'lead-calendar-reply',
        evidenceRef: 'email-msg-42',
        proposedStart: FUTURE_START,
        proposedEnd: FUTURE_END,
        ...overrides,
    };
}

describe('isVerifiableConfirmation', () => {
    it('aceita confirmação real do lead com referência de evidência e horário futuro', () => {
        expect(isVerifiableConfirmation(baseConfirmation(), NOW)).toBe(true);
    });

    it.each(['lead-calendar-reply', 'lead-scheduling-link-click', 'manual-verified'] as const)(
        'aceita os três tipos de evidência verificável: %s',
        (evidenceType) => {
            expect(isVerifiableConfirmation(baseConfirmation({ evidenceType }), NOW)).toBe(true);
        },
    );

    it('rejeita inferência de modelo disfarçada de evidência (evidenceRef genérico)', () => {
        expect(isVerifiableConfirmation(baseConfirmation({ evidenceRef: 'ai-inferred' }), NOW)).toBe(false);
        expect(isVerifiableConfirmation(baseConfirmation({ evidenceRef: 'model-judgment' }), NOW)).toBe(false);
    });

    it('rejeita tipo de evidência fora da lista fechada (ex.: um agente tentando inventar um tipo novo)', () => {
        expect(isVerifiableConfirmation(baseConfirmation({ evidenceType: 'ai-guess' }), NOW)).toBe(false);
    });

    it('rejeita evidenceRef vazio', () => {
        expect(isVerifiableConfirmation(baseConfirmation({ evidenceRef: '   ' }), NOW)).toBe(false);
    });

    it('rejeita horário proposto no passado', () => {
        const past = new Date('2026-08-01T10:00:00Z');
        expect(isVerifiableConfirmation(baseConfirmation({ proposedStart: past, proposedEnd: new Date('2026-08-01T10:30:00Z') }), NOW)).toBe(
            false,
        );
    });

    it('rejeita fim antes ou igual ao início', () => {
        expect(isVerifiableConfirmation(baseConfirmation({ proposedEnd: FUTURE_START }), NOW)).toBe(false);
    });
});

describe('scheduleMeetingIfConfirmed', () => {
    const context = { leadTitle: 'Transportadora Exemplo', leadEmail: 'lead@empresa.com', ownerEmail: 'sdr@atlasgr.com.br', ownerUserId: 'user-1' };

    it('agenda de verdade quando a confirmação é verificável — chama o scheduler real', async () => {
        let created: unknown = null;
        const scheduler: CalendarSchedulerPort = {
            async createEvent(draft) {
                created = draft;
                return { googleEventId: 'gcal-evt-123' };
            },
        };

        const result = await scheduleMeetingIfConfirmed(baseConfirmation(), context, scheduler, NOW);

        expect(result).toEqual({ scheduled: true, googleEventId: 'gcal-evt-123', rejectedReason: null });
        expect(created).not.toBeNull();
    });

    it('NÃO agenda a partir de uma inferência do modelo — nunca chama o scheduler', async () => {
        let calls = 0;
        const scheduler: CalendarSchedulerPort = {
            async createEvent() {
                calls += 1;
                return { googleEventId: 'nunca-deveria-existir' };
            },
        };

        const result = await scheduleMeetingIfConfirmed(
            baseConfirmation({ evidenceType: 'ai-inferred', evidenceRef: 'acho que ele topou' }),
            context,
            scheduler,
            NOW,
        );

        expect(result).toEqual({ scheduled: false, googleEventId: null, rejectedReason: 'not-verifiable' });
        expect(calls).toBe(0);
    });
});
