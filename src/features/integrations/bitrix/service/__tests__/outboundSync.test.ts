import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitrixSyncFailuresTotal } from '../metrics.js';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const auditServiceMock = { log: vi.fn() };
vi.mock('@/lib/audit/audit.service', () => ({ AuditService: auditServiceMock }));

vi.mock('@/lib/enumMap', () => ({ fromPrismaLeadStatus: (s: string) => s }));

const prismaMock = {
    lead: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    bitrixConnection: { findFirst: vi.fn() },
    bitrixSyncLog: { create: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const clientMock = { callBitrix: vi.fn(), getConnectionWebhookUrl: vi.fn() };
vi.mock('../client.js', () => clientMock);

vi.mock('../customFields.js', () => ({
    resolveEnumMaps: vi.fn().mockResolvedValue(new Map()),
    buildOutboundCustomFields: vi.fn().mockReturnValue({}),
}));

const WEBHOOK_URL = 'https://portal.bitrix24.com.br/rest/1/token/';
const baseLead = {
    id: 'lead-1',
    organizationId: 'org-1',
    status: 'Lead_Recebido',
    temperature: null,
    score: null,
    pic: null,
    qualification: null,
    bitrixLeadId: null as string | null,
    company: { tradeName: 'Empresa X', legalName: 'Empresa X LTDA', observations: null, phones: [], emails: [] },
    contact: { name: 'Fulano Silva', phone: '11999999999', email: 'fulano@empresax.com.br' },
};

beforeEach(() => {
    vi.clearAllMocks();
    bitrixSyncFailuresTotal.reset();
    prismaMock.bitrixSyncLog.create.mockResolvedValue({});
    prismaMock.lead.update.mockResolvedValue({});
    prismaMock.lead.updateMany.mockResolvedValue({ count: 1 }); // reivindica a corrida por padrão
});

describe('syncLeadToBitrix — criação (P1-3, P2-2, P2-3 da auditoria)', () => {
    it('cria via crm.lead.add quando bitrixLeadId é nulo e não há duplicata no Bitrix, e grava bitrixSyncStatus=synced', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ ...baseLead });
        clientMock.callBitrix.mockImplementation(async (_url: string, method: string) => {
            if (method === 'crm.duplicate.findbycomm') return { result: {} };
            if (method === 'crm.lead.add') return { result: '999' };
            return { result: {} };
        });

        const { pushLeadToBitrix } = await import('../outboundSync.js');
        prismaMock.bitrixConnection.findFirst.mockResolvedValue({ id: 'conn-1', webhookUrl: WEBHOOK_URL });

        await pushLeadToBitrix('org-1', 'lead-1');

        expect(clientMock.callBitrix).toHaveBeenCalledWith(WEBHOOK_URL, 'crm.lead.add', expect.anything(), expect.anything());
        expect(prismaMock.lead.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ bitrixLeadId: '999', bitrixSyncStatus: 'synced', bitrixSyncError: null }),
        }));
    });

    it('atualiza via crm.lead.update quando bitrixLeadId já existe, sem checar duplicidade nem reivindicar a trava de criação', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ ...baseLead, bitrixLeadId: '555' });
        clientMock.callBitrix.mockResolvedValue({ result: {} });
        clientMock.getConnectionWebhookUrl.mockResolvedValue(WEBHOOK_URL);

        const { exportLeadToBitrixNow } = await import('../outboundSync.js');
        const result = await exportLeadToBitrixNow('org-1', 'lead-1', 'conn-1');

        expect(result.bitrixLeadId).toBe('555');
        expect(clientMock.callBitrix).toHaveBeenCalledWith(WEBHOOK_URL, 'crm.lead.update', { id: '555', fields: expect.anything() }, expect.anything());
        expect(clientMock.callBitrix).not.toHaveBeenCalledWith(expect.anything(), 'crm.duplicate.findbycomm', expect.anything(), expect.anything());
        expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
    });

    it('P2-2 CORRIGIDO: reaproveita um Lead já existente no Bitrix (achado por e-mail/telefone via crm.duplicate.findbycomm) em vez de criar um duplicado', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ ...baseLead });
        clientMock.getConnectionWebhookUrl.mockResolvedValue(WEBHOOK_URL);
        clientMock.callBitrix.mockImplementation(async (_url: string, method: string) => {
            if (method === 'crm.duplicate.findbycomm') return { result: { LEAD: ['777'] } };
            return { result: {} };
        });

        const { exportLeadToBitrixNow } = await import('../outboundSync.js');
        const result = await exportLeadToBitrixNow('org-1', 'lead-1', 'conn-1');

        expect(result.bitrixLeadId).toBe('777');
        expect(clientMock.callBitrix).toHaveBeenCalledWith(WEBHOOK_URL, 'crm.lead.update', { id: '777', fields: expect.anything() }, expect.anything());
        expect(clientMock.callBitrix).not.toHaveBeenCalledWith(expect.anything(), 'crm.lead.add', expect.anything(), expect.anything());
        expect(prismaMock.lead.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ bitrixLeadId: '777', bitrixSyncStatus: 'synced' }),
        }));
    });

    it('segue para crm.lead.add normalmente quando crm.duplicate.findbycomm falha (portal antigo/sem permissão) — dedup é best-effort, não bloqueante', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ ...baseLead });
        clientMock.getConnectionWebhookUrl.mockResolvedValue(WEBHOOK_URL);
        clientMock.callBitrix.mockImplementation(async (_url: string, method: string) => {
            if (method === 'crm.duplicate.findbycomm') throw new Error('Método não suportado por este webhook');
            if (method === 'crm.lead.add') return { result: '321' };
            return { result: {} };
        });

        const { exportLeadToBitrixNow } = await import('../outboundSync.js');
        const result = await exportLeadToBitrixNow('org-1', 'lead-1', 'conn-1');

        expect(result.bitrixLeadId).toBe('321');
    });

    it('P2-3 CORRIGIDO: se outra exportação concorrente já reivindicou a criação (updateMany conta 0), lança 409 em vez de arriscar criar um segundo Lead no Bitrix', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ ...baseLead });
        clientMock.getConnectionWebhookUrl.mockResolvedValue(WEBHOOK_URL);
        prismaMock.lead.updateMany.mockResolvedValue({ count: 0 }); // outra chamada já reivindicou

        const { exportLeadToBitrixNow } = await import('../outboundSync.js');
        await expect(exportLeadToBitrixNow('org-1', 'lead-1', 'conn-1')).rejects.toThrow(/já está sendo sincronizado/i);
        expect(clientMock.callBitrix).not.toHaveBeenCalledWith(expect.anything(), 'crm.lead.add', expect.anything(), expect.anything());
    });

    it('P1-3 CORRIGIDO: em falha do Bitrix, grava bitrixSyncStatus=failed com o motivo em vez de deixar a falha só no log', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ ...baseLead });
        clientMock.getConnectionWebhookUrl.mockResolvedValue(WEBHOOK_URL);
        clientMock.callBitrix.mockImplementation(async (_url: string, method: string) => {
            if (method === 'crm.duplicate.findbycomm') return { result: {} };
            throw new Error('Bitrix24 aplicou limite de chamadas (HTTP 429).');
        });

        const { exportLeadToBitrixNow } = await import('../outboundSync.js');
        await expect(exportLeadToBitrixNow('org-1', 'lead-1', 'conn-1')).rejects.toThrow(/limite de chamadas/i);

        expect(prismaMock.lead.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ bitrixSyncStatus: 'failed', bitrixSyncError: expect.stringContaining('limite de chamadas') }),
        }));
        expect(prismaMock.bitrixSyncLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'failed' }),
        }));

        // Handoff 10-para-06 (bloqueador #11): a falha também precisa incrementar o Counter
        // Prometheus consumido pelo alerta BitrixSyncFailuresHigh, não só o log/BitrixSyncLog.
        const metric = await bitrixSyncFailuresTotal.get();
        const point = metric.values.find((v) => v.labels.tenant === 'org-1' && v.labels.entity === 'lead');
        expect(point?.value).toBe(1);
    });

    it('inclui STATUS_ID/ASSIGNED_BY_ID no payload quando overrides são passados (P3-2)', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ ...baseLead, bitrixLeadId: '555' });
        clientMock.getConnectionWebhookUrl.mockResolvedValue(WEBHOOK_URL);
        clientMock.callBitrix.mockResolvedValue({ result: {} });

        const { exportLeadToBitrixNow } = await import('../outboundSync.js');
        await exportLeadToBitrixNow('org-1', 'lead-1', 'conn-1', { statusId: 'NEW', assignedById: '42' });

        expect(clientMock.callBitrix).toHaveBeenCalledWith(
            WEBHOOK_URL,
            'crm.lead.update',
            { id: '555', fields: expect.objectContaining({ STATUS_ID: 'NEW', ASSIGNED_BY_ID: '42' }) },
            expect.anything(),
        );
    });
});

describe('pushLeadToBitrix — automático (fire-and-forget)', () => {
    it('nunca propaga erro ao chamador mesmo quando a sincronização falha', async () => {
        prismaMock.bitrixConnection.findFirst.mockResolvedValue({ id: 'conn-1', webhookUrl: WEBHOOK_URL });
        prismaMock.lead.findFirst.mockResolvedValue({ ...baseLead });
        clientMock.callBitrix.mockRejectedValue(new Error('Falha de rede'));

        const { pushLeadToBitrix } = await import('../outboundSync.js');
        await expect(pushLeadToBitrix('org-1', 'lead-1')).resolves.toBeUndefined();
    });

    it('não faz nada (sem lançar) quando a organização não tem conexão Bitrix', async () => {
        prismaMock.bitrixConnection.findFirst.mockResolvedValue(null);
        const { pushLeadToBitrix } = await import('../outboundSync.js');
        await expect(pushLeadToBitrix('org-1', 'lead-1')).resolves.toBeUndefined();
        expect(clientMock.callBitrix).not.toHaveBeenCalled();
    });
});
