import makeWASocket, { DisconnectReason, Browsers, WASocket, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
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

const BAILEYS_CALL_TIMEOUT_MS = 15_000;

export const whatsappEvents = new EventEmitter();

type WASocketLogger = Parameters<typeof makeWASocket>[0]['logger'];

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 60000;

interface TenantSession {
    sock: WASocket | null;
    currentQr: string | null;
    status: 'disconnected' | 'connecting' | 'connected';
    reconnectAttempts: number;
}

const sessions = new Map<string, TenantSession>();

function getSession(organizationId: string): TenantSession {
    let session = sessions.get(organizationId);
    if (!session) {
        session = { sock: null, currentQr: null, status: 'disconnected', reconnectAttempts: 0 };
        sessions.set(organizationId, session);
    }
    return session;
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

    session.status = 'connecting';
    await persistStatusToRedis(organizationId, session);
    const authFolder = authFolderFor(organizationId);

    let sock: WASocket;
    let saveCreds: () => Promise<void>;
    try {
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
        }

        const authState = await useRedisAuthState(cacheConnection, organizationId);
        saveCreds = authState.saveCreds;
        const { version } = await withTimeout(fetchLatestBaileysVersion(), 15_000);

        sock = makeWASocket({
            auth: authState.state,
            version,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            logger: pino({ level: 'silent' }) as unknown as WASocketLogger
        });
    } catch (err) {
        session.status = 'disconnected';
        await persistStatusToRedis(organizationId, session);
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
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            session.status = 'disconnected';
            session.currentQr = null;
            await persistStatusToRedis(organizationId, session);
            if (shouldReconnect && session.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                session.reconnectAttempts += 1;
                const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (session.reconnectAttempts - 1), RECONNECT_MAX_DELAY_MS);
                setTimeout(() => {
                    initWhatsApp(organizationId).catch(() => undefined);
                }, delay);
            } else if (!shouldReconnect) {
                const keys = await cacheConnection.keys(`wa-auth:${organizationId}:*`);
                if (keys.length > 0) await cacheConnection.del(...keys);
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
        logger.warn({ err, organizationId }, 'WhatsApp: falha ao ler status do Redis, usando estado local');
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
        await persistStatusToRedis(organizationId, session);
    }
}

export async function shutdownWhatsAppSessions(): Promise<void> {
    await Promise.allSettled(
        [...sessions.entries()].map(async ([organizationId, session]) => {
            session.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
            session.status = 'disconnected';
            session.currentQr = null;
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

    // Só produção web recebe o fallback para broker. Dev/test preservam a semântica histórica,
    // e o worker dedicado nunca re-enfileira o próprio job.
    if (
        process.env.NODE_ENV === 'production'
        && !isDedicatedWorkerProcess
        && (!session?.sock || session.status !== 'connected')
    ) {
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
        logger.warn({ err, organizationId }, '[whatsapp] Falha/timeout ao verificar número no WhatsApp');
        throw new AppError('Não foi possível verificar esse número no WhatsApp agora (timeout ou falha de conexão).', 502);
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
        await withTimeout(sock.sendMessage(result.jid, { text: finalMessage }), BAILEYS_CALL_TIMEOUT_MS);
    } catch (err) {
        logger.warn({ err, organizationId }, '[whatsapp] Falha/timeout ao enviar mensagem');
        throw new AppError('Não foi possível enviar a mensagem agora (timeout ou falha de conexão).', 502);
    }
    return true;
}
