import { describe, it, expect } from 'vitest';
import {
    decideCadenceAction,
    startCadenceRun,
    applyOptOutStop,
    applyPolicyGuardrailFailure,
    applyReplyStop,
    applyStopDecision,
    stopCadenceManually,
    pauseCadenceRun,
    resumeCadenceRun,
    recordTouchAttempt,
    sanitizeTouchError,
    validateSequence,
    type CadenceSequenceDefinition,
    type CadenceDecisionContext,
} from '../domain/cadence';

const NOW = new Date('2026-08-03T12:00:00Z'); // segunda, 09:00 SP
const ALWAYS_WITHIN_WINDOW = () => true;
const NEVER_WITHIN_WINDOW = () => false;

function ctx(overrides: Partial<CadenceDecisionContext> = {}): CadenceDecisionContext {
    return {
        isOptedOut: false,
        hasLeadReplied: false,
        isWithinBusinessWindow: ALWAYS_WITHIN_WINDOW,
        ...overrides,
    };
}

const SEQUENCE: CadenceSequenceDefinition = {
    id: 'seq-1',
    name: 'E-mail → WhatsApp → Voz',
    touches: [
        { order: 1, channel: 'email', delayHoursFromPrevious: 0 },
        { order: 2, channel: 'whatsapp', delayHoursFromPrevious: 24 },
        { order: 3, channel: 'voice', delayHoursFromPrevious: 48 },
    ],
};

describe('validateSequence', () => {
    it('aceita sequência ordenada 1..N sem lacunas', () => {
        expect(validateSequence(SEQUENCE)).toEqual([]);
    });

    it('rejeita sequência vazia', () => {
        expect(validateSequence({ id: 's', name: 'vazia', touches: [] })).toContain('Sequência sem nenhum toque.');
    });

    it('rejeita lacuna de ordem', () => {
        const errors = validateSequence({
            id: 's',
            name: 'com lacuna',
            touches: [
                { order: 1, channel: 'email', delayHoursFromPrevious: 0 },
                { order: 3, channel: 'voice', delayHoursFromPrevious: 24 },
            ],
        });
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('decideCadenceAction — precedência de opt-out e resposta', () => {
    it('opt-out para a cadência mesmo se o run está ativo e dentro da janela', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        const decision = decideCadenceAction(run, SEQUENCE, NOW, ctx({ isOptedOut: true }));
        expect(decision).toEqual({ type: 'stop', reason: 'opt-out' });
    });

    it('resposta do lead para a cadência mesmo dentro da janela', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        const decision = decideCadenceAction(run, SEQUENCE, NOW, ctx({ hasLeadReplied: true }));
        expect(decision).toEqual({ type: 'stop', reason: 'lead-reply' });
    });

    it('opt-out tem precedência mesmo sobre um run já pausado', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = pauseCadenceRun(run, NOW);
        const decision = decideCadenceAction(run, SEQUENCE, NOW, ctx({ isOptedOut: true }));
        expect(decision).toEqual({ type: 'stop', reason: 'opt-out' });
    });
});

describe('decideCadenceAction — janela comercial e progressão', () => {
    it('primeiro toque dispara imediatamente quando dentro da janela', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        const decision = decideCadenceAction(run, SEQUENCE, NOW, ctx());
        expect(decision).toEqual({ type: 'dispatch', touch: SEQUENCE.touches[0] });
    });

    it('toque fora da janela comercial NÃO sai — devolve wait, nunca dispatch', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        const decision = decideCadenceAction(run, SEQUENCE, NOW, ctx({ isWithinBusinessWindow: NEVER_WITHIN_WINDOW }));
        expect(decision).toEqual({ type: 'wait', reason: 'outside-business-window' });
    });

    it('respeita o intervalo mínimo entre toques (delayHoursFromPrevious)', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = recordTouchAttempt(run, SEQUENCE, SEQUENCE.touches[0], NOW, { result: 'sent' });
        expect(run.currentTouchOrder).toBe(2);

        // Só 1h depois — o segundo toque exige 24h de intervalo.
        const umaHoraDepois = new Date(NOW.getTime() + 3_600_000);
        const decision = decideCadenceAction(run, SEQUENCE, umaHoraDepois, ctx());
        expect(decision.type).toBe('wait');
        if (decision.type === 'wait') expect(decision.reason).toBe('delay-not-elapsed');
    });

    it('libera o próximo toque assim que o intervalo é cumprido', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = recordTouchAttempt(run, SEQUENCE, SEQUENCE.touches[0], NOW, { result: 'sent' });

        const vinteQuatroHorasDepois = new Date(NOW.getTime() + 24 * 3_600_000);
        const decision = decideCadenceAction(run, SEQUENCE, vinteQuatroHorasDepois, ctx());
        expect(decision).toEqual({ type: 'dispatch', touch: SEQUENCE.touches[1] });
    });

    it('conclui a cadência (status completed, reason completed) após o último toque enviado — CYC-002: completed é estado próprio, não reaproveita stopped', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = recordTouchAttempt(run, SEQUENCE, SEQUENCE.touches[0], NOW, { result: 'sent' });
        run = recordTouchAttempt(run, SEQUENCE, SEQUENCE.touches[1], NOW, { result: 'sent' });
        run = recordTouchAttempt(run, SEQUENCE, SEQUENCE.touches[2], NOW, { result: 'sent' });

        expect(run.status).toBe('completed');
        expect(run.stopReason).toBe('completed');

        const decision = decideCadenceAction(run, SEQUENCE, NOW, ctx());
        expect(decision).toEqual({ type: 'stop', reason: 'completed' });
    });

    it('status completed/failed são terminais para decideCadenceAction, igual a stopped', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        const completed = { ...run, status: 'completed' as const, stopReason: 'completed' as const };
        expect(decideCadenceAction(completed, SEQUENCE, NOW, ctx())).toEqual({ type: 'stop', reason: 'completed' });

        const failed = applyPolicyGuardrailFailure(run, NOW);
        expect(decideCadenceAction(failed, SEQUENCE, NOW, ctx())).toEqual({ type: 'stop', reason: 'policy-guardrail' });
    });
});

describe('applyPolicyGuardrailFailure — CYC-002: único caminho para status failed', () => {
    it('encerra um run ativo como failed/policy-guardrail', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        const failed = applyPolicyGuardrailFailure(run, NOW);
        expect(failed.status).toBe('failed');
        expect(failed.stopReason).toBe('policy-guardrail');
        expect(failed.stoppedAt).toEqual(NOW);
    });

    it('é idempotente — não sobrescreve um run já terminal (ex.: já completed)', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = applyStopDecision(run, 'completed', NOW);
        const attempted = applyPolicyGuardrailFailure(run, new Date(NOW.getTime() + 1000));
        expect(attempted).toEqual(run);
    });
});

describe('applyStopDecision — único ponto que decide completed vs stopped a partir de um motivo', () => {
    it('motivo "completed" resulta em status completed', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        expect(applyStopDecision(run, 'completed', NOW).status).toBe('completed');
    });

    it('qualquer outro motivo (opt-out/lead-reply/manual-stop/policy-guardrail) resulta em status stopped', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        for (const reason of ['opt-out', 'lead-reply', 'manual-stop', 'policy-guardrail'] as const) {
            expect(applyStopDecision(run, reason, NOW).status).toBe('stopped');
        }
    });
});

describe('recordTouchAttempt — attemptNumber (CYC-002)', () => {
    it('começa em 1 e incrementa por touchOrder, não globalmente entre toques diferentes', () => {
        const seqComRetry: CadenceSequenceDefinition = {
            id: 'seq-retry',
            name: 'com retry',
            touches: [{ order: 1, channel: 'email', delayHoursFromPrevious: 0, maxAttempts: 3 }, { order: 2, channel: 'whatsapp', delayHoursFromPrevious: 0 }],
        };
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-retry', startedAt: NOW });

        run = recordTouchAttempt(run, seqComRetry, seqComRetry.touches[0], NOW, { result: 'failed' });
        expect(run.attempts[0].attemptNumber).toBe(1);

        run = recordTouchAttempt(run, seqComRetry, seqComRetry.touches[0], NOW, { result: 'sent' });
        expect(run.attempts[1].attemptNumber).toBe(2); // 2ª tentativa do MESMO toque (order 1)

        run = recordTouchAttempt(run, seqComRetry, seqComRetry.touches[1], NOW, { result: 'sent' });
        expect(run.attempts[2].attemptNumber).toBe(1); // toque DIFERENTE (order 2) — reinicia em 1
    });
});

describe('recordTouchAttempt — sanitização de erro (CYC-002)', () => {
    it('grava o erro sanitizado, nunca o texto cru com PII do lead', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        const updated = recordTouchAttempt(run, SEQUENCE, SEQUENCE.touches[0], NOW, { result: 'failed', error: 'Falha ao enviar para lead@empresa.com' });
        expect(updated.attempts[0].error).toBe(sanitizeTouchError('Falha ao enviar para lead@empresa.com'));
        expect(updated.attempts[0].error).not.toContain('lead@empresa.com');
    });
});

describe('recordTouchAttempt — honestidade de resultado', () => {
    it('toque skipped não avança a sequência nem marca lastTouchAt como sucesso', () => {
        const run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        const updated = recordTouchAttempt(run, SEQUENCE, SEQUENCE.touches[0], NOW, {
            result: 'skipped',
            skipReason: 'outside-business-window',
        });
        expect(updated.currentTouchOrder).toBe(1);
        expect(updated.attempts).toHaveLength(1);
        expect(updated.attempts[0].result).toBe('skipped');
    });

    it('provedor recusando marca failed, nunca sent — e mantém o toque até esgotar maxAttempts', () => {
        const seqComRetry: CadenceSequenceDefinition = {
            id: 'seq-retry',
            name: 'com retry',
            touches: [{ order: 1, channel: 'email', delayHoursFromPrevious: 0, maxAttempts: 2 }],
        };
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-retry', startedAt: NOW });

        run = recordTouchAttempt(run, seqComRetry, seqComRetry.touches[0], NOW, { result: 'failed', error: 'SMTP indisponível' });
        expect(run.currentTouchOrder).toBe(1); // ainda tem 1 tentativa disponível
        expect(run.attempts[0].result).toBe('failed');
        expect(run.attempts[0].error).toBe('SMTP indisponível');

        run = recordTouchAttempt(run, seqComRetry, seqComRetry.touches[0], NOW, { result: 'failed', error: 'SMTP indisponível' });
        // esgotou as 2 tentativas — sequência acaba (era o único toque), mas nunca marcado como sent
        expect(run.status).toBe('completed');
        expect(run.stopReason).toBe('completed');
        expect(run.attempts.every((a) => a.result !== 'sent')).toBe(true);
    });
});

describe('pausa e retomada manual', () => {
    it('pausa impede dispatch mesmo dentro da janela, sem perder o estado (run não é stopped)', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = pauseCadenceRun(run, NOW);
        expect(run.status).toBe('paused');

        const decision = decideCadenceAction(run, SEQUENCE, NOW, ctx());
        expect(decision).toEqual({ type: 'wait', reason: 'paused' });
    });

    it('retomada volta a permitir dispatch', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = pauseCadenceRun(run, NOW);
        run = resumeCadenceRun(run);
        expect(run.status).toBe('active');

        const decision = decideCadenceAction(run, SEQUENCE, NOW, ctx());
        expect(decision).toEqual({ type: 'dispatch', touch: SEQUENCE.touches[0] });
    });

    it('resumeCadenceRun nunca reabre um run já parado (opt-out/reply/completed são definitivos)', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = applyOptOutStop(run, NOW);
        const attempted = resumeCadenceRun(run);
        expect(attempted).toEqual(run); // sem efeito — continua stopped/opt-out
    });

    it('stopCadenceManually é definitivo, distinto de pausa', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = stopCadenceManually(run, NOW);
        expect(run.status).toBe('stopped');
        expect(run.stopReason).toBe('manual-stop');
        expect(resumeCadenceRun(run)).toEqual(run);
    });
});

describe('applyOptOutStop / applyReplyStop — idempotência', () => {
    it('não sobrescreve o motivo original de parada ao reaplicar', () => {
        let run = startCadenceRun({ id: 'r1', organizationId: 'org', leadId: 'lead', sequenceId: 'seq-1', startedAt: NOW });
        run = applyReplyStop(run, NOW);
        const reapplied = applyOptOutStop(run, new Date(NOW.getTime() + 1000));
        expect(reapplied.stopReason).toBe('lead-reply'); // primeiro motivo prevalece
    });
});
