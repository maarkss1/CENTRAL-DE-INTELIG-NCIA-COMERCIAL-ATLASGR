import makeWASocket, { useMultiFileAuthState as getMultiFileAuthState, DisconnectReason, Browsers, WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

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
    const authFolder = authFolderFor(organizationId);
    if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
    }

    const { state, saveCreds } = await getMultiFileAuthState(authFolder);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: pino({ level: 'silent' }) as any
    });
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            session.currentQr = await qrcode.toDataURL(qr);
            whatsappEvents.emit('qr', { organizationId, qr: session.currentQr });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            session.status = 'disconnected';
            session.currentQr = null;
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
            whatsappEvents.emit('status', { organizationId, status: session.status });
        }
    });

    // Escuta novas mensagens (Opcional, para salvar no CRM no futuro)
    sock.ev.on('messages.upsert', async (_m) => {
        // console.log(JSON.stringify(m, undefined, 2))
    });
}

/**
 * Retorna o status atual da conexão e o QR Code (se houver) de um tenant
 */
export function getWhatsAppStatus(organizationId: string) {
    const session = getSession(organizationId);
    return {
        status: session.status,
        qr: session.currentQr
    };
}

/**
 * Desconecta o WhatsApp e apaga a sessão de um tenant
 */
export function logoutWhatsApp(organizationId: string) {
    const session = sessions.get(organizationId);
    if (session?.sock) {
        session.sock.logout();
        session.sock = null;
        session.status = 'disconnected';
        session.currentQr = null;
        session.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // evita reconexão automática após logout explícito
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
