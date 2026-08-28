import { describe, it, expect, vi, beforeEach } from 'vitest';

// Onda 7 (Agente 07) — dois gaps reais fechados nesta suíte:
// 1. Retry com backoff quando a ação de uma automação falha (antes: falhava uma vez e acabava).
// 2. Idempotência de disparo: o mesmo evento processado duas vezes (replay/corrida) só executa a
//    ação uma vez, via `automation-idempotency.service.ts` (dedupe por hash do evento no Redis).
//
// Mocks: `prisma`, `notificationService` e `automationHistoryService` são substituídos por
// dublês simples — o objetivo aqui é o COMPORTAMENTO do motor (quantas vezes a ação/efeito
// colateral roda, o que vai para o histórico), não a persistência real (já coberta noutro nível).
// `@/lib/queue/redis` usa um Redis falso em memória com semântica real de `SET NX EX`, para que o
// dedupe de idempotência seja exercitado de ponta a ponta (mesma lógica que roda em produção),
// não simulado por fora.

const mocks = vi.hoisted(() => ({
  automationFindMany: vi.fn(),
  automationUpdate: vi.fn(),
  activityCreate: vi.fn(),
  notificationCreate: vi.fn(),
  historyRecord: vi.fn(),
  sendEmail: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  redisStore: new Map<string, number>(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    automation: { findMany: mocks.automationFindMany, update: mocks.automationUpdate },
    activity: { create: mocks.activityCreate },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn, error: mocks.loggerError },
}));

vi.mock('@/features/notifications/notification.service', () => ({
  notificationService: { create: mocks.notificationCreate },
}));

vi.mock('@/features/automations/automation-history.service', () => ({
  automationHistoryService: { record: mocks.historyRecord },
}));

vi.mock('@/lib/email/mailer', () => ({
  sendEmail: mocks.sendEmail,
  MailerNotConfiguredError: class MailerNotConfiguredError extends Error {},
}));

// Redis falso com a mesma semântica de `SET key value EX ttl NX` usada por
// `automation-idempotency.service.ts` — TTL real respeitado, para o teste de "conteúdo diferente
// não deduplica" ficar honesto (chave diferente => sempre aceita).
vi.mock('@/lib/queue/redis', () => ({
  redisConfigured: true,
  cacheConnection: {
    set: vi.fn(async (key: string, _value: string, _ex: 'EX', ttlSeconds: number, _nx: 'NX') => {
      const now = Date.now();
      const expiresAt = mocks.redisStore.get(key);
      if (expiresAt !== undefined && expiresAt > now) return null;
      mocks.redisStore.set(key, now + ttlSeconds * 1000);
      return 'OK';
    }),
  },
}));

import { automationEngine } from '../automation.engine';
import type { AutomationEvent } from '../automation.engine';

function makeAutomation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'auto-1',
    organizationId: 'org-1',
    name: 'Notifica time',
    enabled: true,
    trigger: 'Lead_Criado',
    conditions: null,
    action: 'Notificar_Equipe',
    actionConfig: { channel: 'in_app' },
    lastRunAt: null,
    runCount: 0,
    ...overrides,
  };
}

const baseEvent: AutomationEvent = {
  organizationId: 'org-1',
  trigger: 'Lead criado',
  entity: 'Lead',
  entityId: 'lead-1',
  data: { status: 'Novo', owner: 'Maria' },
};

describe('AutomationEngine — retry com backoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisStore.clear();
    mocks.automationUpdate.mockResolvedValue({});
    mocks.historyRecord.mockResolvedValue(undefined);
    mocks.notificationCreate.mockResolvedValue({ id: 'notif-1' });
  });

  it('ação transitória falha 2 vezes e sucede na 3ª tentativa: histórico registra sucesso com retryCount=2, sem duplicar o efeito colateral já bem-sucedido', async () => {
    mocks.automationFindMany.mockResolvedValue([
      makeAutomation({ actionConfig: { channel: 'email', to: 'time@atlasgr.com.br' } }),
    ]);
    mocks.sendEmail
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ id: 'email-1' });

    const executed = await automationEngine.handle(baseEvent);

    expect(executed).toBe(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
    // A notificação in-app é o efeito colateral que JÁ tinha sucedido na 1ª tentativa — o
    // retry (motivado só pela falha do e-mail) não pode recriá-la a cada tentativa.
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.automationUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.historyRecord).toHaveBeenCalledTimes(1);
    const history = mocks.historyRecord.mock.calls[0][0];
    expect(history.status).toBe('success');
    expect(history.retryCount).toBe(2);
  }, 10_000);

  it('ação transitória falha em todas as tentativas: histórico registra failed com retryCount = tentativas-1, automação não é marcada como executada', async () => {
    mocks.automationFindMany.mockResolvedValue([
      makeAutomation({ actionConfig: { channel: 'email', to: 'time@atlasgr.com.br' } }),
    ]);
    mocks.sendEmail.mockRejectedValue(new Error('SMTP indisponível'));

    const executed = await automationEngine.handle(baseEvent);

    expect(executed).toBe(0);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
    expect(mocks.automationUpdate).not.toHaveBeenCalled();
    expect(mocks.historyRecord).toHaveBeenCalledTimes(1);
    const history = mocks.historyRecord.mock.calls[0][0];
    expect(history.status).toBe('failed');
    expect(history.retryCount).toBe(2);
    expect(history.error).toBeInstanceOf(Error);
  }, 10_000);

  it('erro de configuração da própria regra (destinatário de e-mail ausente) não entra em retry: falha uma única vez, sem tentar de novo', async () => {
    mocks.automationFindMany.mockResolvedValue([
      makeAutomation({ actionConfig: { channel: 'email' } }), // sem "to"
    ]);

    const executed = await automationEngine.handle(baseEvent);

    expect(executed).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    const history = mocks.historyRecord.mock.calls[0][0];
    expect(history.status).toBe('failed');
    expect(history.retryCount).toBe(0);
  });
});

describe('AutomationEngine — idempotência de disparo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisStore.clear();
    mocks.automationUpdate.mockResolvedValue({});
    mocks.historyRecord.mockResolvedValue(undefined);
    mocks.notificationCreate.mockResolvedValue({ id: 'notif-1' });
    mocks.automationFindMany.mockResolvedValue([makeAutomation()]);
  });

  it('o mesmo evento de disparo, processado duas vezes (replay/corrida), só executa a ação uma vez', async () => {
    const firstRun = await automationEngine.handle(baseEvent);
    const secondRun = await automationEngine.handle({ ...baseEvent, data: { ...baseEvent.data } });

    expect(firstRun).toBe(1);
    expect(secondRun).toBe(0);
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
    // A segunda chamada nem chega a rodar a ação, então não deveria nem passar por
    // `automation.update`/histórico de execução novamente.
    expect(mocks.automationUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.historyRecord).toHaveBeenCalledTimes(1);
  });

  it('dois eventos com conteúdo distinto (mesma automação/entidade) NÃO são deduplicados — cada um é um evento de negócio real', async () => {
    const firstRun = await automationEngine.handle(baseEvent);
    const secondRun = await automationEngine.handle({
      ...baseEvent,
      data: { status: 'Proposta Enviada', owner: 'Maria' },
    });

    expect(firstRun).toBe(1);
    expect(secondRun).toBe(1);
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(2);
  });

  it('eventos de organizações diferentes para o "mesmo" conteúdo nunca colidem', async () => {
    const firstRun = await automationEngine.handle(baseEvent);
    const secondRun = await automationEngine.handle({ ...baseEvent, organizationId: 'org-2' });

    expect(firstRun).toBe(1);
    // org-2 não tem automação nenhuma no mock (findMany sempre devolve a mesma automação de
    // org-1 neste teste) — o ponto aqui é só confirmar que a idempotência não bloqueou por
    // engano; `handleScoped` já filtra por organizationId na query real.
    expect(secondRun).toBe(1);
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(2);
  });
});
