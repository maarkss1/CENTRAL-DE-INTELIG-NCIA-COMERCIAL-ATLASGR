import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Prova, contra Postgres real, o contrato bloqueador de
 * `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md`: `sendWhatsAppMessage`
 * (`src/features/integrations/whatsapp/whatsapp.service.ts`) consulta o opt-out unificado
 * (`OptOutRecord`, via `isOptedOut`/`PrismaOptOutRepository`) antes de qualquer disparo
 * automatizado, e `persistWhatsAppMessage`
 * (`src/features/integrations/whatsapp/whatsappMessage.service.ts`) registra um opt-out real
 * quando um lead pede para parar de receber mensagens.
 *
 * O socket do Baileys é mockado (mesmo padrão de
 * tests/unit/features/integrations/whatsapp/whatsapp.service.test.ts) — não faz sentido abrir uma
 * conexão real de WhatsApp aqui. Prisma/RLS/opt-out NÃO são mockados: é isso que este arquivo
 * prova que funciona de verdade.
 */

const redisStore = new Map<string, string>();
vi.mock('../../src/lib/queue/redis.js', () => ({
    cacheConnection: {
        get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
        set: vi.fn(async (key: string, value: string) => {
            redisStore.set(key, value);
            return 'OK';
        }),
    },
    // whatsappSignal.worker.ts (agendamento de análise de conversa via BullMQ, disparado por
    // persistWhatsAppMessage) lê estes dois no import — sem eles o teste nem carrega. queuesEnabled
    // false é o mesmo estado real do ambiente de teste (ENABLE_QUEUES não setado em .env.test), então
    // scheduleConversationAnalysis vira no-op, igual ao comportamento de produção sem fila habilitada.
    queuesEnabled: false,
    connection: {},
    // RUN-007b (Sprint 02/Onda 14): sendWhatsAppMessage agora lê isDedicatedWorkerProcess para
    // decidir entre broker e falha direta quando não há sessão local conectada. Este arquivo só
    // exercita o caminho "sessão conectada" (socket mockado sempre presente), então o valor não
    // muda o comportamento testado aqui — só precisa existir para o módulo carregar.
    isDedicatedWorkerProcess: false,
}));

vi.mock('fs', () => ({
    default: { existsSync: vi.fn(() => true), mkdirSync: vi.fn(), rmSync: vi.fn() },
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
    // useRedisAuthState.ts (adaptador de sessão Baileys via Redis) chama initAuthCreds() direto do
    // pacote quando ainda não há credenciais salvas — sem este mock, initWhatsApp() quebra com
    // "No 'initAuthCreds' export is defined" antes de qualquer asserção de opt-out rodar. O valor
    // de retorno não precisa ser criptograficamente válido: o socket inteiro já é mockado acima
    // (`default: vi.fn(() => mockSocket)`), então nenhum handshake real do Baileys usa este objeto.
    initAuthCreds: vi.fn(() => ({})),
    BufferJSON: { replacer: undefined, reviver: undefined },
    fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 1015901307], isLatest: true }),
    DisconnectReason: { loggedOut: 401 },
    Browsers: { macOS: () => ['Atlas', 'Desktop', '1.0'] },
}));

import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { recordOptOut } from '../../src/features/cadence/application/optOutService';
import { prismaOptOutRepository } from '../../src/features/cadence/infra/PrismaOptOutRepository';
import { initWhatsApp, sendWhatsAppMessage } from '../../src/features/integrations/whatsapp/whatsapp.service';
import { persistWhatsAppMessage } from '../../src/features/integrations/whatsapp/whatsappMessage.service';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG = `test-optout-wa-org-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> =>
    requestContext.run({ tenantId: organizationId }, fn);

// `initWhatsApp` é um no-op se a sessão do tenant já está 'connected' (`sessions` é um Map
// module-level, sobrevive entre testes deste arquivo) — sem isso, reusar o mesmo organizationId
// entre testes faria o 2º+ `initWhatsApp` nunca registrar handlers novos no mock do socket. Cada
// teste de sessão usa sua própria organização (criada aqui, sob demanda) para começar sempre
// 'disconnected'.
let sessionOrgCounter = 0;
const sessionOrgIds: string[] = [];
async function createSessionOrg(): Promise<string> {
    const id = `${ORG}-session-${sessionOrgCounter++}`;
    sessionOrgIds.push(id);
    await withRlsBypass(() => prisma.organization.create({ data: { id, name: `Test Org (session ${id})` } }));
    return id;
}

async function connectFakeSession(orgId: string): Promise<void> {
    await asOrg(orgId, () => initWhatsApp(orgId));
    const connectionUpdate = socketHandlers.get('connection.update')!;
    await connectionUpdate({ connection: 'open' });
}

beforeAll(async () =>
    withRlsBypass(async () => {
        await prisma.organization.createMany({
            data: [{ id: ORG, name: 'Test Org (WhatsApp opt-out gating)' }],
            skipDuplicates: true,
        });
    }),
);

afterEach(async () => {
    await withRlsBypass(async () => {
        await prisma.whatsAppMessage.deleteMany({ where: { organizationId: ORG } });
        await prisma.optOutRecord.deleteMany({ where: { organizationId: { in: [ORG, ...sessionOrgIds] } } });
        await prisma.lead.deleteMany({ where: { organizationId: ORG } });
        await prisma.contact.deleteMany({ where: { organizationId: ORG } });
        await prisma.company.deleteMany({ where: { organizationId: ORG } });
        if (sessionOrgIds.length > 0) {
            await prisma.organization.deleteMany({ where: { id: { in: sessionOrgIds } } });
        }
    });
    sessionOrgIds.length = 0;
    vi.clearAllMocks();
    redisStore.clear();
    socketHandlers.clear();
});

afterAll(async () => {
    await withRlsBypass(async () => {
        await prisma.organization.deleteMany({ where: { id: ORG } });
    });
});

describe('sendWhatsAppMessage — bloqueio de disparo automatizado por opt-out (Postgres real)', () => {
    it('opt-out scope global bloqueia o disparo automatizado, sem chamar sock.sendMessage', async () => {
        const orgId = await createSessionOrg();
        await connectFakeSession(orgId);
        await asOrg(orgId, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: orgId,
                scope: 'global',
                subject: { phoneE164: '+5511988887777' },
                originChannel: 'voice',
                reason: 'Pediu para não ser mais contatado (registrado por voz)',
            }),
        );

        await expect(sendWhatsAppMessage(orgId, '11988887777', 'Follow-up automático')).rejects.toThrow(/opt-out/i);
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('opt-out scope whatsapp bloqueia o disparo automatizado', async () => {
        const orgId = await createSessionOrg();
        await connectFakeSession(orgId);
        await asOrg(orgId, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: orgId,
                scope: 'whatsapp',
                subject: { phoneE164: '+5511988887777' },
                originChannel: 'whatsapp',
                reason: 'Respondeu SAIR',
            }),
        );

        await expect(sendWhatsAppMessage(orgId, '11988887777', 'Follow-up automático')).rejects.toThrow(/opt-out/i);
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('opt-out restrito a outro canal (voice) NÃO bloqueia WhatsApp — regressão contra superbloqueio', async () => {
        const orgId = await createSessionOrg();
        await connectFakeSession(orgId);
        await asOrg(orgId, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: orgId,
                scope: 'voice',
                subject: { phoneE164: '+5511988887777' },
                originChannel: 'voice',
                reason: 'Não quer mais ligação, mas aceita WhatsApp',
            }),
        );

        const result = await sendWhatsAppMessage(orgId, '11988887777', 'Follow-up automático');
        expect(result).toBe(true);
        expect(mockSocket.sendMessage).toHaveBeenCalled();
    });

    it('sem nenhum opt-out registrado, o disparo automatizado segue normalmente', async () => {
        const orgId = await createSessionOrg();
        await connectFakeSession(orgId);
        const result = await sendWhatsAppMessage(orgId, '11977776666', 'Primeiro contato');
        expect(result).toBe(true);
        expect(mockSocket.sendMessage).toHaveBeenCalled();
    });

    it('skipOptOutCheck (mensagem manual do painel) ignora um opt-out global existente', async () => {
        const orgId = await createSessionOrg();
        await connectFakeSession(orgId);
        await asOrg(orgId, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: orgId,
                scope: 'global',
                subject: { phoneE164: '+5511988887777' },
                originChannel: 'voice',
            }),
        );

        const result = await sendWhatsAppMessage(orgId, '11988887777', 'Resposta manual do vendedor', undefined, {
            skipOptOutCheck: true,
        });
        expect(result).toBe(true);
        expect(mockSocket.sendMessage).toHaveBeenCalled();
    });

    it('RLS: opt-out registrado em outra organização não bloqueia esta organização', async () => {
        const orgId = await createSessionOrg();
        const otherOrg = await createSessionOrg();
        await asOrg(otherOrg, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: otherOrg,
                scope: 'global',
                subject: { phoneE164: '+5511988887777' },
                originChannel: 'voice',
            }),
        );

        await connectFakeSession(orgId);
        const result = await sendWhatsAppMessage(orgId, '11988887777', 'Follow-up automático');
        expect(result).toBe(true);
        expect(mockSocket.sendMessage).toHaveBeenCalled();
    });
});

describe('persistWhatsAppMessage — registro de opt-out a partir de mensagem recebida (Postgres real)', () => {
    async function seedLeadWithContact(phone: string, email: string | null) {
        return asOrg(ORG, async () => {
            const company = await prisma.company.create({
                data: { legalName: 'Empresa Teste', tradeName: 'Empresa Teste', organizationId: ORG },
            });
            const contact = await prisma.contact.create({
                data: { name: 'Lead Teste', phone, whatsapp: phone, email, companyId: company.id, organizationId: ORG },
            });
            const lead = await prisma.lead.create({
                data: { companyId: company.id, contactId: contact.id, organizationId: ORG },
            });
            return { company, contact, lead };
        });
    }

    it('mensagem "parar" registra OptOutRecord scope global casável por leadId/email/telefone, e preserva o flag legado', async () => {
        const { lead } = await seedLeadWithContact('11988880000', 'lead-optout@example.com');

        await asOrg(ORG, () =>
            persistWhatsAppMessage({
                organizationId: ORG,
                waMessageId: `wamsg-${RUN_ID}-1`,
                direction: 'inbound',
                remoteJid: '5511988880000@s.whatsapp.net',
                body: 'parar',
            }),
        );

        const updatedLead = await asOrg(ORG, () => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
        expect((updatedLead.customFields as Record<string, unknown> | null)?.optOutWhatsApp).toBe(true);

        const records = await asOrg(ORG, () =>
            prisma.optOutRecord.findMany({ where: { organizationId: ORG, leadId: lead.id } }),
        );
        expect(records).toHaveLength(1);
        expect(records[0].scope).toBe('Global');
        expect(records[0].email).toBe('lead-optout@example.com');
        expect(records[0].phoneE164).toBe('+5511988880000');
        expect(records[0].originChannel).toBe('whatsapp');
    });

    it('mensagem comum (sem intenção de opt-out) não cria nenhum OptOutRecord', async () => {
        const { lead } = await seedLeadWithContact('11988881111', null);

        await asOrg(ORG, () =>
            persistWhatsAppMessage({
                organizationId: ORG,
                waMessageId: `wamsg-${RUN_ID}-2`,
                direction: 'inbound',
                remoteJid: '5511988881111@s.whatsapp.net',
                body: 'Oi, tudo bem?',
            }),
        );

        const records = await asOrg(ORG, () =>
            prisma.optOutRecord.findMany({ where: { organizationId: ORG, leadId: lead.id } }),
        );
        expect(records).toHaveLength(0);
    });
});
