import { afterEach, describe, expect, it, vi } from 'vitest';

// TEST-005: contrato de whatsapp.service.ts (conexão/status/QR/envio por tenant). Sem teste
// nenhum até agora. O socket do Baileys, o filesystem de credenciais e o Redis (usado pelo
// espelhamento de status do ARCH-005) são todos mockados — este teste cobre a lógica de sessão em
// si, não a integração real com o WhatsApp.

const redisStore = new Map<string, string>();
const redisGet = vi.fn(async (key: string) => redisStore.get(key) ?? null);
const redisSet = vi.fn(async (key: string, value: string) => {
    redisStore.set(key, value);
    return 'OK';
});
vi.mock('../../../../../src/lib/queue/redis.js', () => ({
    cacheConnection: {
        get: (...args: [string]) => redisGet(...args),
        set: (...args: unknown[]) => redisSet(args[0] as string, args[1] as string),
    },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../../../src/lib/async-context.js', () => ({
    requestContext: { run: (_ctx: unknown, fn: () => unknown) => fn() },
}));

vi.mock('../../../../../src/features/integrations/whatsapp/whatsappMessage.service.js', () => ({
    extractMessageText: vi.fn(() => ''),
    persistWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
        rmSync: vi.fn(),
    },
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
}));

vi.mock('qrcode', () => ({
    default: { toDataURL: vi.fn(async (qr: string) => `data:image/png;base64,${qr}`) },
}));

type EventHandler = (...args: unknown[]) => unknown;
const socketHandlers = new Map<string, EventHandler>();
const mockSocket = {
    ev: {
        on: vi.fn((event: string, handler: EventHandler) => {
            socketHandlers.set(event, handler);
        }),
    },
    logout: vi.fn(),
    onWhatsApp: vi.fn(async () => [{ exists: true, jid: 'fake-jid@s.whatsapp.net' }]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@whiskeysockets/baileys', () => ({
    default: vi.fn(() => mockSocket),
    useMultiFileAuthState: vi.fn(async () => ({ state: {}, saveCreds: vi.fn() })),
    fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 1015901307], isLatest: true }),
    DisconnectReason: { loggedOut: 401 },
    Browsers: { macOS: () => ['Atlas', 'Desktop', '1.0'] },
}));

const { initWhatsApp, getWhatsAppStatus, logoutWhatsApp, sendWhatsAppMessage } = await import(
    '../../../../../src/features/integrations/whatsapp/whatsapp.service'
);

afterEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    socketHandlers.clear();
});

describe('WhatsApp service — sessão por tenant', () => {
    it('status default de um tenant nunca conectado é disconnected, sem QR', async () => {
        const status = await getWhatsAppStatus('org-nunca-conectou');
        expect(status).toEqual({ status: 'disconnected', qr: null });
    });

    it('sendWhatsAppMessage falha se o tenant não tem sessão conectada', async () => {
        await expect(sendWhatsAppMessage('org-sem-sessao', '5511999999999', 'oi')).rejects.toThrow(
            'WhatsApp não está conectado.',
        );
    });

    it('connection: open marca status conectado e espelha no Redis', async () => {
        const orgId = 'org-conecta';
        await initWhatsApp(orgId);
        const connectionUpdate = socketHandlers.get('connection.update')!;
        await connectionUpdate({ connection: 'open' });

        const status = await getWhatsAppStatus(orgId);
        expect(status.status).toBe('connected');
        expect(status.qr).toBeNull();
        expect(redisSet).toHaveBeenCalledWith(
            `whatsapp:session-status:${orgId}`,
            JSON.stringify({ status: 'connected', qr: null }),
        );
    });

    it('QR recebido gera data URL e fica disponível via getWhatsAppStatus (mesmo lido do Redis)', async () => {
        const orgId = 'org-qr';
        await initWhatsApp(orgId);
        const connectionUpdate = socketHandlers.get('connection.update')!;
        await connectionUpdate({ qr: 'raw-qr-payload' });

        const status = await getWhatsAppStatus(orgId);
        expect(status.qr).toBe('data:image/png;base64,raw-qr-payload');
    });

    it('duas organizações têm sessões e status totalmente independentes', async () => {
        const orgA = 'org-a-isolada';
        const orgB = 'org-b-isolada';
        await initWhatsApp(orgA);
        (await socketHandlers.get('connection.update')!)({ connection: 'open' });

        // orgB nunca conectou — não deve herdar nada do estado de orgA.
        const statusB = await getWhatsAppStatus(orgB);
        expect(statusB).toEqual({ status: 'disconnected', qr: null });

        const statusA = await getWhatsAppStatus(orgA);
        expect(statusA.status).toBe('connected');
    });

    it('getWhatsAppStatus cai pro estado local quando o Redis falha', async () => {
        const orgId = 'org-redis-fora';
        await initWhatsApp(orgId);
        (await socketHandlers.get('connection.update')!)({ connection: 'open' });

        redisGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const status = await getWhatsAppStatus(orgId);
        // Mesmo sem conseguir ler do Redis, a instância dona do socket sabe seu próprio estado local.
        expect(status.status).toBe('connected');
    });

    it('logoutWhatsApp desconecta, chama sock.logout() e espelha disconnected no Redis', async () => {
        const orgId = 'org-logout';
        await initWhatsApp(orgId);
        (await socketHandlers.get('connection.update')!)({ connection: 'open' });

        await logoutWhatsApp(orgId);

        expect(mockSocket.logout).toHaveBeenCalledTimes(1);
        const status = await getWhatsAppStatus(orgId);
        expect(status).toEqual({ status: 'disconnected', qr: null });
    });

    it('sendWhatsAppMessage envia pro número formatado quando conectado', async () => {
        const orgId = 'org-envia';
        await initWhatsApp(orgId);
        (await socketHandlers.get('connection.update')!)({ connection: 'open' });

        const result = await sendWhatsAppMessage(orgId, '(11) 99999-9999', 'Olá!');

        expect(result).toBe(true);
        expect(mockSocket.onWhatsApp).toHaveBeenCalledWith('11999999999@s.whatsapp.net');
        expect(mockSocket.sendMessage).toHaveBeenCalledWith('fake-jid@s.whatsapp.net', { text: 'Olá!' });
    });

    it('sendWhatsAppMessage rejeita número não registrado no WhatsApp', async () => {
        const orgId = 'org-numero-invalido';
        await initWhatsApp(orgId);
        (await socketHandlers.get('connection.update')!)({ connection: 'open' });
        mockSocket.onWhatsApp.mockResolvedValueOnce([{ exists: false }]);

        await expect(sendWhatsAppMessage(orgId, '11000000000', 'oi')).rejects.toThrow(
            'O número fornecido não está registrado no WhatsApp.',
        );
    });
});
