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
import { cacheConnection } from '../../../lib/queue/redis.js';
import { withTimeout } from '../../../lib/http.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { toE164BR } from '../../../lib/phone.js';
import { isOptedOut } from '../../cadence/application/optOutService.js';
import { prismaOptOutRepository } from '../../cadence/infra/PrismaOptOutRepository.js';
import { useRedisAuthState } from './useRedisAuthState.js';

/** Mesmo teto usado em fetchLatestBaileysVersion — chamadas ao socket Baileys também podem
 * travar indefinidamente (mesma classe de bug já corrigida ali; ver comentário lá). */
const BAILEYS_CALL_TIMEOUT_MS = 15_000;

export const whatsappEvents = new EventEmitter();

/**
 * baileys define sua própria interface ILogger (não exportada do pacote) em vez de aceitar
 * pino.Logger diretamente — estruturalmente parecidas, mas não idênticas o bastante pra o
 * TypeScript aceitar sem cast. Deriva o tipo exato esperado a partir da própria assinatura de
 * makeWASocket, em vez de reimportar um caminho interno do pacote (frágil entre versões).
 */
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
        // Se ainda existir pasta de auth antiga local, apagamos pois agora usamos Redis
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
        }

        const authState = await useRedisAuthState(cacheConnection, organizationId);
        saveCreds = authState.saveCreds;

        // Sem isso, o socket usa a versão do WhatsApp Web fixada no pacote @whiskeysockets/baileys
        // instalado. Quando o WhatsApp atualiza os servidores e essa versão fica desatualizada, o
        // handshake é rejeitado com "405 Connection Failure" ANTES de qualquer QR ser emitido — a
        // sessão fica presa em "connecting" pra sempre (o front-end nunca recebe QR nem erro; ver
        // BUG relatado na tela de Integrações). Buscar a versão mais recente evita isso.
        // Com timeout: fetchLatestBaileysVersion() não aceita AbortSignal, e sem isto, se a chamada
        // de rede travar (em vez de falhar), initWhatsApp nunca chega ao catch abaixo — reintroduzindo
        // exatamente o mesmo bug de sessão presa em "connecting" pra sempre, um passo antes.
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
                // Se foi deslogado, limpa as chaves no Redis (prefixo wa-auth:orgId)
                const keys = await cacheConnection.keys(`wa-auth:${organizationId}:*`);
                if (keys.length > 0) {
                    await cacheConnection.del(...keys);
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
 * Contexto opcional de opt-out de `sendWhatsAppMessage`. Todo disparo automatizado (cadência,
 * prospecção fria, follow-up agendado, fallback de voz) deve deixar `skipOptOutCheck` de fora —
 * o default é sempre checar. Só a mensagem manual digitada por um vendedor no painel de conversa
 * (`whatsapp.routes.ts`, `POST /send`) passa `skipOptOutCheck: true`: não é o disparo automatizado
 * que `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md` cobre.
 *
 * `leadId`/`email` são opcionais porque nem todo chamador tem os dois carregados (ex.: o worker de
 * follow-up só resolve o telefone) — quando ausentes, o casamento cai só no telefone de destino
 * (`number`, sempre disponível: é o próprio parâmetro de envio), que já é suficiente para pegar um
 * opt-out `global`/`whatsapp` registrado por qualquer canal para esse número.
 */
export interface SendWhatsAppMessageContext {
    leadId?: string | null;
    email?: string | null;
    skipOptOutCheck?: boolean;
}

/**
 * Envia uma mensagem de texto simples (ou com botões iterativos formatados em texto) pela sessão de um tenant
 */
export async function sendWhatsAppMessage(
    organizationId: string,
    number: string,
    text: string,
    buttons?: string[],
    context?: SendWhatsAppMessageContext,
) {
    const session = sessions.get(organizationId);
    if (!session?.sock || session.status !== 'connected') {
        // AppError (não Error genérico): sem isso, o errorHandler global substitui a mensagem por
        // "Erro Interno do Servidor" em produção (qualquer erro que não seja AppError vira 500
        // genérico — ver errorHandler.ts) e o operador não consegue distinguir "não conectado" de
        // qualquer outra falha.
        throw new AppError('WhatsApp não está conectado.', 409);
    }

    if (!context?.skipOptOutCheck) {
        // requestContext.run próprio (não confia no contexto do chamador): sendWhatsAppMessage é
        // invocado tanto de dentro de uma requisição HTTP autenticada (que já tem tenant no
        // AsyncLocalStorage) quanto de workers/webhooks (BullMQ, Birth Voices Hub) que podem não
        // ter — ver .agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md e o bug de RLS da
        // Onda 9 (src/lib/async-context.ts) sobre por que isto precisa ser explícito aqui, não
        // assumido do chamador.
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
            // Nunca reportar como enviado — mesma disciplina de honestidade já aplicada em
            // cold-email.service.ts (commit 2e42a557) para o canal de e-mail. AppError (não um
            // `return false` silencioso) para que todo chamador automatizado que já envolve esta
            // chamada em try/catch (prospecting/services/whatsapp.service.ts,
            // crm/jobs/followUp.worker.ts, birth-voice/*.webhook.ts) trate isto como "não enviado"
            // e nunca atualize lastInteraction/sentCount como se tivesse enviado de verdade.
            logger.info(
                { organizationId, leadId: context?.leadId ?? null },
                '[whatsapp] Envio bloqueado por opt-out do destinatário — mensagem NÃO enviada (skipped).',
            );
            throw new AppError('Destinatário optou por não receber mensagens (opt-out registrado).', 409);
        }
    }

    const sock = session.sock;

    // Formata o número (adiciona o @s.whatsapp.net e garante que só tenha números)
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
