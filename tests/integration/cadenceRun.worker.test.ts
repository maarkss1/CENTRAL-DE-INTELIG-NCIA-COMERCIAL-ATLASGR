import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Prova, contra Postgres e Redis reais, que o runtime de cadência (CYC-008, onda-19) funciona
 * ponta a ponta: `scanAndAdvanceCadenceRuns` varre `CadenceRun` ativos reais (descoberta
 * cross-tenant via bypass de RLS restrito a CadenceRun/CadenceSequence — ver
 * `src/lib/prisma.ts`), escopa cada run pelo tenant real, chama `advanceCadenceRun` (domínio,
 * Onda 10) com os adaptadores de produção (`prismaCadenceRunRepository`,
 * `prismaOptOutRepository`, `prismaLeadSubjectResolver`, `productionCadenceDispatcher`,
 * `redisCadenceRunLock`), e grava o resultado real — `CadenceTouchAttempt` + avanço de
 * `currentTouchOrder`/`status`. O socket do Baileys é mockado (mesmo padrão de
 * `tests/integration/whatsapp-optout-gating.test.ts`); Prisma/RLS/opt-out/lock Redis NÃO são
 * mockados.
 */

const redisStore = new Map<string, string>();
vi.mock('../../src/lib/queue/whatsappCommand.queue.js', () => ({
    enqueueWhatsAppCommand: vi.fn(async () => ({ jobId: 'job-1', correlationId: 'corr-1' })),
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
    ev: { on: vi.fn((event: string, handler: EventHandler) => { socketHandlers.set(event, handler); }) },
    logout: vi.fn(),
    onWhatsApp: vi.fn(async () => [{ exists: true, jid: 'fake-jid@s.whatsapp.net' }]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@whiskeysockets/baileys', () => ({
    default: vi.fn(() => mockSocket),
    useMultiFileAuthState: vi.fn(async () => ({ state: {}, saveCreds: vi.fn() })),
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
import { initWhatsApp } from '../../src/features/integrations/whatsapp/whatsapp.service';
import { scanAndAdvanceCadenceRuns } from '../../src/features/cadence/jobs/cadenceRun.worker';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> =>
    requestContext.run({ tenantId: organizationId }, fn);

// Cada teste que precisa de uma sessão de WhatsApp "conectada" usa sua PRÓPRIA organização: a
// sessão do Baileys é um Map module-level em whatsapp.service.ts que sobrevive entre testes, e
// `initWhatsApp` vira no-op se a sessão já está 'connected' — reusar o mesmo organizationId faria
// o 2º+ teste nunca registrar handlers novos no mock do socket (mesmo padrão de
// tests/integration/whatsapp-optout-gating.test.ts).
let orgCounter = 0;
const createdOrgIds: string[] = [];
async function createTestOrg(): Promise<string> {
    const id = `test-cadence-runtime-${RUN_ID}-${orgCounter++}`;
    createdOrgIds.push(id);
    await withRlsBypass(() => prisma.organization.create({ data: { id, name: `Test Org (cadence runtime ${id})` } }));
    return id;
}

async function connectFakeSession(orgId: string): Promise<void> {
    await asOrg(orgId, () => initWhatsApp(orgId));
    const connectionUpdate = socketHandlers.get('connection.update')!;
    await connectionUpdate({ connection: 'open' });
}

async function seedLeadWithWhatsApp(orgId: string, phone: string) {
    return asOrg(orgId, async () => {
        const company = await prisma.company.create({
            data: { legalName: 'Empresa Teste Cadência', tradeName: 'Empresa Teste Cadência', organizationId: orgId },
        });
        const contact = await prisma.contact.create({
            data: { name: 'Lead Cadência', phone, whatsapp: phone, companyId: company.id, organizationId: orgId },
        });
        const lead = await prisma.lead.create({
            data: { companyId: company.id, contactId: contact.id, organizationId: orgId },
        });
        return { company, contact, lead };
    });
}

async function seedActiveRun(orgId: string, leadId: string, touches: unknown, currentTouchOrder = 1) {
    return asOrg(orgId, async () => {
        const sequence = await prisma.cadenceSequence.create({
            data: { organizationId: orgId, name: `Sequência teste ${RUN_ID}`, touches: touches as any },
        });
        const run = await prisma.cadenceRun.create({
            data: {
                organizationId: orgId,
                leadId,
                sequenceId: sequence.id,
                status: 'Active',
                currentTouchOrder,
                startedAt: new Date('2026-08-03T12:00:00Z'),
            },
        });
        return { sequence, run };
    });
}

const SINGLE_WHATSAPP_TOUCH = [{ order: 1, channel: 'whatsapp', delayHoursFromPrevious: 0 }];
const NOW = new Date('2026-08-03T12:00:00Z');

afterEach(async () => {
    if (createdOrgIds.length > 0) {
        await withRlsBypass(async () => {
            await prisma.cadenceTouchAttempt.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.cadenceRun.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.cadenceSequence.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.optOutRecord.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.lead.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.contact.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.company.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
        });
    }
    createdOrgIds.length = 0;
    vi.clearAllMocks();
    redisStore.clear();
    socketHandlers.clear();
});

describe('scanAndAdvanceCadenceRuns — runtime real de cadência (CYC-008/onda-19, Postgres + Redis reais)', () => {
    it('sem nenhum CadenceRun ativo, não faz nada e não lança', async () => {
        const result = await scanAndAdvanceCadenceRuns(NOW);
        expect(result).toEqual({ processed: 0, errors: 0, failedInvalidSequence: 0 });
    });

    it('despacha o toque via WhatsApp real, grava o attempt e conclui o run (sequência de 1 toque)', async () => {
        const org = await createTestOrg();
        const { lead } = await seedLeadWithWhatsApp(org, '11988887777');
        await connectFakeSession(org);
        await seedActiveRun(org, lead.id, SINGLE_WHATSAPP_TOUCH);

        const result = await scanAndAdvanceCadenceRuns(NOW);

        expect(result).toEqual({ processed: 1, errors: 0, failedInvalidSequence: 0 });
        expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);

        const updatedRun = await asOrg(org, () => prisma.cadenceRun.findFirstOrThrow({ where: { organizationId: org, leadId: lead.id } }));
        expect(updatedRun.status).toBe('Completed');
        expect(updatedRun.stopReason).toBe('Completed');

        const attempts = await asOrg(org, () => prisma.cadenceTouchAttempt.findMany({ where: { organizationId: org, cadenceRunId: updatedRun.id } }));
        expect(attempts).toHaveLength(1);
        expect(attempts[0].result).toBe('Sent');
        expect(attempts[0].channel).toBe('WhatsApp');
        expect(attempts[0].attemptNumber).toBe(1);
    });

    it('opt-out registrado para o lead encerra o run sem despachar (gating real, Postgres)', async () => {
        const org = await createTestOrg();
        const { lead } = await seedLeadWithWhatsApp(org, '11977776666');
        await connectFakeSession(org);
        await asOrg(org, () =>
            recordOptOut(prismaOptOutRepository, {
                organizationId: org,
                scope: 'global',
                subject: { leadId: lead.id, phoneE164: '+5511977776666' },
                originChannel: 'whatsapp',
                reason: 'Pediu para parar',
            }),
        );
        await seedActiveRun(org, lead.id, SINGLE_WHATSAPP_TOUCH);

        const result = await scanAndAdvanceCadenceRuns(NOW);

        expect(result).toEqual({ processed: 1, errors: 0, failedInvalidSequence: 0 });
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();

        const updatedRun = await asOrg(org, () => prisma.cadenceRun.findFirstOrThrow({ where: { organizationId: org, leadId: lead.id } }));
        expect(updatedRun.status).toBe('Stopped');
        expect(updatedRun.stopReason).toBe('OptOut');
    });

    it('CadenceSequence.touches malformado encerra o run como failed/policy-guardrail (CYC-002) — não fica preso em Active para sempre', async () => {
        const org = await createTestOrg();
        const { lead } = await seedLeadWithWhatsApp(org, '11966665555');
        const { run } = await seedActiveRun(org, lead.id, [{ order: 1, channel: 'sms-invalido', delayHoursFromPrevious: 0 }]);

        const result = await scanAndAdvanceCadenceRuns(NOW);

        expect(result).toEqual({ processed: 0, errors: 0, failedInvalidSequence: 1 });
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();

        const updatedRun = await asOrg(org, () => prisma.cadenceRun.findUniqueOrThrow({ where: { id: run.id } }));
        expect(updatedRun.status).toBe('Failed');
        expect(updatedRun.stopReason).toBe('PolicyGuardrail');

        // Idempotente: um segundo tick não tenta reprocessar um run já terminal.
        const secondResult = await scanAndAdvanceCadenceRuns(NOW);
        expect(secondResult).toEqual({ processed: 0, errors: 0, failedInvalidSequence: 0 });
    });

    it('varredura cross-tenant: runs ativos de DUAS organizações diferentes são ambos processados, sem vazar dado entre elas', async () => {
        const orgA = await createTestOrg();
        const orgB = await createTestOrg();

        const { lead: leadA } = await seedLeadWithWhatsApp(orgA, '11955554444');
        await connectFakeSession(orgA);
        await seedActiveRun(orgA, leadA.id, SINGLE_WHATSAPP_TOUCH);

        const { lead: leadB } = await seedLeadWithWhatsApp(orgB, '11933332222');
        await connectFakeSession(orgB);
        await seedActiveRun(orgB, leadB.id, SINGLE_WHATSAPP_TOUCH);

        const result = await scanAndAdvanceCadenceRuns(NOW);

        expect(result).toEqual({ processed: 2, errors: 0, failedInvalidSequence: 0 });
        expect(mockSocket.sendMessage).toHaveBeenCalledTimes(2);

        const runA = await asOrg(orgA, () => prisma.cadenceRun.findFirstOrThrow({ where: { organizationId: orgA, leadId: leadA.id } }));
        const runB = await asOrg(orgB, () => prisma.cadenceRun.findFirstOrThrow({ where: { organizationId: orgB, leadId: leadB.id } }));
        expect(runA.status).toBe('Completed');
        expect(runB.status).toBe('Completed');

        // RLS: nenhuma organização enxerga o CadenceRun da outra por uma leitura escopada normal.
        const runAFromOrgB = await asOrg(orgB, () => prisma.cadenceRun.findFirst({ where: { id: runA.id } }));
        expect(runAFromOrgB).toBeNull();
    });
});
