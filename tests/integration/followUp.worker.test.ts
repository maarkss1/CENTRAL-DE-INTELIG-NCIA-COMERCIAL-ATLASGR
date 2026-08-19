import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Prova, contra Postgres e Redis reais, que `runDailyFollowUpScan` (job diário de follow-up de
 * WhatsApp) funciona ponta a ponta. Achado real (não teórico): antes desta correção,
 * `prisma.lead.findMany` sem nenhum `requestContext.run` sempre devolvia 0 linhas em produção —
 * `Lead` tem `FORCE ROW LEVEL SECURITY`, e nenhuma leitura sem `app.current_tenant_id`/
 * `app.bypass_rls` setados enxerga nenhuma linha (mesma classe de bug corrigida no worker de
 * cadência, onda 19 — ver `docs/CADENCE-CYCLE-AUDIT.md`). O socket do Baileys é mockado (mesmo
 * padrão de `tests/integration/whatsapp-optout-gating.test.ts`); Prisma/RLS NÃO são mockados.
 */

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
import { initWhatsApp } from '../../src/features/integrations/whatsapp/whatsapp.service';
import { runDailyFollowUpScan } from '../../src/features/crm/jobs/followUp.worker';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

let orgCounter = 0;
const createdOrgIds: string[] = [];
async function createTestOrg(): Promise<string> {
    const id = `test-followup-${RUN_ID}-${orgCounter++}`;
    createdOrgIds.push(id);
    await withRlsBypass(() => prisma.organization.create({ data: { id, name: `Test Org (follow-up ${id})` } }));
    return id;
}

async function connectFakeSession(orgId: string): Promise<void> {
    await asOrg(orgId, () => initWhatsApp(orgId));
    const connectionUpdate = socketHandlers.get('connection.update')!;
    await connectionUpdate({ connection: 'open' });
}

async function seedEligibleLead(orgId: string, phone: string, overrides: { status?: string; lastInteraction?: Date; customFields?: object } = {}) {
    return asOrg(orgId, async () => {
        const company = await prisma.company.create({ data: { legalName: 'Empresa Teste Follow-up', tradeName: 'Empresa Teste Follow-up', organizationId: orgId } });
        const contact = await prisma.contact.create({ data: { name: 'Lead Follow-up', phone, whatsapp: phone, companyId: company.id, organizationId: orgId } });
        const lead = await prisma.lead.create({
            data: {
                companyId: company.id,
                contactId: contact.id,
                organizationId: orgId,
                status: (overrides.status ?? 'Lead_Recebido') as never,
                lastInteraction: overrides.lastInteraction ?? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                customFields: overrides.customFields as never,
            },
        });
        return { company, contact, lead };
    });
}

afterEach(async () => {
    if (createdOrgIds.length > 0) {
        await withRlsBypass(async () => {
            await prisma.lead.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.contact.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.company.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
            await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
        });
    }
    createdOrgIds.length = 0;
    vi.clearAllMocks();
    socketHandlers.clear();
});

describe('runDailyFollowUpScan — job real de follow-up de WhatsApp (Postgres + Redis reais)', () => {
    it('roda sem lançar mesmo sem nenhuma sessão de WhatsApp conectada neste teste', async () => {
        // Nota: a suíte de integração compartilha um único banco entre arquivos — não assume "0
        // leads elegíveis" (outro arquivo pode ter deixado um lead elegível). O que este teste prova
        // é que a varredura roda até o fim sem lançar e sem chamar sock.sendMessage (nenhuma sessão
        // conectada neste processo de teste).
        const result = await runDailyFollowUpScan();
        expect(result.eligible).toBeGreaterThanOrEqual(0);
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('encontra um lead elegível real (a descoberta cross-tenant não devolve mais 0 sempre) e envia o follow-up', async () => {
        const org = await createTestOrg();
        const { lead } = await seedEligibleLead(org, '11988887777');
        await connectFakeSession(org);

        const result = await runDailyFollowUpScan();

        expect(result.eligible).toBeGreaterThanOrEqual(1);
        expect(result.sentCount).toBeGreaterThanOrEqual(1);
        expect(mockSocket.sendMessage).toHaveBeenCalled();

        const updated = await asOrg(org, () => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
        expect(updated.lastInteraction!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it('lead com optOutWhatsApp em customFields nunca recebe mensagem', async () => {
        const org = await createTestOrg();
        await seedEligibleLead(org, '11977776666', { customFields: { optOutWhatsApp: true } });
        await connectFakeSession(org);

        await runDailyFollowUpScan();

        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('lead fora do status elegível (ex.: já qualificado/fechado) não é varrido nem mensageado', async () => {
        const org = await createTestOrg();
        const { lead } = await seedEligibleLead(org, '11966665555', { status: 'Reuniao_Agendada' });
        await connectFakeSession(org);

        await runDailyFollowUpScan();

        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
        const untouched = await asOrg(org, () => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
        expect(untouched.lastInteraction!.getTime()).toBeLessThan(Date.now() - 60_000);
    });

    it('varredura cross-tenant real: leads de DUAS organizações diferentes são ambos encontrados e mensageados', async () => {
        const orgA = await createTestOrg();
        const orgB = await createTestOrg();
        const { lead: leadA } = await seedEligibleLead(orgA, '11955554444');
        await connectFakeSession(orgA);
        const { lead: leadB } = await seedEligibleLead(orgB, '11933332222');
        await connectFakeSession(orgB);

        const result = await runDailyFollowUpScan();

        expect(result.sentCount).toBeGreaterThanOrEqual(2);
        expect(mockSocket.sendMessage).toHaveBeenCalledTimes(result.sentCount);

        const updatedA = await asOrg(orgA, () => prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } }));
        const updatedB = await asOrg(orgB, () => prisma.lead.findUniqueOrThrow({ where: { id: leadB.id } }));
        expect(updatedA.lastInteraction!.getTime()).toBeGreaterThan(Date.now() - 60_000);
        expect(updatedB.lastInteraction!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });
});
