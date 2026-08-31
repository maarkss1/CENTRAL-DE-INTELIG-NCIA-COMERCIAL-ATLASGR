import makeWASocket, {
  DisconnectReason,
  Browsers,
  type WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import type { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { requestContext } from '../../../lib/async-context.js';
import { logger } from '../../../lib/logger.js';
import { extractMessageText, persistWhatsAppMessage } from './whatsappMessage.service.js';
import { cacheConnection, isDedicatedWorkerProcess } from '../../../lib/queue/redis.js';
import { enqueueWhatsAppCommand } from '../../../lib/queue/whatsappCommand.queue.js';
import { withTimeout } from '../../../lib/http.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { toE164BR } from '../../../lib/phone.js';
import { isOptedOut } from '../../cadence/application/optOutService.js';
import { prismaOptOutRepository } from '../../cadence/infra/PrismaOptOutRepository.js';
import { useRedisAuthState } from './useRedisAuthState.js';
import {
  acquireDistributedLock,
  type DistributedLock,
} from '../../../lib/queue/distributedLock.js';

const BAILEYS_CALL_TIMEOUT_MS = 15_000;

export const whatsappEvents = new EventEmitter();

type WASocketLogger = Parameters<typeof makeWASocket>[0]['logger'];

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 60000;

// RUN-011 (Onda 41/Agente 16): o WASocket é um objeto em memória por processo — sem trava, duas
// réplicas de `prospector-atlas-worker` (worker.replicaCount > 1 + HPA) poderiam abrir, para a
// MESMA organização, duas conexões WhatsApp Web simultâneas do mesmo dispositivo vinculado. O
// protocolo do Baileys/WhatsApp não tolera isso bem (desconexões, mensagens perdidas/duplicadas,
// em casos extremos banimento do número). A trava distribuída abaixo garante posse exclusiva por
// organização; TTL curto + heartbeat de renovação garantem failover real se a réplica dona cair
// sem liberar a trava (não é um lock permanente).
const WHATSAPP_LOCK_TTL_SECONDS = 30;
const WHATSAPP_LOCK_HEARTBEAT_MS = 10_000; // renova a ~1/3 do TTL — folga de 2 tentativas perdidas
const MAX_LOCK_ACQUIRE_ATTEMPTS = 5;
const LOCK_RETRY_BASE_DELAY_MS = 3_000;
const LOCK_RETRY_MAX_DELAY_MS = 30_000;

function sessionLockKey(organizationId: string): string {
  return `whatsapp:session-lock:${organizationId}`;
}

interface TenantSession {
  sock: WASocket | null;
  currentQr: string | null;
  status: 'disconnected' | 'connecting' | 'connected';
  reconnectAttempts: number;
  lock: DistributedLock | null;
  lockHeartbeat: ReturnType<typeof setInterval> | null;
  lockRetryAttempts: number;
}

const sessions = new Map<string, TenantSession>();

function getSession(organizationId: string): TenantSession {
  let session = sessions.get(organizationId);
  if (!session) {
    session = {
      sock: null,
      currentQr: null,
      status: 'disconnected',
      reconnectAttempts: 0,
      lock: null,
      lockHeartbeat: null,
      lockRetryAttempts: 0,
    };
    sessions.set(organizationId, session);
  }
  return session;
}

function stopLockHeartbeat(session: TenantSession): void {
  if (session.lockHeartbeat) {
    clearInterval(session.lockHeartbeat);
    session.lockHeartbeat = null;
  }
}

function startLockHeartbeat(organizationId: string, session: TenantSession): void {
  stopLockHeartbeat(session);
  const timer = setInterval(() => {
    void (async () => {
      const lock = session.lock;
      if (!lock) return;
      const renewed = await lock.renew(WHATSAPP_LOCK_TTL_SECONDS);
      if (renewed) return;
      // Fail-closed: se não confirmamos a renovação, tratamos como perda de posse (outra
      // réplica pode ter assumido após o TTL expirar). NUNCA seguimos operando o socket
      // local como se ainda fôssemos donos — isso é exatamente o cenário de duas conexões
      // simultâneas que a trava existe para prevenir.
      logger.error(
        { organizationId },
        'WhatsApp: perdeu a posse da trava distribuída da sessão (TTL expirado ou Redis indisponível); encerrando socket local para evitar conexão duplicada.',
      );
      stopLockHeartbeat(session);
      session.lock = null;
      const sock = session.sock;
      session.sock = null;
      session.status = 'disconnected';
      session.currentQr = null;
      if (sock) {
        try {
          sock.end(new Error('distributed lock lost'));
        } catch (err) {
          logger.warn(
            { err, organizationId },
            'WhatsApp: erro ao fechar socket após perda da trava',
          );
        }
      }
      await persistStatusToRedis(organizationId, session);
      whatsappEvents.emit('status', { organizationId, status: session.status });
    })();
  }, WHATSAPP_LOCK_HEARTBEAT_MS);
  timer.unref?.();
  session.lockHeartbeat = timer;
}

async function releaseSessionLock(organizationId: string, session: TenantSession): Promise<void> {
  stopLockHeartbeat(session);
  const lock = session.lock;
  session.lock = null;
  if (!lock) return;
  try {
    await lock.release();
  } catch (err) {
    logger.warn(
      { err, organizationId },
      'WhatsApp: falha ao liberar a trava distribuída da sessão; TTL fará a limpeza.',
    );
  }
}

function scheduleLockRetry(organizationId: string, session: TenantSession): void {
  if (session.lockRetryAttempts >= MAX_LOCK_ACQUIRE_ATTEMPTS) {
    logger.error(
      { organizationId, attempts: session.lockRetryAttempts },
      'WhatsApp: desistindo de adquirir a trava distribuída após múltiplas tentativas; outra réplica parece manter a sessão ativa.',
    );
    session.lockRetryAttempts = 0;
    return;
  }
  session.lockRetryAttempts += 1;
  const delay = Math.min(
    LOCK_RETRY_BASE_DELAY_MS * 2 ** (session.lockRetryAttempts - 1),
    LOCK_RETRY_MAX_DELAY_MS,
  );
  setTimeout(() => {
    initWhatsApp(organizationId).catch(() => undefined);
  }, delay).unref?.();
}

const WHATSAPP_STATUS_KEY_PREFIX = 'whatsapp:session-status';

async function persistStatusToRedis(organizationId: string, session: TenantSession): Promise<void> {
  try {
    await cacheConnection.set(
      `${WHATSAPP_STATUS_KEY_PREFIX}:${organizationId}`,
      JSON.stringify({ status: session.status, qr: session.currentQr }),
      'EX',
      60 * 60 * 24,
    );
  } catch (err) {
    logger.warn({ err, organizationId }, 'WhatsApp: falha ao espelhar status no Redis');
  }
}

function authFolderFor(organizationId: string): string {
  const safeId = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(process.cwd(), 'whatsapp_auth', safeId);
}

export async function initWhatsApp(organizationId: string) {
  const session = getSession(organizationId);
  if (session.status === 'connected') return;

  // Posse exclusiva do WASocket por organização entre réplicas. Se já detemos a trava (ex.:
  // reconexão automática após um `close` recuperável na mesma réplica), não tentamos readquirir
  // — um SET NX contra a própria chave que já detemos falharia (contended) e nos faria desistir
  // de reconectar por engano.
  if (!session.lock?.acquired) {
    const lock = await acquireDistributedLock(
      sessionLockKey(organizationId),
      WHATSAPP_LOCK_TTL_SECONDS,
    );
    if (!lock.acquired) {
      logger.warn(
        { organizationId, reason: lock.reason },
        'WhatsApp: outra réplica já detém a trava da sessão desta organização; conexão NÃO será aberta aqui para evitar WASocket duplicado.',
      );
      session.status = 'disconnected';
      await persistStatusToRedis(organizationId, session);
      scheduleLockRetry(organizationId, session);
      return;
    }
    session.lock = lock;
    session.lockRetryAttempts = 0;
    startLockHeartbeat(organizationId, session);
  }

  session.status = 'connecting';
  await persistStatusToRedis(organizationId, session);
  const authFolder = authFolderFor(organizationId);

  let sock: WASocket;
  let saveCreds: () => Promise<void>;
  try {
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }

    // useRedisAuthState não é um hook React — é uma função de infra (Baileys/Redis) cujo nome
    // começa com "use" por coincidência.
    // biome-ignore lint/correctness/useHookAtTopLevel: ver comentário acima
    const authState = await useRedisAuthState(cacheConnection, organizationId);
    saveCreds = authState.saveCreds;
    const { version } = await withTimeout(fetchLatestBaileysVersion(), 15_000);

    sock = makeWASocket({
      auth: authState.state,
      version,
      printQRInTerminal: false,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false,
      logger: pino({ level: 'silent' }) as unknown as WASocketLogger,
    });
  } catch (err) {
    session.status = 'disconnected';
    await persistStatusToRedis(organizationId, session);
    await releaseSessionLock(organizationId, session);
    logger.error({ err, organizationId }, 'WhatsApp: falha ao inicializar sessão.');
    throw err;
  }
  session.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.currentQr = await qrcode.toDataURL(qr);
      await persistStatusToRedis(organizationId, session);
      whatsappEvents.emit('qr', { organizationId, qr: session.currentQr });
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      session.status = 'disconnected';
      session.currentQr = null;
      await persistStatusToRedis(organizationId, session);
      if (shouldReconnect && session.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        // Ainda vamos reconectar nesta mesma réplica — mantemos a trava e o heartbeat
        // vivos (não é uma perda de posse, é o mesmo dono reabrindo o socket).
        session.reconnectAttempts += 1;
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * 2 ** (session.reconnectAttempts - 1),
          RECONNECT_MAX_DELAY_MS,
        );
        setTimeout(() => {
          initWhatsApp(organizationId).catch(() => undefined);
        }, delay);
      } else {
        // Desistimos de vez (logout definitivo ou esgotamos as tentativas de reconexão
        // automática): liberamos a trava explicitamente para permitir failover imediato de
        // outra réplica, em vez de depender só do TTL expirar.
        await releaseSessionLock(organizationId, session);
        if (!shouldReconnect) {
          const keys = await cacheConnection.keys(`wa-auth:${organizationId}:*`);
          if (keys.length > 0) await cacheConnection.del(...keys);
        }
      }
      whatsappEvents.emit('status', { organizationId, status: session.status });
    } else if (connection === 'open') {
      session.status = 'connected';
      session.currentQr = null;
      session.reconnectAttempts = 0;
      await persistStatusToRedis(organizationId, session);
      whatsappEvents.emit('status', { organizationId, status: session.status });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;
    await requestContext.run({ tenantId: organizationId }, async () => {
      for (const message of messages) {
        if (!message.key.id) continue;
        try {
          await persistWhatsAppMessage({
            organizationId,
            waMessageId: message.key.id,
            direction: message.key.fromMe ? 'outbound' : 'inbound',
            remoteJid: message.key.remoteJid,
            body: extractMessageText(message),
          });
        } catch (error) {
          logger.error({ err: error, organizationId }, 'Falha ao persistir mensagem de WhatsApp.');
        }
      }
    });
  });
}

export async function getWhatsAppStatus(organizationId: string) {
  try {
    const raw = await cacheConnection.get(`${WHATSAPP_STATUS_KEY_PREFIX}:${organizationId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { status: TenantSession['status']; qr: string | null };
      return { status: parsed.status, qr: parsed.qr };
    }
  } catch (err) {
    logger.warn(
      { err, organizationId },
      'WhatsApp: falha ao ler status do Redis, usando estado local',
    );
  }
  const session = getSession(organizationId);
  return { status: session.status, qr: session.currentQr };
}

export async function logoutWhatsApp(organizationId: string) {
  const session = sessions.get(organizationId);
  if (session?.sock) {
    await session.sock.logout();
    session.sock = null;
    session.status = 'disconnected';
    session.currentQr = null;
    session.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    // Logout definitivo: liberamos a trava distribuída explicitamente em vez de esperar o TTL
    // expirar, para que outra réplica possa assumir imediatamente se um novo `connect` chegar.
    await releaseSessionLock(organizationId, session);
    await persistStatusToRedis(organizationId, session);
  }
}

export async function shutdownWhatsAppSessions(): Promise<void> {
  await Promise.allSettled(
    [...sessions.entries()].map(async ([organizationId, session]) => {
      session.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
      session.status = 'disconnected';
      session.currentQr = null;
      // Shutdown gracioso (requisito 4): libera a trava explicitamente em vez de deixar o
      // TTL expirar, para que outra réplica assuma a sessão sem esperar o TTL inteiro.
      await releaseSessionLock(organizationId, session);
      const sock = session.sock;
      session.sock = null;
      if (sock) {
        try {
          sock.end(new Error('process shutdown'));
        } catch (err) {
          logger.warn({ err, organizationId }, 'WhatsApp: erro ao fechar socket no shutdown');
        }
      }
      await persistStatusToRedis(organizationId, session);
    }),
  );
}

export interface SendWhatsAppMessageContext {
  leadId?: string | null;
  email?: string | null;
  skipOptOutCheck?: boolean;
}

export async function sendWhatsAppMessage(
  organizationId: string,
  number: string,
  text: string,
  buttons?: string[],
  context?: SendWhatsAppMessageContext,
) {
  const session = sessions.get(organizationId);

  // RUN-007b (Sprint 02/Onda 14): o gate original comparava `NODE_ENV === 'production'`
  // (string exata) — em qualquer ambiente que não usasse esse valor exato (staging, homolog,
  // ou simplesmente uma env var diferente), uma réplica web sem socket local caía direto no
  // AppError abaixo em vez de usar o broker, mesmo sendo tecnicamente uma "réplica web sem
  // WASocket" (o cenário exato que o broker existe para resolver). O sinal correto é
  // `isDedicatedWorkerProcess`: só o worker dedicado é dono do WASocket de verdade — qualquer
  // outro processo (web, em qualquer ambiente) sem sessão local deve enfileirar via broker.
  if (!isDedicatedWorkerProcess && (!session?.sock || session.status !== 'connected')) {
    await enqueueWhatsAppCommand({
      type: 'send',
      organizationId,
      number,
      text,
      buttons,
      context,
    });
    return true;
  }

  if (!session?.sock || session.status !== 'connected') {
    throw new AppError('WhatsApp não está conectado.', 409);
  }

  if (!context?.skipOptOutCheck) {
    const blocked = await requestContext.run({ tenantId: organizationId }, () =>
      isOptedOut(
        prismaOptOutRepository,
        organizationId,
        {
          leadId: context?.leadId ?? null,
          email: context?.email ?? null,
          phoneE164: toE164BR(number),
        },
        'whatsapp',
      ),
    );
    if (blocked) {
      logger.info(
        { organizationId, leadId: context?.leadId ?? null },
        '[whatsapp] Envio bloqueado por opt-out do destinatário — mensagem NÃO enviada (skipped).',
      );
      throw new AppError('Destinatário optou por não receber mensagens (opt-out registrado).', 409);
    }
  }

  const sock = session.sock;
  let formattedNumber = number.replace(/\D/g, '');
  if (!formattedNumber.endsWith('@s.whatsapp.net')) {
    formattedNumber = `${formattedNumber}@s.whatsapp.net`;
  }

  let results: Awaited<ReturnType<WASocket['onWhatsApp']>>;
  try {
    results = await withTimeout(sock.onWhatsApp(formattedNumber), BAILEYS_CALL_TIMEOUT_MS);
  } catch (err) {
    logger.warn(
      { err, organizationId },
      '[whatsapp] Falha/timeout ao verificar número no WhatsApp',
    );
    throw new AppError(
      'Não foi possível verificar esse número no WhatsApp agora (timeout ou falha de conexão).',
      502,
    );
  }
  const result = results?.[0];
  if (!result?.exists) {
    throw new AppError('O número fornecido não está registrado no WhatsApp.', 422);
  }

  try {
    let finalMessage = text;
    if (buttons && buttons.length > 0) {
      finalMessage += '\n\n' + buttons.map((b, i) => `[${i + 1}] ${b}`).join('\n');
    }
    await withTimeout(
      sock.sendMessage(result.jid, { text: finalMessage }),
      BAILEYS_CALL_TIMEOUT_MS,
    );
  } catch (err) {
    logger.warn({ err, organizationId }, '[whatsapp] Falha/timeout ao enviar mensagem');
    throw new AppError(
      'Não foi possível enviar a mensagem agora (timeout ou falha de conexão).',
      502,
    );
  }
  return true;
}
