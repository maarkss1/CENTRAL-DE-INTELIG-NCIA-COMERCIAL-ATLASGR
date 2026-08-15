import { describe, it, expect } from 'vitest';
import { isDeterministicCloseEvent, evaluateDealClosure, type DealClosureEventInput } from '../domain/dealClosure';

const NOW = new Date('2026-08-03T12:00:00Z');

function baseEvent(overrides: Partial<DealClosureEventInput> = {}): DealClosureEventInput {
    return {
        organizationId: 'org-1',
        leadId: 'lead-1',
        type: 'signature_completed',
        evidenceRef: 'signature-request-42',
        triggeredBy: 'webhook:clicksign',
        ...overrides,
    };
}

describe('isDeterministicCloseEvent', () => {
    it.each(['signature_completed', 'payment_confirmed', 'manual_crm_confirmation'] as const)(
        'aceita os três tipos combinados com o Agente 13: %s',
        (type) => {
            expect(isDeterministicCloseEvent(baseEvent({ type, triggeredBy: type === 'manual_crm_confirmation' ? 'user-9' : 'webhook:provider' }))).toBe(
                true,
            );
        },
    );

    it('rejeita evidenceRef vazio — nunca fecha negócio sem evidência real', () => {
        expect(isDeterministicCloseEvent(baseEvent({ evidenceRef: '' }))).toBe(false);
        expect(isDeterministicCloseEvent(baseEvent({ evidenceRef: '   ' }))).toBe(false);
    });

    it.each(['ai_inferred', 'ai_judgment', 'model_decision', 'assumed_won'] as const)(
        'rejeita marcador de inferência de modelo disfarçado de tipo: %s',
        (type) => {
            expect(isDeterministicCloseEvent(baseEvent({ type }))).toBe(false);
        },
    );

    it('rejeita tipo fora da lista fechada de 3 (ex.: um agente tentando inventar um tipo novo)', () => {
        expect(isDeterministicCloseEvent(baseEvent({ type: 'lead_seemed_happy' }))).toBe(false);
    });

    it.each(['ai:closer', 'agent-swarm', 'swarm_scheduler', 'closer:auto', 'bot-1'] as const)(
        'rejeita gatilho de IA/agente/enxame, mesmo com evidenceRef preenchido: %s',
        (triggeredBy) => {
            expect(isDeterministicCloseEvent(baseEvent({ triggeredBy }))).toBe(false);
        },
    );

    it('aceita gatilho humano (userId) e gatilho de webhook de provedor real', () => {
        expect(isDeterministicCloseEvent(baseEvent({ triggeredBy: 'user-42', type: 'manual_crm_confirmation' }))).toBe(true);
        expect(isDeterministicCloseEvent(baseEvent({ triggeredBy: 'webhook:clicksign' }))).toBe(true);
    });
});

describe('evaluateDealClosure', () => {
    it('aceita e cria o evento quando o evento é determinístico', () => {
        const result = evaluateDealClosure(baseEvent(), () => 'event-1', NOW);
        expect(result.accepted).toBe(true);
        expect(result.event).toEqual({
            organizationId: 'org-1',
            leadId: 'lead-1',
            type: 'signature_completed',
            evidenceRef: 'signature-request-42',
            triggeredBy: 'webhook:clicksign',
            id: 'event-1',
            occurredAt: NOW,
        });
    });

    it('rejeita SEM criar evento quando o gatilho é um agente de IA — nunca deixa o modelo declarar ganho', () => {
        const result = evaluateDealClosure(baseEvent({ triggeredBy: 'closer:auto' }), () => 'event-2', NOW);
        expect(result.accepted).toBe(false);
        expect(result.event).toBeNull();
        expect(result.rejectedReason).toBe('untrusted-trigger');
    });

    it('rejeita sem criar evento quando falta evidência', () => {
        const result = evaluateDealClosure(baseEvent({ evidenceRef: '' }), () => 'event-3', NOW);
        expect(result.accepted).toBe(false);
        expect(result.rejectedReason).toBe('missing-evidence');
    });

    it('rejeita sem criar evento quando o tipo não é um dos 3 combinados com o 13', () => {
        const result = evaluateDealClosure(baseEvent({ type: 'ai_judgment' }), () => 'event-4', NOW);
        expect(result.accepted).toBe(false);
        expect(result.rejectedReason).toBe('invalid-type');
    });
});
