import makeWASocket, { useMultiFileAuthState as getMultiFileAuthState, DisconnectReason, Browsers, WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

export const whatsappEvents = new EventEmitter();

// Mantém o socket global para podermos enviar mensagens a qualquer momento
let sock: WASocket | null = null;
let currentQr: string | null = null;
let status: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

/**
 * Inicializa a conexão com o WhatsApp via Baileys
 */
export async function initWhatsApp() {
    if (status === 'connected') return;

    status = 'connecting';
    const authFolder = path.join(process.cwd(), 'whatsapp_auth');
    if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
    }

    const { state, saveCreds } = await getMultiFileAuthState(authFolder);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: pino({ level: 'silent' }) as any
    });

    sock?.ev.on('creds.update', saveCreds);

    sock?.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // Gera a imagem do QR Code em Base64 para enviar ao Frontend
            currentQr = await qrcode.toDataURL(qr);
            whatsappEvents.emit('qr', currentQr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            // Conexão fechada
            status = 'disconnected';
            currentQr = null;
            if (shouldReconnect) {
                initWhatsApp();
            } else {
                // Se foi deslogado, limpa a pasta de auth
                fs.rmSync(authFolder, { recursive: true, force: true });
            }
            whatsappEvents.emit('status', status);
        } else if (connection === 'open') {
            // Conexão bem sucedida
            status = 'connected';
            currentQr = null;
            whatsappEvents.emit('status', status);
        }
    });

    // Escuta novas mensagens (Opcional, para salvar no CRM no futuro)
    sock?.ev.on('messages.upsert', async (_m) => {
        // console.log(JSON.stringify(m, undefined, 2))
    });
}

/**
 * Retorna o status atual da conexão e o QR Code (se houver)
 */
export function getWhatsAppStatus() {
    return {
        status,
        qr: currentQr
    };
}

/**
 * Desconecta o WhatsApp e apaga a sessão
 */
export function logoutWhatsApp() {
    if (sock) {
        sock.logout();
        sock = null;
        status = 'disconnected';
        currentQr = null;
    }
}

/**
 * Envia uma mensagem de texto simples
 */
export async function sendWhatsAppMessage(number: string, text: string) {
    if (!sock || status !== 'connected') {
        throw new Error('WhatsApp não está conectado.');
    }

    // Formata o número (adiciona o @s.whatsapp.net e garante que só tenha números)
    let formattedNumber = number.replace(/\D/g, '');
    if (!formattedNumber.endsWith('@s.whatsapp.net')) {
        formattedNumber = `${formattedNumber}@s.whatsapp.net`;
    }

    const results = await sock.onWhatsApp(formattedNumber);
    const result = results?.[0];
    if (!result?.exists) {
        throw new Error('O número fornecido não está registrado no WhatsApp.');
    }

    await sock.sendMessage(result.jid, { text });
    return true;
}
