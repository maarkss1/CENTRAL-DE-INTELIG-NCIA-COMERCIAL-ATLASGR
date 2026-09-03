import { describe, it, expect } from 'vitest';
import {
  startCadenceRun,
  type CadenceSequenceDefinition,
  type CadenceTouch,
} from '../domain/cadence';
import {
  advanceCadenceRun,
  type CadenceDispatcher,
  type CadenceRateLimitPort,
  type CadenceRunLockPort,
  type LeadSubjectResolver,
} from '../application/cadenceService';
import { InMemoryCadenceRunRepository } from '../infra/InMemoryCadenceRunRepository';
import { InMemoryOptOutRepository } from '../infra/InMemoryOptOutRepository';

/** Rate limit sempre liberado — o comportamento real do rate limit é coberto à parte, em `rateLimitService.test.ts`. */
function noopRateLimit(): CadenceRateLimitPort {
  return {
    async countSentTouchesForContact() {
      return 0;
    },
    async countDistinctEmailRecipientsForDomain() {
      return { distinctRecipientsToday: 0, currentLeadAlreadyCounted: false };
    },
    async findLastSentTouch() {
      return null;
    },
  };
}

// CYC-008 (onda-19): advanceCadenceRun não tinha nenhuma trava entre ler o run e gravar o
// resultado do dispatch — dois ciclos concorrentes para o MESMO runId podiam ambos decidir
// 'dispatch' e ambos chamar o canal real, duplicando o envio ao lead. Este arquivo prova a
// correção: com a trava contendida, o segundo ciclo nunca chega a chamar o dispatcher.

const ORG = 'org-1';
const LEAD = 'lead-1';
const NOW = new Date('2026-08-03T12:00:00Z');

const SEQUENCE: CadenceSequenceDefinition = {
  id: 'seq-1',
  name: 'WhatsApp único',
  touches: [{ order: 1, channel: 'whatsapp', delayHoursFromPrevious: 0 }],
};

function alwaysResolveSubject(): LeadSubjectResolver {
  return {
    async resolve() {
      return { leadId: LEAD, email: null, phoneE164: '+5511999998888' };
    },
  };
}

class CountingDispatcher implements CadenceDispatcher {
  calls: CadenceTouch[] = [];
  async dispatch(touch: CadenceTouch) {
    this.calls.push(touch);
    return { result: 'sent' as const, providerMessageId: 'wamid.fake' };
  }
}

/** Concede a trava só na primeira chamada — simula um segundo worker chegando enquanto o primeiro ainda processa este runId. */
function contendedAfterFirstAcquire(): CadenceRunLockPort {
  let acquiredOnce = false;
  return {
    async acquire() {
      if (acquiredOnce) return { acquired: false, release: async () => {} };
      acquiredOnce = true;
      return { acquired: true, release: async () => {} };
    },
  };
}

/** Nunca concede a trava — simula outro processo já dono da trava deste runId agora mesmo. */
function alwaysContended(): CadenceRunLockPort {
  return {
    async acquire() {
      return { acquired: false, release: async () => {} };
    },
  };
}

describe('advanceCadenceRun — trava de concorrência (CYC-008/onda-19)', () => {
  it('segundo ciclo concorrente para o mesmo run nunca chama o dispatcher quando a trava está contendida', async () => {
    const runRepo = new InMemoryCadenceRunRepository();
    const optOutRepo = new InMemoryOptOutRepository();
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    runRepo.seed(run);
    const dispatcher = new CountingDispatcher();
    const lock = contendedAfterFirstAcquire();

    const deps = {
      runRepo,
      optOutRepo,
      subjectResolver: alwaysResolveSubject(),
      dispatcher,
      lock,
      rateLimit: noopRateLimit(),
      isWithinBusinessWindow: () => true,
      hasLeadReplied: async () => false,
    };

    const [first, second] = await Promise.all([
      advanceCadenceRun(deps, ORG, 'run-1', SEQUENCE, NOW),
      advanceCadenceRun(deps, ORG, 'run-1', SEQUENCE, NOW),
    ]);

    // Só um dos dois ciclos concorrentes despachou de verdade — nunca os dois.
    expect(dispatcher.calls).toHaveLength(1);
    const decisions = [first.decision.type, second.decision.type].sort();
    expect(decisions).toEqual(['dispatch', 'wait']);
    const lockedOne = [first, second].find((r) => r.decision.type === 'wait');
    expect(lockedOne?.decision).toEqual({ type: 'wait', reason: 'locked' });
  });

  it('trava indisponível: devolve wait/locked, não lança e não grava nada', async () => {
    const runRepo = new InMemoryCadenceRunRepository();
    const optOutRepo = new InMemoryOptOutRepository();
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    runRepo.seed(run);
    const dispatcher = new CountingDispatcher();

    const { run: returned, decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: alwaysResolveSubject(),
        dispatcher,
        lock: alwaysContended(),
        rateLimit: noopRateLimit(),
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-1',
      SEQUENCE,
      NOW,
    );

    expect(decision).toEqual({ type: 'wait', reason: 'locked' });
    expect(dispatcher.calls).toHaveLength(0);
    expect(returned.attempts).toHaveLength(0);
    expect(returned.currentTouchOrder).toBe(1);
  });

  it('libera a trava mesmo quando o dispatcher lança — próximo ciclo não fica travado para sempre', async () => {
    const runRepo = new InMemoryCadenceRunRepository();
    const optOutRepo = new InMemoryOptOutRepository();
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    runRepo.seed(run);

    let released = false;
    const lock: CadenceRunLockPort = {
      async acquire() {
        return {
          acquired: true,
          release: async () => {
            released = true;
          },
        };
      },
    };
    const throwingDispatcher: CadenceDispatcher = {
      async dispatch() {
        throw new Error('provedor caiu no meio do envio');
      },
    };

    await expect(
      advanceCadenceRun(
        {
          runRepo,
          optOutRepo,
          subjectResolver: alwaysResolveSubject(),
          dispatcher: throwingDispatcher,
          lock,
          rateLimit: noopRateLimit(),
          isWithinBusinessWindow: () => true,
          hasLeadReplied: async () => false,
        },
        ORG,
        'run-1',
        SEQUENCE,
        NOW,
      ),
    ).rejects.toThrow('provedor caiu no meio do envio');

    expect(released).toBe(true);
  });
});
