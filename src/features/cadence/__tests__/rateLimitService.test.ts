import { describe, it, expect, beforeEach } from 'vitest';
import {
  startCadenceRun,
  recordTouchAttempt,
  type CadenceSequenceDefinition,
  type CadenceTouch,
  type CadenceRunState,
} from '../domain/cadence';
import type { CadenceRateLimitPolicy } from '../domain/rateLimit';
import {
  advanceCadenceRun,
  type CadenceDispatcher,
  type CadenceRunLockPort,
  type LeadSubjectResolver,
} from '../application/cadenceService';
import { evaluateRateLimitForUpcomingTouch } from '../application/rateLimitService';
import { InMemoryCadenceRunRepository } from '../infra/InMemoryCadenceRunRepository';
import { InMemoryOptOutRepository } from '../infra/InMemoryOptOutRepository';
import { InMemoryCadenceRateLimitPort } from '../infra/InMemoryCadenceRateLimitPort';

/**
 * Cobertura de integração do rate limit por contato/domínio (auditoria transversal, Agente 17) —
 * ver `domain/rateLimit.ts` (política/decisão pura) e `rateLimit.test.ts` (cobertura pura).
 *
 * O cenário central que motivou este rate limit — várias cadências/campanhas DIFERENTES mirando o
 * MESMO lead — é montado seedando mais de um `CadenceRunState` (ids/sequenceIds diferentes) com o
 * mesmo `leadId` no MESMO `InMemoryCadenceRunRepository`: exatamente o que o lock existente
 * (`CadenceRunLockPort`, só por `runId`) não protege.
 */

const ORG = 'org-1';
const NOW = new Date('2026-08-03T12:00:00Z');

const EMAIL_TOUCH_SEQUENCE: CadenceSequenceDefinition = {
  id: 'seq-email',
  name: 'Só e-mail',
  touches: [{ order: 1, channel: 'email', delayHoursFromPrevious: 0 }],
};

const WHATSAPP_TOUCH_SEQUENCE: CadenceSequenceDefinition = {
  id: 'seq-whatsapp',
  name: 'Só WhatsApp',
  touches: [{ order: 1, channel: 'whatsapp', delayHoursFromPrevious: 0 }],
};

function noopLock(): CadenceRunLockPort {
  return {
    async acquire() {
      return { acquired: true, release: async () => {} };
    },
  };
}

class ScriptedDispatcher implements CadenceDispatcher {
  calls: CadenceTouch[] = [];
  async dispatch(touch: CadenceTouch) {
    this.calls.push(touch);
    return { result: 'sent' as const, providerMessageId: 'msg-fake' };
  }
}

/** Um run já concluído/histórico com `count` toques 'sent' no canal informado, terminados em `sentAt` — simula uma cadência ANTERIOR/PARALELA diferente da que está sendo avançada agora. */
function seedPriorSentTouches(
  runRepo: InMemoryCadenceRunRepository,
  input: {
    runId: string;
    leadId: string;
    channel: 'email' | 'whatsapp' | 'voice';
    count: number;
    sentAt: Date;
  },
): void {
  let run: CadenceRunState = startCadenceRun({
    id: input.runId,
    organizationId: ORG,
    leadId: input.leadId,
    sequenceId: `seq-historico-${input.runId}`,
    startedAt: input.sentAt,
  });
  const historicalSequence: CadenceSequenceDefinition = {
    id: `seq-historico-${input.runId}`,
    name: 'histórico',
    touches: Array.from({ length: input.count }, (_, i) => ({
      order: i + 1,
      channel: input.channel,
      delayHoursFromPrevious: 0,
    })),
  };
  for (let i = 0; i < input.count; i++) {
    run = recordTouchAttempt(run, historicalSequence, historicalSequence.touches[i], input.sentAt, {
      result: 'sent',
    });
  }
  runRepo.seed(run);
}

function emailResolverFrom(map: Record<string, string | null>): LeadSubjectResolver {
  return {
    async resolve(_organizationId, leadId) {
      return { leadId, email: map[leadId] ?? null, phoneE164: null };
    },
  };
}

describe('rate limit por contato — no máximo N toques (default 3) em 24h, qualquer canal/cadência', () => {
  let runRepo: InMemoryCadenceRunRepository;
  let optOutRepo: InMemoryOptOutRepository;

  beforeEach(() => {
    runRepo = new InMemoryCadenceRunRepository();
    optOutRepo = new InMemoryOptOutRepository();
  });

  it('(a) contato já no limite (3 toques em outra cadência, últimas 24h) é bloqueado — decisão wait/contact-rate-limit, dispatcher nunca chamado', async () => {
    const LEAD = 'lead-no-limite';
    // 3 toques 'sent' de uma cadência DIFERENTE (run/seq diferentes), 1h atrás — dentro da janela de 24h.
    seedPriorSentTouches(runRepo, {
      runId: 'run-historico',
      leadId: LEAD,
      channel: 'whatsapp',
      count: 3,
      sentAt: new Date(NOW.getTime() - 3_600_000),
    });

    const newRun = startCadenceRun({
      id: 'run-novo',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: EMAIL_TOUCH_SEQUENCE.id,
      startedAt: NOW,
    });
    runRepo.seed(newRun);

    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, () => null);
    const dispatcher = new ScriptedDispatcher();

    const { run: updated, decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: emailResolverFrom({}),
        dispatcher,
        lock: noopLock(),
        rateLimit,
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-novo',
      EMAIL_TOUCH_SEQUENCE,
      NOW,
    );

    expect(decision).toEqual({ type: 'wait', reason: 'contact-rate-limit' });
    expect(dispatcher.calls).toHaveLength(0);
    expect(updated.status).toBe('active'); // bloqueio de volume não encerra a cadência
    expect(updated.currentTouchOrder).toBe(1); // não consome o toque

    // (d) motivo registrado e consultável — não falha silenciosamente.
    expect(updated.attempts).toHaveLength(1);
    expect(updated.attempts[0]).toMatchObject({
      result: 'skipped',
      skipReason: 'contact-rate-limit',
      touchOrder: 1,
    });

    const reloaded = await runRepo.findById(ORG, 'run-novo');
    expect(reloaded?.attempts[0].skipReason).toBe('contact-rate-limit');
  });

  it('(b) contato abaixo do limite (2 toques anteriores) passa normalmente — dispatcher chamado, toque avança', async () => {
    const LEAD = 'lead-abaixo-do-limite';
    seedPriorSentTouches(runRepo, {
      runId: 'run-historico',
      leadId: LEAD,
      channel: 'whatsapp',
      count: 2,
      sentAt: new Date(NOW.getTime() - 3_600_000),
    });

    const newRun = startCadenceRun({
      id: 'run-novo',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: EMAIL_TOUCH_SEQUENCE.id,
      startedAt: NOW,
    });
    runRepo.seed(newRun);

    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, () => null);
    const dispatcher = new ScriptedDispatcher();

    const { run: updated, decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: emailResolverFrom({}),
        dispatcher,
        lock: noopLock(),
        rateLimit,
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-novo',
      EMAIL_TOUCH_SEQUENCE,
      NOW,
    );

    expect(decision.type).toBe('dispatch');
    expect(dispatcher.calls).toHaveLength(1);
    expect(updated.attempts[0].result).toBe('sent');
    expect(updated.currentTouchOrder).toBe(2); // sequência de 1 toque concluída → avança/encerra
  });

  it('toques fora da janela de 24h não contam para o limite', async () => {
    const LEAD = 'lead-toques-antigos';
    // 3 toques 'sent', mas há 48h — fora da janela deslizante de 24h.
    seedPriorSentTouches(runRepo, {
      runId: 'run-historico',
      leadId: LEAD,
      channel: 'whatsapp',
      count: 3,
      sentAt: new Date(NOW.getTime() - 48 * 3_600_000),
    });

    const newRun = startCadenceRun({
      id: 'run-novo',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: EMAIL_TOUCH_SEQUENCE.id,
      startedAt: NOW,
    });
    runRepo.seed(newRun);

    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, () => null);
    const dispatcher = new ScriptedDispatcher();

    const { decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: emailResolverFrom({}),
        dispatcher,
        lock: noopLock(),
        rateLimit,
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-novo',
      EMAIL_TOUCH_SEQUENCE,
      NOW,
    );

    expect(decision.type).toBe('dispatch');
    expect(dispatcher.calls).toHaveLength(1);
  });

  it('bloqueio repetido no mesmo motivo não acumula uma linha nova de tentativa a cada ciclo (evita ruído no histórico)', async () => {
    const LEAD = 'lead-bloqueado-repetido';
    seedPriorSentTouches(runRepo, {
      runId: 'run-historico',
      leadId: LEAD,
      channel: 'whatsapp',
      count: 3,
      sentAt: new Date(NOW.getTime() - 3_600_000),
    });

    const newRun = startCadenceRun({
      id: 'run-novo',
      organizationId: ORG,
      leadId: LEAD,
      sequenceId: EMAIL_TOUCH_SEQUENCE.id,
      startedAt: NOW,
    });
    runRepo.seed(newRun);

    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, () => null);
    const deps = {
      runRepo,
      optOutRepo,
      subjectResolver: emailResolverFrom({}),
      dispatcher: new ScriptedDispatcher(),
      lock: noopLock(),
      rateLimit,
      isWithinBusinessWindow: () => true,
      hasLeadReplied: async () => false,
    };

    await advanceCadenceRun(deps, ORG, 'run-novo', EMAIL_TOUCH_SEQUENCE, NOW);
    const fiveMinutesLater = new Date(NOW.getTime() + 5 * 60_000);
    const { run: afterSecondTick } = await advanceCadenceRun(
      deps,
      ORG,
      'run-novo',
      EMAIL_TOUCH_SEQUENCE,
      fiveMinutesLater,
    );

    expect(afterSecondTick.attempts).toHaveLength(1); // não uma segunda linha 'skipped'
  });
});

describe('rate limit por domínio — no máximo M contatos distintos recebendo e-mail no mesmo dia', () => {
  let runRepo: InMemoryCadenceRunRepository;
  let optOutRepo: InMemoryOptOutRepository;
  const DOMAIN_LIMIT_ONE: CadenceRateLimitPolicy = {
    maxTouchesPerContactWindow: 3,
    contactWindowHours: 24,
    maxEmailRecipientsPerDomainPerDay: 1,
    minMinutesBetweenChannelTouches: 30,
  };

  beforeEach(() => {
    runRepo = new InMemoryCadenceRunRepository();
    optOutRepo = new InMemoryOptOutRepository();
  });

  it('(c) domínio no limite bloqueia um NOVO contato desse domínio no canal e-mail', async () => {
    const LEAD_A = 'lead-ja-contado';
    const LEAD_B = 'lead-novo-mesmo-dominio';
    const emails: Record<string, string | null> = {
      [LEAD_A]: 'a@empresa.com.br',
      [LEAD_B]: 'b@empresa.com.br',
    };

    // Lead A já recebeu e-mail hoje — ocupa a única vaga do domínio (M=1).
    seedPriorSentTouches(runRepo, {
      runId: 'run-a',
      leadId: LEAD_A,
      channel: 'email',
      count: 1,
      sentAt: new Date(NOW.getTime() - 3_600_000),
    });

    const runB = startCadenceRun({
      id: 'run-b',
      organizationId: ORG,
      leadId: LEAD_B,
      sequenceId: EMAIL_TOUCH_SEQUENCE.id,
      startedAt: NOW,
    });
    runRepo.seed(runB);

    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, (leadId) => emails[leadId] ?? null);
    const dispatcher = new ScriptedDispatcher();

    const { run: updated, decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: emailResolverFrom(emails),
        dispatcher,
        lock: noopLock(),
        rateLimit,
        rateLimitPolicy: DOMAIN_LIMIT_ONE,
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-b',
      EMAIL_TOUCH_SEQUENCE,
      NOW,
    );

    expect(decision).toEqual({ type: 'wait', reason: 'domain-rate-limit' });
    expect(dispatcher.calls).toHaveLength(0);
    expect(updated.attempts[0]).toMatchObject({
      result: 'skipped',
      skipReason: 'domain-rate-limit',
    });
  });

  it('domínio no limite NÃO bloqueia canal diferente de e-mail para o mesmo contato novo', async () => {
    const LEAD_A = 'lead-ja-contado';
    const LEAD_B = 'lead-novo-mesmo-dominio-whatsapp';
    const emails: Record<string, string | null> = {
      [LEAD_A]: 'a@empresa.com.br',
      [LEAD_B]: 'b@empresa.com.br',
    };

    seedPriorSentTouches(runRepo, {
      runId: 'run-a',
      leadId: LEAD_A,
      channel: 'email',
      count: 1,
      sentAt: new Date(NOW.getTime() - 3_600_000),
    });

    const runB = startCadenceRun({
      id: 'run-b',
      organizationId: ORG,
      leadId: LEAD_B,
      sequenceId: WHATSAPP_TOUCH_SEQUENCE.id,
      startedAt: NOW,
    });
    runRepo.seed(runB);

    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, (leadId) => emails[leadId] ?? null);
    const dispatcher = new ScriptedDispatcher();

    const { decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: emailResolverFrom(emails),
        dispatcher,
        lock: noopLock(),
        rateLimit,
        rateLimitPolicy: DOMAIN_LIMIT_ONE,
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-b',
      WHATSAPP_TOUCH_SEQUENCE,
      NOW,
    );

    expect(decision.type).toBe('dispatch'); // WhatsApp não tem limite de domínio
    expect(dispatcher.calls).toHaveLength(1);
  });

  it('domínio no limite NÃO afeta um contato de domínio DIFERENTE', async () => {
    const LEAD_A = 'lead-ja-contado';
    const LEAD_C = 'lead-outro-dominio';
    const emails: Record<string, string | null> = {
      [LEAD_A]: 'a@empresa.com.br',
      [LEAD_C]: 'c@outraempresa.com.br',
    };

    seedPriorSentTouches(runRepo, {
      runId: 'run-a',
      leadId: LEAD_A,
      channel: 'email',
      count: 1,
      sentAt: new Date(NOW.getTime() - 3_600_000),
    });

    const runC = startCadenceRun({
      id: 'run-c',
      organizationId: ORG,
      leadId: LEAD_C,
      sequenceId: EMAIL_TOUCH_SEQUENCE.id,
      startedAt: NOW,
    });
    runRepo.seed(runC);

    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, (leadId) => emails[leadId] ?? null);
    const dispatcher = new ScriptedDispatcher();

    const { decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: emailResolverFrom(emails),
        dispatcher,
        lock: noopLock(),
        rateLimit,
        rateLimitPolicy: DOMAIN_LIMIT_ONE,
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-c',
      EMAIL_TOUCH_SEQUENCE,
      NOW,
    );

    expect(decision.type).toBe('dispatch'); // domínio diferente, cota própria
    expect(dispatcher.calls).toHaveLength(1);
  });

  it('um contato que já é o próprio destinatário contado hoje não é bloqueado de novo por domain-rate-limit (não é um destinatário NOVO)', async () => {
    const LEAD_A = 'lead-ja-contado-de-novo';
    const emails: Record<string, string | null> = { [LEAD_A]: 'a@empresa.com.br' };

    // Lead A já recebeu 1 e-mail hoje (ocupando a única vaga do domínio) — agora uma cadência
    // DIFERENTE tenta mandar OUTRO e-mail para o MESMO lead A.
    seedPriorSentTouches(runRepo, {
      runId: 'run-a-historico',
      leadId: LEAD_A,
      channel: 'email',
      count: 1,
      sentAt: new Date(NOW.getTime() - 3_600_000),
    });

    const runNovo = startCadenceRun({
      id: 'run-a-novo',
      organizationId: ORG,
      leadId: LEAD_A,
      sequenceId: EMAIL_TOUCH_SEQUENCE.id,
      startedAt: NOW,
    });
    runRepo.seed(runNovo);

    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, (leadId) => emails[leadId] ?? null);
    const dispatcher = new ScriptedDispatcher();

    const { decision } = await advanceCadenceRun(
      {
        runRepo,
        optOutRepo,
        subjectResolver: emailResolverFrom(emails),
        dispatcher,
        lock: noopLock(),
        rateLimit,
        rateLimitPolicy: DOMAIN_LIMIT_ONE,
        isWithinBusinessWindow: () => true,
        hasLeadReplied: async () => false,
      },
      ORG,
      'run-a-novo',
      EMAIL_TOUCH_SEQUENCE,
      NOW,
    );

    // Não é domain-rate-limit (ele já é o contato contado) — mas o CONTATO já tem 1 toque
    // 'sent' na janela de 24h, abaixo do teto padrão de 3, então despacha normalmente.
    expect(decision.type).toBe('dispatch');
    expect(dispatcher.calls).toHaveLength(1);
  });
});

describe('evaluateRateLimitForUpcomingTouch — política customizada via parâmetro (não hardcoded)', () => {
  it('usa a política passada em vez do default quando fornecida', async () => {
    const runRepo = new InMemoryCadenceRunRepository();
    const LEAD = 'lead-politica-custom';
    seedPriorSentTouches(runRepo, {
      runId: 'run-historico',
      leadId: LEAD,
      channel: 'email',
      count: 1,
      sentAt: new Date(NOW.getTime() - 3_600_000),
    });
    const rateLimit = new InMemoryCadenceRateLimitPort(runRepo, () => null);

    const tightPolicy: CadenceRateLimitPolicy = {
      maxTouchesPerContactWindow: 1,
      contactWindowHours: 24,
      maxEmailRecipientsPerDomainPerDay: 20,
      minMinutesBetweenChannelTouches: 30,
    };
    const reason = await evaluateRateLimitForUpcomingTouch(rateLimit, {
      organizationId: ORG,
      leadId: LEAD,
      email: null,
      channel: 'email',
      now: NOW,
      policy: tightPolicy,
    });

    expect(reason).toBe('contact-rate-limit'); // com o default (3) este mesmo cenário passaria
  });
});
