import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// RUN-011 (Onda 41/Agente 16): prova de que o WASocket (objeto em memória por processo) nunca é
// aberto duas vezes para a mesma organização entre réplicas — a trava distribuída em
// `acquireDistributedLock` (mockada aqui) decide posse; o heartbeat de renovação decide failover.

vi.mock('../../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../lib/async-context.js', () => ({
  requestContext: { run: (_ctx: unknown, fn: () => unknown) => fn() },
}));

// vi.mock(...) factories são hoisted para o topo do arquivo — variáveis que a fábrica referencia E
// que os testes também precisam manipular depois têm que nascer via vi.hoisted, senão o hoist da
// fábrica tenta ler a const antes dela ser inicializada (TDZ).
const cacheConnectionMock = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  keys: vi.fn().mockResolvedValue([]),
  del: vi.fn().mockResolvedValue(0),
}));
vi.mock('../../../../lib/queue/redis.js', () => ({
  cacheConnection: cacheConnectionMock,
  isDedicatedWorkerProcess: true,
}));

vi.mock('../../../../lib/queue/whatsappCommand.queue.js', () => ({
  enqueueWhatsAppCommand: vi.fn(),
}));

vi.mock('../../../../lib/http.js', () => ({
  withTimeout: (p: Promise<unknown>) => p,
}));

vi.mock('../../../../shared/middlewares/errorHandler.js', () => ({
  AppError: class AppError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../../../../lib/phone.js', () => ({
  toE164BR: (n: string) => n,
}));

vi.mock('../../../cadence/application/optOutService.js', () => ({
  isOptedOut: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../cadence/infra/PrismaOptOutRepository.js', () => ({
  prismaOptOutRepository: {},
}));

vi.mock('../whatsappMessage.service.js', () => ({
  extractMessageText: vi.fn(),
  persistWhatsAppMessage: vi.fn(),
}));

vi.mock('../useRedisAuthState.js', () => ({
  useRedisAuthState: vi.fn().mockResolvedValue({
    state: { creds: {}, keys: { get: vi.fn(), set: vi.fn() } },
    saveCreds: vi.fn(),
  }),
}));

const mockSock = vi.hoisted(() => ({
  ev: { on: vi.fn() },
  end: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  onWhatsApp: vi.fn(),
  sendMessage: vi.fn(),
}));
const makeWASocketMock = vi.hoisted(() => vi.fn((_config: unknown) => mockSock));

vi.mock('@whiskeysockets/baileys', () => ({
  default: (config: unknown) => makeWASocketMock(config),
  DisconnectReason: { loggedOut: 401 },
  Browsers: { macOS: () => ['Desktop', 'macOS', '1.0'] },
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 0] }),
}));

vi.mock('@hapi/boom', () => ({}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:qr') } }));
vi.mock('pino', () => ({ default: () => ({}) }));
vi.mock('fs', () => ({
  default: { existsSync: () => false, rmSync: vi.fn() },
  existsSync: () => false,
  rmSync: vi.fn(),
}));

const acquireDistributedLockMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/queue/distributedLock.js', () => ({
  acquireDistributedLock: (...args: unknown[]) => acquireDistributedLockMock(...args),
}));

import { initWhatsApp, shutdownWhatsAppSessions } from '../whatsapp.service.js';

function fakeLock(overrides: { acquired: boolean; reason?: string }) {
  return {
    runId: `run-${Math.random()}`,
    acquired: overrides.acquired,
    reason: overrides.reason ?? (overrides.acquired ? 'acquired' : 'contended'),
    renew: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cacheConnectionMock.get.mockResolvedValue(null);
  makeWASocketMock.mockReturnValue(mockSock);
  mockSock.ev.on.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('initWhatsApp — trava distribuída de posse do WASocket', () => {
  it('réplica sem a trava NÃO abre o WASocket (evita conexão duplicada)', async () => {
    acquireDistributedLockMock.mockResolvedValue(
      fakeLock({ acquired: false, reason: 'contended' }),
    );

    await initWhatsApp('org-lock-no-lock');

    expect(acquireDistributedLockMock).toHaveBeenCalledWith(
      'whatsapp:session-lock:org-lock-no-lock',
      30,
    );
    expect(makeWASocketMock).not.toHaveBeenCalled();
  });

  it('réplica com a trava abre o WASocket normalmente', async () => {
    acquireDistributedLockMock.mockResolvedValue(fakeLock({ acquired: true }));

    await initWhatsApp('org-lock-has-lock');

    expect(makeWASocketMock).toHaveBeenCalledTimes(1);
  });

  it('renova a trava (heartbeat) periodicamente antes do TTL expirar, enquanto o socket estiver vivo', async () => {
    vi.useFakeTimers();
    const lock = fakeLock({ acquired: true });
    acquireDistributedLockMock.mockResolvedValue(lock);

    await initWhatsApp('org-lock-heartbeat');
    expect(lock.renew).not.toHaveBeenCalled();

    // Heartbeat roda a cada 10s (TTL de 30s) — folga de 2 renovações perdidas antes do TTL
    // expirar de verdade.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(lock.renew).toHaveBeenCalledTimes(1);
    expect(lock.renew).toHaveBeenCalledWith(30);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(lock.renew).toHaveBeenCalledTimes(2);

    await shutdownWhatsAppSessions();
  });

  it('quando a renovação falha (TTL expirado/perda de posse), encerra o socket local em vez de seguir operando', async () => {
    vi.useFakeTimers();
    const lock = fakeLock({ acquired: true });
    lock.renew.mockResolvedValue(false); // outra réplica já assumiu, ou Redis indisponível
    acquireDistributedLockMock.mockResolvedValue(lock);

    await initWhatsApp('org-lock-expired');
    expect(makeWASocketMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);

    // A réplica que perdeu a posse encerra o próprio socket — nunca continua operando como se
    // ainda fosse dona (é exatamente isso que torna seguro outra réplica assumir depois do TTL).
    expect(mockSock.end).toHaveBeenCalledTimes(1);
    // Não tenta liberar (release) uma trava que já não é sua — a chave já pertence à outra réplica.
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('após perder/liberar a trava, uma nova tentativa de conexão consegue adquiri-la de novo (failover)', async () => {
    // 1ª tentativa: outra réplica é dona (contended).
    acquireDistributedLockMock.mockResolvedValueOnce(
      fakeLock({ acquired: false, reason: 'contended' }),
    );
    await initWhatsApp('org-lock-failover');
    expect(makeWASocketMock).not.toHaveBeenCalled();

    // 2ª tentativa (ex.: após o TTL da réplica anterior expirar e ela cair sem liberar):
    // agora a trava está livre e esta réplica assume.
    acquireDistributedLockMock.mockResolvedValueOnce(fakeLock({ acquired: true }));
    await initWhatsApp('org-lock-failover');
    expect(makeWASocketMock).toHaveBeenCalledTimes(1);
  });

  it('shutdown gracioso libera a trava explicitamente (não depende só do TTL expirar)', async () => {
    const lock = fakeLock({ acquired: true });
    acquireDistributedLockMock.mockResolvedValue(lock);

    await initWhatsApp('org-lock-shutdown');
    expect(makeWASocketMock).toHaveBeenCalledTimes(1);

    await shutdownWhatsAppSessions();

    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(mockSock.end).toHaveBeenCalled();
  });

  it('reconexão da mesma réplica (socket ainda vivo, mesma posse) não tenta readquirir a trava', async () => {
    const lock = fakeLock({ acquired: true });
    acquireDistributedLockMock.mockResolvedValue(lock);

    await initWhatsApp('org-lock-reconnect');
    expect(acquireDistributedLockMock).toHaveBeenCalledTimes(1);

    // Chamada de reconexão manual (ex.: o próprio fluxo de reconexão automático) enquanto ainda
    // detemos a trava — não deve tentar adquirir de novo (um SET NX contra a própria chave
    // falharia como "contended" e cancelaria a reconexão por engano).
    await initWhatsApp('org-lock-reconnect');
    expect(acquireDistributedLockMock).toHaveBeenCalledTimes(1);
  });
});
