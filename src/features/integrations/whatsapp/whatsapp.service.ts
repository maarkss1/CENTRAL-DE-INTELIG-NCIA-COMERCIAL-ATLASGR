import makeWASocket, { useMultiFileAuthState as getMultiFileAuthState, DisconnectReason, Browsers, WASocket, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { requestContext } from '../../../lib/async-context.js';
import { logger } from '../../../lib/logger.js';
import { extractMessageText, persistWhatsAppMessage } from './whatsappMessage.service.js';
import { cacheConnection } from '../../../lib/queue/redis.js';

export const whatsappEvents = new EventEmitter();

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 60000;

interface TenantSession {
    sock: WASocket | null;
    currentQr: string | null;
    status: 'disconnected' | 'connecting' | 'connected';
    reconnectAttempts: number;
}

// Cada organização (tenant) tem sua própria sessão do WhatsApp — socket, QR code,
// status e diretório de credenciais isolados. Antes, esse estado era compartilhado
// globalmente entre todos os tenants do deployment (risco de acesso cruzado: um
// usuário de um tenant podia ver/desconectar/enviar mensagens pela sessão de outro).
const sessions = new Map<string, TenantSession>();

function getSession(organizationId: string): TenantSession {
    let session = sessions.get(organizationId);
    if (!session) {
        session = { sock: null, currentQr: null, status: 'disconnected', reconnectAttempts: 0 };
        sessions.set(organizationId, session);
    }
    return session;
}

// ARCH-005: o socket do Baileys (`sock`) é uma conexão com estado próprio (handshake, criptografia
// de sessão, handlers) e não pode ser movido pra Redis — ele só existe de verdade na instância que
// abriu a conexão. O que ERA um problema real de multi-instância é status/QR: hoje, se
// `initWhatsApp` roda na Instância A mas a requisição de `getWhatsAppStatus` cai na Instância B
// (load balancer round-robin), o Map() local da Instância B nunca teve essa organização e sempre
// respondia "disconnected", mesmo com a sessão ativa em A. Espelhar status/QR no Redis a cada
// mudança resolve isso: qualquer instância consegue responder o estado real.
const WHATSAPP_STATUS_KEY_PREFIX = 'whatsapp:session-status';

async function persistStatusToRedis(organizationId: string, session: TenantSession): Promise<void> {
    try {
        await cacheConnection.set(
            `${WHATSAPP_STATUS_KEY_PREFIX}:${organizationId}`,
            JSON.stringify({ status: session.status, qr: session.currentQr }),
            'EX',
            60 * 60 * 24, // TTL de 1 dia: se a instância dona cair sem atualizar o Redis, o status não fica "conectado" pra sempre.
        );
    } catch (err) {
        logger.warn({ err, organizationId }, 'WhatsApp: falha ao espelhar status no Redis (seguindo só com estado local desta instância)');
    }
}

function authFolderFor(organizationId: string): string {
    // Sanitiza o id antes de usá-lo como segmento de caminho.
    const safeId = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(process.cwd(), 'whatsapp_auth', safeId);
}

/**
 * Inicializa a conexão com o WhatsApp via Baileys para um tenant específico
 */
export async function initWhatsApp(organizationId: string) {
    const session = getSession(organizationId);
    if (session.status === 'connected') return;

    session.status = 'connecting';
    await persistStatusToRedis(organizationId, session);
    const authFolder = authFolderFor(organizationId);

    let sock: WASocket;
    let saveCreds: () => Promise<void>;
    try {
        if (!fs.existsSync(authFolder)) {
            fs.mkdirSync(authFolder, { recursive: true });
        }

        const authState = await getMultiFileAuthState(authFolder);
        saveCreds = authState.saveCreds;

        // Sem isso, o socket usa a versão do WhatsApp Web fixada no pacote @whiskeysockets/baileys
        // instalado. Quando o WhatsApp atualiza os servidores e essa versão fica desatualizada, o
        // handshake é rejeitado com "405 Connection Failure" ANTES de qualquer QR ser emitido — a
        // sessão fica presa em "connecting" pra sempre (o front-end nunca recebe QR nem erro; ver
        // BUG relatado na tela de Integrações). Buscar a versão mais recente evita isso.
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            auth: authState.state,
            version,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            logger: pino({ level: 'silent' }) as any
        });
    } catch (err) {
        // Se algo falhar antes do socket existir, não pode deixar a sessão presa em "connecting"
        // pra sempre — sem isso, o front-end (que só reage a 'connecting'/'connected'/'disconnected')
        // ficaria mostrando "Conectando..." indefinidamente mesmo com a inicialização já morta.
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
                    initWhatsApp(organizationId).catch(() => {
                        // Erros de reconexão já refletem no status/eventos emitidos acima.
                    });
                }, delay);
            } else if (!shouldReconnect) {
                // Se foi deslogado, limpa a pasta de auth deste tenant.
                fs.rmSync(authFolder, { recursive: true, force: true });
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

    // Persiste mensagens recebidas (e as enviadas por este socket) vinculando ao contato/lead do
    // CRM quando o número bate com um já cadastrado — ver whatsappMessage.service.ts.
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' && type !== 'append') return;
        // O worker roda fora de uma requisição HTTP, então nada preencheria o tenant que a RLS exige.
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

/**
 * Retorna o status atual da conexão e o QR Code (se houver) de um tenant. Lê do Redis primeiro —
 * funciona mesmo quando quem inicializou a sessão (initWhatsApp, dono do socket real) foi outra
 * instância; cai pro Map() local só se o Redis estiver indisponível ou nunca ter sido escrito.
 */
export async function getWhatsAppStatus(organizationId: string) {
    try {
        const raw = await cacheConnection.get(`${WHATSAPP_STATUS_KEY_PREFIX}:${organizationId}`);
        if (raw) {
            const parsed = JSON.parse(raw) as { status: TenantSession['status']; qr: string | null };
            return { status: parsed.status, qr: parsed.qr };
        }
    } catch (err) {
        logger.warn({ err, organizationId }, 'WhatsApp: falha ao ler status do Redis, usando estado local desta instância');
    }
    const session = getSession(organizationId);
    return {
        status: session.status,
        qr: session.currentQr
    };
}

/**
 * Desconecta o WhatsApp e apaga a sessão de um tenant
 */
export async function logoutWhatsApp(organizationId: string) {
    const session = sessions.get(organizationId);
    if (session?.sock) {
        session.sock.logout();
        session.sock = null;
        session.status = 'disconnected';
        session.currentQr = null;
        session.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // evita reconexão automática após logout explícito
        await persistStatusToRedis(organizationId, session);
    }
}

/**
 * Envia uma mensagem de texto simples pela sessão de um tenant
 */
export async function sendWhatsAppMessage(organizationId: string, number: string, text: string) {
    const session = sessions.get(organizationId);
    if (!session?.sock || session.status !== 'connected') {
        throw new Error('WhatsApp não está conectado.');
    }

    // Formata o número (adiciona o @s.whatsapp.net e garante que só tenha números)
    let formattedNumber = number.replace(/\D/g, '');
    if (!formattedNumber.endsWith('@s.whatsapp.net')) {
        formattedNumber = `${formattedNumber}@s.whatsapp.net`;
    }

    const results = await session.sock.onWhatsApp(formattedNumber);
    const result = results?.[0];
    if (!result?.exists) {
        throw new Error('O número fornecido não está registrado no WhatsApp.');
    }

    await session.sock.sendMessage(result.jid, { text });
    return true;
}
