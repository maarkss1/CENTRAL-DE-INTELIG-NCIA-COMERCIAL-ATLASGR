import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scheduleVerifiedMeeting } from '@/features/cadence/application/scheduleMeeting';
import type { MeetingConfirmationNotePort } from '@/features/cadence/application/scheduleMeeting';
import type { CalendarSchedulerPort } from '@/features/cadence/domain/scheduling';

/**
 * CYC-004 (onda 27) — a garantia central deste orquestrador é a mesma do domínio puro que ele
 * conecta (`scheduling.ts`, `isVerifiableConfirmation`): nenhuma reunião é marcada como agendada
 * sem uma confirmação verificável, e nenhuma `Note`/evento é persistido quando a confirmação é
 * rejeitada (mesmo raciocínio de `dealClosureGate.ts`, para não deixar uma nota falsa de "reunião
 * confirmada" no histórico do lead quando o horário nem é válido).
 */

const NOW = new Date('2026-08-19T12:00:00Z');
const FUTURE_START = new Date('2026-08-20T14:00:00Z');
const FUTURE_END = new Date('2026-08-20T15:00:00Z');

function buildPorts(overrides: { notes?: Partial<MeetingConfirmationNotePort>; scheduler?: Partial<CalendarSchedulerPort> } = {}) {
    return {
        notes: {
            createConfirmationNote: vi.fn(async () => ({ id: 'note-1' })),
            ...overrides.notes,
        } as MeetingConfirmationNotePort,
        scheduler: {
            createEvent: vi.fn(async () => ({ googleEventId: 'google-event-1' })),
            ...overrides.scheduler,
        } as CalendarSchedulerPort,
    };
}

const baseInput = {
    organizationId: 'org-1',
    leadId: 'lead-1',
    actorUserId: 'user-1',
    proposedStart: FUTURE_START,
    proposedEnd: FUTURE_END,
    leadTitle: 'Empresa Exemplo',
    leadEmail: 'contato@exemplo.com',
    ownerEmail: 'vendedor@atlasgr.com.br',
};

beforeEach(() => vi.clearAllMocks());

describe('scheduleVerifiedMeeting', () => {
    it('horário futuro válido: cria a nota de evidência, agenda e devolve o googleEventId real', async () => {
        const ports = buildPorts();

        const result = await scheduleVerifiedMeeting(ports, baseInput, NOW);

        expect(result).toMatchObject({ scheduled: true, googleEventId: 'google-event-1', rejectedReason: null, noteId: 'note-1' });
        expect(ports.notes.createConfirmationNote).toHaveBeenCalledWith({
            organizationId: 'org-1',
            leadId: 'lead-1',
            authorUserId: 'user-1',
            scheduledStart: FUTURE_START,
            scheduledEnd: FUTURE_END,
        });
        expect(ports.scheduler.createEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'org-1',
                leadId: 'lead-1',
                confirmationEvidenceType: 'manual-verified',
                confirmationEvidenceRef: 'note-1',
                attendeeEmails: ['contato@exemplo.com', 'vendedor@atlasgr.com.br'],
            }),
        );
    });

    it('horário no passado: rejeita e NUNCA cria nota nem chama o scheduler', async () => {
        const ports = buildPorts();

        const result = await scheduleVerifiedMeeting(
            ports,
            { ...baseInput, proposedStart: new Date('2020-01-01T00:00:00Z'), proposedEnd: new Date('2020-01-01T01:00:00Z') },
            NOW,
        );

        expect(result).toEqual({ scheduled: false, googleEventId: null, rejectedReason: 'not-verifiable', noteId: null });
        expect(ports.notes.createConfirmationNote).not.toHaveBeenCalled();
        expect(ports.scheduler.createEvent).not.toHaveBeenCalled();
    });

    it('fim antes do início: rejeita e NUNCA cria nota nem chama o scheduler', async () => {
        const ports = buildPorts();

        const result = await scheduleVerifiedMeeting(
            ports,
            { ...baseInput, proposedStart: FUTURE_END, proposedEnd: FUTURE_START },
            NOW,
        );

        expect(result.scheduled).toBe(false);
        expect(ports.notes.createConfirmationNote).not.toHaveBeenCalled();
        expect(ports.scheduler.createEvent).not.toHaveBeenCalled();
    });

    it('lead sem e-mail de contato: agenda mesmo assim, sem o e-mail vazio na lista de convidados', async () => {
        const ports = buildPorts();

        await scheduleVerifiedMeeting(ports, { ...baseInput, leadEmail: '' }, NOW);

        expect(ports.scheduler.createEvent).toHaveBeenCalledWith(
            expect.objectContaining({ attendeeEmails: ['vendedor@atlasgr.com.br'] }),
        );
    });
});
