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
    // O broker novo importa estes bindings no mesmo grafo do whatsapp.service. Neste teste unitário
    // não existe fila real nem processo worker dedicado: validamos somente a sessão Baileys local.
    queuesEnabled: false,
    isDedicatedWorkerProcess: false,
    // Onda 41 (lock distribuído entre réplicas): redisConfigured: false faz
    // acquireDistributedLock cair no ramo "instância única" (trava sempre concedida, sem chamar
    // cacheConnection.set/get/eval) — mesma suposição de "sem Redis real neste teste unitário" já
    // documentada acima para queuesEnabled/isDedicatedWorkerProcess.
    redisConfigured: false,
    connection: {},
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

// isOptedOut é a checagem de opt-out unificado (ver
// .agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md) chamada por sendWhatsAppMessage
// antes de qualquer envio automatizado. Mockado aqui porque este é um teste unitário puro (sem
// Postgres real) — a prova contra banco real está em
// tests/integration/whatsapp-optout-gating.test.ts. Default `false` (não bloqueado) para não
// quebrar os testes de envio já existentes abaixo, que não são sobre opt-out.
const isOptedOutMock = vi.fn().mockResolvedValue(false);
vi.mock('../../../../../src/features/cadence/application/optOutService.js', () => ({
    isOptedOut: (...args: unknown[]) => isOptedOutMock(...args),
}));
vi.mock('../../../../../src/features/cadence/infra/PrismaOptOutRepository.js', () => ({
    prismaOptOutRepository: {},
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

// RUN-007b (Sprint 02/Onda 14): o fallback pro broker agora depende só de `isDedicatedWorkerProcess`
// (mockado `false` acima — este teste roda como se fosse o processo web), não mais de
// `NODE_ENV === 'production'`. Sem sessão local, sendWhatsAppMessage deve enfileirar via broker em
// vez de lançar erro — ver teste "sem sessão local: enfileira via broker" abaixo.
const enqueueWhatsAppCommandMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../src/lib/queue/whatsappCommand.queue.js', () => ({
    enqueueWhatsAppCommand: (...args: unknown[]) => enqueueWhatsAppCommandMock(...args),
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

vi.mock('@whiskeysockets/baileys', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        default: vi.fn(() => mockSocket),
        useMultiFileAuthState: vi.fn(async () => ({ state: {}, saveCreds: vi.fn() })),
        fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 1015901307], isLatest: true }),
        DisconnectReason: { loggedOut: 401 },
        Browsers: { macOS: () => ['Atlas', 'Desktop', '1.0'] },
        initAuthCreds: vi.fn(() => ({})),
        // BufferJSON.replacer/reviver reais (via ...actual acima) — não sobrepostos por um stub:
        // um vi.fn() sem implementação devolve undefined pra toda chave, e JSON.stringify(data,
        // replacer) com um replacer assim serializa a raiz inteira como undefined. Antes da cifra
        // de credenciais em repouso (useRedisAuthState.ts) isso passava despercebido porque nada
        // validava a string serializada; agora encryptField exige uma string real (crypto nativo
        // do Node), e o gap deste mock vira um erro real de teste.
    };
});

const { initWhatsApp, getWhatsAppStatus, logoutWhatsApp, sendWhatsAppMessage } = await import(
    '../../../../../src/features/integrations/whatsapp/whatsapp.service'
);

afterEach(() => {
    vi.clearAllMocks();
    isOptedOutMock.mockResolvedValue(false);
    redisStore.clear();
    socketHandlers.clear();
});

describe('WhatsApp service — sessão por tenant', () => {
    it('status default de um tenant nunca conectado é disconnected, sem QR', async () => {
        const status = await getWhatsAppStatus('org-nunca-conectou');
        expect(status).toEqual({ status: 'disconnected', qr: null });
    });

    it('sendWhatsAppMessage sem sessão local: enfileira via broker (RUN-007b) em vez de falhar direto', async () => {
        const result = await sendWhatsAppMessage('org-sem-sessao', '5511999999999', 'oi');

        expect(result).toBe(true);
        expect(enqueueWhatsAppCommandMock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'send',
                organizationId: 'org-sem-sessao',
                number: '5511999999999',
                text: 'oi',
            }),
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

describe('WhatsApp service — bloqueio por opt-out (contrato onda-7)', () => {
    it('bloqueia o disparo automatizado quando isOptedOut devolve true, sem chamar sock.sendMessage', async () => {
        const orgId = 'org-optout-bloqueado';
        await initWhatsApp(orgId);
        (await socketHandlers.get('connection.update')!)({ connection: 'open' });
        isOptedOutMock.mockResolvedValueOnce(true);

        await expect(sendWhatsAppMessage(orgId, '11999998888', 'Follow-up automático')).rejects.toThrow(
            /opt-out/i,
        );
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('consulta isOptedOut com leadId/email do contexto e o telefone de destino normalizado, no canal whatsapp', async () => {
        const orgId = 'org-optout-consulta';
        await initWhatsApp(orgId);
        (await socketHandlers.get('connection.update')!)({ connection: 'open' });

        await sendWhatsAppMessage(orgId, '(11) 99999-9999', 'Oi', undefined, {
            leadId: 'lead-123',
            email: 'lead@example.com',
        });

        expect(isOptedOutMock).toHaveBeenCalledWith(
            {},
            orgId,
            { leadId: 'lead-123', email: 'lead@example.com', phoneE164: '+5511999999999' },
            'whatsapp',
        );
    });

    it('skipOptOutCheck: true no context nunca chama isOptedOut e envia normalmente (contrato da função — nenhum caller de produção usa isto hoje, ver CYC-001/onda-18)', async () => {
        const orgId = 'org-optout-manual';
        await initWhatsApp(orgId);
        (await socketHandlers.get('connection.update')!)({ connection: 'open' });

        const result = await sendWhatsAppMessage(orgId, '11999999999', 'Resposta do vendedor', undefined, {
            skipOptOutCheck: true,
        });

        expect(result).toBe(true);
        expect(isOptedOutMock).not.toHaveBeenCalled();
        expect(mockSocket.sendMessage).toHaveBeenCalled();
    });
});
