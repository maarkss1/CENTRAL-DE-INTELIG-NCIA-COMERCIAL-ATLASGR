import { describe, it, expect, beforeEach } from 'vitest';
import { startCadenceRun, type CadenceSequenceDefinition, type CadenceTouch, type CadenceRunState } from '../domain/cadence';
import { advanceCadenceRun, type CadenceDispatcher, type CadenceRunLockPort, type LeadSubjectResolver } from '../application/cadenceService';
import { InMemoryCadenceRunRepository } from '../infra/InMemoryCadenceRunRepository';
import { InMemoryOptOutRepository } from '../infra/InMemoryOptOutRepository';
import { recordOptOut } from '../application/optOutService';

const ORG = 'org-1';
const LEAD = 'lead-1';
const NOW = new Date('2026-08-03T12:00:00Z');

const SEQUENCE: CadenceSequenceDefinition = {
    id: 'seq-1',
    name: 'E-mail → WhatsApp',
    touches: [
        { order: 1, channel: 'email', delayHoursFromPrevious: 0 },
        { order: 2, channel: 'whatsapp', delayHoursFromPrevious: 24 },
    ],
};

function alwaysResolveSubject(): LeadSubjectResolver {
    return {
        async resolve() {
            return { leadId: LEAD, email: 'lead@empresa.com', phoneE164: '+5511999998888' };
        },
    };
}

/** Trava sempre concedida — a corrida real que a trava previne é coberta à parte, em `advanceCadenceRun.lock.test.ts`. */
function noopLock(): CadenceRunLockPort {
    return { async acquire() { return { acquired: true, release: async () => {} }; } };
}

class ScriptedDispatcher implements CadenceDispatcher {
    calls: CadenceTouch[] = [];
    constructor(private readonly outcome: { result: 'sent' | 'failed'; error?: string | null }) {}
    async dispatch(touch: CadenceTouch) {
        this.calls.push(touch);
        return this.outcome;
    }
}

describe('advanceCadenceRun', () => {
    let runRepo: InMemoryCadenceRunRepository;
    let optOutRepo: InMemoryOptOutRepository;

    beforeEach(() => {
        runRepo = new InMemoryCadenceRunRepository();
        optOutRepo = new InMemoryOptOutRepository();
    });

    it('despacha o primeiro toque e avança a sequência quando o canal confirma envio', async () => {
        const run = startCadenceRun({ id: 'run-1', organizationId: ORG, leadId: LEAD, sequenceId: 'seq-1', startedAt: NOW });
        runRepo.seed(run);
        const dispatcher = new ScriptedDispatcher({ result: 'sent' });

        const { run: updated, decision } = await advanceCadenceRun(
            {
                runRepo,
                optOutRepo,
                subjectResolver: alwaysResolveSubject(),
                dispatcher,
                lock: noopLock(),
                isWithinBusinessWindow: () => true,
                hasLeadReplied: async () => false,
            },
            ORG,
            'run-1',
            SEQUENCE,
            NOW,
        );

        expect(decision.type).toBe('dispatch');
        expect(dispatcher.calls).toHaveLength(1);
        expect(updated.currentTouchOrder).toBe(2);
        expect(updated.attempts[0].result).toBe('sent');
    });

    it('provedor recusa o envio — grava failed, nunca sent, e não avança silenciosamente', async () => {
        const run = startCadenceRun({ id: 'run-1', organizationId: ORG, leadId: LEAD, sequenceId: 'seq-1', startedAt: NOW });
        runRepo.seed(run);
        const dispatcher = new ScriptedDispatcher({ result: 'failed', error: 'SMTP recusou a conexão' });

        const { run: updated } = await advanceCadenceRun(
            {
                runRepo,
                optOutRepo,
                subjectResolver: alwaysResolveSubject(),
                dispatcher,
                lock: noopLock(),
                isWithinBusinessWindow: () => true,
                hasLeadReplied: async () => false,
            },
            ORG,
            'run-1',
            SEQUENCE,
            NOW,
        );

        expect(updated.attempts[0].result).toBe('failed');
        expect(updated.attempts[0].error).toBe('SMTP recusou a conexão');
        expect(updated.attempts.some((a) => a.result === 'sent')).toBe(false);
    });

    it('opt-out registrado para o canal do próximo toque encerra a cadência sem despachar', async () => {
        const run = startCadenceRun({ id: 'run-1', organizationId: ORG, leadId: LEAD, sequenceId: 'seq-1', startedAt: NOW });
        runRepo.seed(run);
        await recordOptOut(optOutRepo, {
            organizationId: ORG,
            scope: 'global',
            subject: { leadId: LEAD, email: 'lead@empresa.com' },
            originChannel: 'whatsapp',
            reason: 'Lead pediu para não ser mais contatado',
        });
        const dispatcher = new ScriptedDispatcher({ result: 'sent' });

        const { run: updated, decision } = await advanceCadenceRun(
            {
                runRepo,
                optOutRepo,
                subjectResolver: alwaysResolveSubject(),
                dispatcher,
                lock: noopLock(),
                isWithinBusinessWindow: () => true,
                hasLeadReplied: async () => false,
            },
            ORG,
            'run-1',
            SEQUENCE,
            NOW,
        );

        expect(decision).toEqual({ type: 'stop', reason: 'opt-out' });
        expect(updated.status).toBe('stopped');
        expect(updated.stopReason).toBe('opt-out');
        expect(dispatcher.calls).toHaveLength(0); // nunca chega a disparar
    });

    it('resposta do lead encerra a cadência sem despachar', async () => {
        const run = startCadenceRun({ id: 'run-1', organizationId: ORG, leadId: LEAD, sequenceId: 'seq-1', startedAt: NOW });
        runRepo.seed(run);
        const dispatcher = new ScriptedDispatcher({ result: 'sent' });

        const { decision } = await advanceCadenceRun(
            {
                runRepo,
                optOutRepo,
                subjectResolver: alwaysResolveSubject(),
                dispatcher,
                lock: noopLock(),
                isWithinBusinessWindow: () => true,
                hasLeadReplied: async () => true,
            },
            ORG,
            'run-1',
            SEQUENCE,
            NOW,
        );

        expect(decision).toEqual({ type: 'stop', reason: 'lead-reply' });
        expect(dispatcher.calls).toHaveLength(0);
    });

    it('fora da janela comercial: aguarda, não despacha nem marca falha', async () => {
        const run = startCadenceRun({ id: 'run-1', organizationId: ORG, leadId: LEAD, sequenceId: 'seq-1', startedAt: NOW });
        runRepo.seed(run);
        const dispatcher = new ScriptedDispatcher({ result: 'sent' });

        const { run: updated, decision } = await advanceCadenceRun(
            {
                runRepo,
                optOutRepo,
                subjectResolver: alwaysResolveSubject(),
                dispatcher,
                lock: noopLock(),
                isWithinBusinessWindow: () => false,
                hasLeadReplied: async () => false,
            },
            ORG,
            'run-1',
            SEQUENCE,
            NOW,
        );

        expect(decision).toEqual({ type: 'wait', reason: 'outside-business-window' });
        expect(dispatcher.calls).toHaveLength(0);
        expect(updated.attempts).toHaveLength(0);
    });

    it('lança quando o run não existe para a organização informada (isolamento de tenant)', async () => {
        const run: CadenceRunState = startCadenceRun({ id: 'run-1', organizationId: ORG, leadId: LEAD, sequenceId: 'seq-1', startedAt: NOW });
        runRepo.seed(run);

        await expect(
            advanceCadenceRun(
                {
                    runRepo,
                    optOutRepo,
                    subjectResolver: alwaysResolveSubject(),
                    dispatcher: new ScriptedDispatcher({ result: 'sent' }),
                    lock: noopLock(),
                    isWithinBusinessWindow: () => true,
                    hasLeadReplied: async () => false,
                },
                'outra-org',
                'run-1',
                SEQUENCE,
                NOW,
            ),
        ).rejects.toThrow();
    });
});
