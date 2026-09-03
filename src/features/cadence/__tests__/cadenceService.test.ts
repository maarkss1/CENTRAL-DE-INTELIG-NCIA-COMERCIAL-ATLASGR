import { describe, it, expect, beforeEach } from 'vitest';
import {
  startCadenceRun,
  type CadenceSequenceDefinition,
  type CadenceTouch,
  type CadenceRunState,
} from '../domain/cadence';
import {
  advanceCadenceRun,
  type CadenceDispatcher,
  type CadenceRunLockPort,
  type CadenceRunRepository,
  type CadenceRateLimitPort,
  type LeadSubjectResolver,
} from '../application/cadenceService';
import { InMemoryCadenceRunRepository } from '../infra/InMemoryCadenceRunRepository';
import { InMemoryOptOutRepository } from '../infra/InMemoryOptOutRepository';
import { recordOptOut } from '../application/optOutService';

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
  return {
    async acquire() {
      return { acquired: true, release: async () => {} };
    },
  };
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
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    runRepo.seed(run);
    const dispatcher = new ScriptedDispatcher({ result: 'sent' });

    const { run: updated, decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: alwaysResolveSubject(),
        dispatcher,
        lock: noopLock(),
        rateLimit: noopRateLimit(),
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
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    runRepo.seed(run);
    const dispatcher = new ScriptedDispatcher({
      result: 'failed',
      error: 'SMTP recusou a conexão',
    });

    const { run: updated } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: alwaysResolveSubject(),
        dispatcher,
        lock: noopLock(),
        rateLimit: noopRateLimit(),
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
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
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
        rateLimit: noopRateLimit(),
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
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    runRepo.seed(run);
    const dispatcher = new ScriptedDispatcher({ result: 'sent' });

    const { decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: alwaysResolveSubject(),
        dispatcher,
        lock: noopLock(),
        rateLimit: noopRateLimit(),
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
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    runRepo.seed(run);
    const dispatcher = new ScriptedDispatcher({ result: 'sent' });

    const { run: updated, decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: alwaysResolveSubject(),
        dispatcher,
        lock: noopLock(),
        rateLimit: noopRateLimit(),
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
    const run: CadenceRunState = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    runRepo.seed(run);

    await expect(
      advanceCadenceRun(
        {
          runRepo,
          optOutRepo,
          subjectResolver: alwaysResolveSubject(),
          dispatcher: new ScriptedDispatcher({ result: 'sent' }),
          lock: noopLock(),
          rateLimit: noopRateLimit(),
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

// Achado de auditoria (Onda transversal — Agente 17): o envio real ao canal (`dispatcher.dispatch`)
// e a gravação do resultado (`runRepo.save`) não são uma operação atômica. Se o canal confirma o
// envio mas a gravação falha (blip de banco), o run persistido continua no mesmo `currentTouchOrder`
// — sem alguma proteção, o próximo ciclo do scheduler leria esse mesmo estado e despacharia de novo
// para o MESMO lead, duplicando a mensagem real. `advanceCadenceRun` agora tenta regravar (retry
// curto) antes de desistir; estes testes provam que (1) um blip transitório se recupera sem exigir
// um segundo envio, e (2) uma falha persistente ainda propaga o erro (nunca finge sucesso).
describe('advanceCadenceRun — persistência do resultado após envio real confirmado', () => {
  function repoThatFailsSaveNTimes(
    seeded: CadenceRunState,
    failCount: number,
  ): CadenceRunRepository {
    const inner = new InMemoryCadenceRunRepository();
    inner.seed(seeded);
    let failuresLeft = failCount;
    return {
      async save(run) {
        if (failuresLeft > 0) {
          failuresLeft--;
          throw new Error('Postgres indisponível momentaneamente');
        }
        await inner.save(run);
      },
      findById: (organizationId, id) => inner.findById(organizationId, id),
      listByOrganization: (organizationId, filter) =>
        inner.listByOrganization(organizationId, filter),
    };
  }

  it('blip transitório na gravação (1 falha) se recupera via retry sem despachar duas vezes', async () => {
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    const runRepo = repoThatFailsSaveNTimes(run, 1);
    const optOutRepo = new InMemoryOptOutRepository();
    const dispatcher = new ScriptedDispatcher({ result: 'sent' });

    const { run: updated, decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: alwaysResolveSubject(),
        dispatcher,
        lock: noopLock(),
        rateLimit: noopRateLimit(),
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-1',
      SEQUENCE,
      NOW,
    );

    expect(decision.type).toBe('dispatch');
    expect(dispatcher.calls).toHaveLength(1); // o canal real só foi chamado UMA vez, mesmo com o blip de gravação
    expect(updated.currentTouchOrder).toBe(2);
    expect(updated.attempts[0].result).toBe('sent');
  }, 10_000);

  it('falha persistente na gravação (excede o retry) propaga o erro em vez de fingir sucesso', async () => {
    const run = startCadenceRun({
      id: 'run-1',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: 'seq-1',
      startedAt: NOW,
    });
    const runRepo = repoThatFailsSaveNTimes(run, 10); // mais falhas do que o retry tenta
    const optOutRepo = new InMemoryOptOutRepository();
    const dispatcher = new ScriptedDispatcher({ result: 'sent' });

    await expect(
      advanceCadenceRun(
        {
          runRepo,
          optOutRepo,
          subjectResolver: alwaysResolveSubject(),
          dispatcher,
          lock: noopLock(),
          rateLimit: noopRateLimit(),
          isWithinBusinessWindow: () => true,
          hasLeadReplied: async () => false,
        },
        ORG,
        'run-1',
        SEQUENCE,
        NOW,
      ),
    ).rejects.toThrow('Postgres indisponível momentaneamente');

    // O canal real foi chamado (o envio já aconteceu de verdade) — a falha é só de gravação,
    // e continua sendo reportada como falha de ciclo (nunca sucesso silencioso).
    expect(dispatcher.calls).toHaveLength(1);
  }, 10_000);
});
