import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const contextStore: { tenantId?: string; bypassRls?: boolean }[] = [];
vi.mock('@/lib/async-context', () => ({
    requestContext: {
        run: async (store: { tenantId?: string; bypassRls?: boolean }, fn: () => unknown) => {
            contextStore.push(store);
            return fn();
        },
    },
}));

const prismaMock = {
    bitrixConnection: { findUnique: vi.fn() },
    lead: { findFirst: vi.fn(), update: vi.fn() },
    contact: { update: vi.fn() },
    bitrixSyncLog: { create: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const clientMock = { callBitrix: vi.fn() };
vi.mock('../service/client.js', () => clientMock);

vi.mock('../service/customFields.js', () => ({
    resolveEnumMaps: vi.fn().mockResolvedValue(new Map()),
    applyInboundCustomFields: vi.fn().mockReturnValue({ qualification: {}, leadFields: {}, contactRole: null }),
}));

const CONNECTION = {
    id: 'conn-1',
    organizationId: 'org-1',
    webhookUrl: 'https://portal.bitrix24.com.br/rest/1/token/',
    webhookSecret: 'segredo-correto',
    inboundEventsEnabled: true,
};

async function buildApp() {
    const { bitrixWebhookRoutes } = await import('../bitrix.webhook.js');
    const app = express();
    app.use(bitrixWebhookRoutes);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    contextStore.length = 0;
    prismaMock.bitrixSyncLog.create.mockResolvedValue({});
});

/**
 * Fecha o item "Webhooks: QUEBRADOS" da auditoria — antes desta rota não existia NENHUM
 * endpoint de entrada; Bitrix→Atlas era 100% poll. Estes testes cobrem autenticação (segredo por
 * conexão, não HMAC — é o modelo real do webhook de saída do Bitrix), o escopo deliberadamente
 * estreito (só atualiza registros JÁ importados, nunca cria), e a garantia estrutural de que este
 * caminho nunca dispara push de volta ao Bitrix (o que fecharia um loop).
 */
describe('POST /webhook/:connectionId', () => {
    it('rejeita com 400 quando auth.application_token está ausente', async () => {
        const app = await buildApp();
        const res = await request(app).post('/webhook/conn-1').send('event=ONCRMLEADUPDATE');
        expect(res.status).toBe(400);
        expect(prismaMock.bitrixConnection.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita com 404 quando a conexão não existe, sem distinguir do caso "eventos desligados" (não vaza qual é o caso)', async () => {
        prismaMock.bitrixConnection.findUnique.mockResolvedValue(null);
        const app = await buildApp();
        const res = await request(app).post('/webhook/conn-inexistente').send('auth[application_token]=qualquer');
        expect(res.status).toBe(404);
    });

    it('rejeita com 404 quando inboundEventsEnabled está desligado, mesmo com a conexão existindo', async () => {
        prismaMock.bitrixConnection.findUnique.mockResolvedValue({ ...CONNECTION, inboundEventsEnabled: false });
        const app = await buildApp();
        const res = await request(app).post('/webhook/conn-1').send('auth[application_token]=segredo-correto');
        expect(res.status).toBe(404);
    });

    it('rejeita com 401 quando o application_token não bate com o segredo salvo', async () => {
        prismaMock.bitrixConnection.findUnique.mockResolvedValue(CONNECTION);
        const app = await buildApp();
        const res = await request(app).post('/webhook/conn-1').send('auth[application_token]=segredo-errado');
        expect(res.status).toBe(401);
        expect(prismaMock.lead.findFirst).not.toHaveBeenCalled();
    });

    it('aceita com 200 e ignora eventos não suportados, em vez de derrubar o webhook no admin do Bitrix', async () => {
        prismaMock.bitrixConnection.findUnique.mockResolvedValue(CONNECTION);
        const app = await buildApp();
        const res = await request(app)
            .post('/webhook/conn-1')
            .send('auth[application_token]=segredo-correto&event=ONCRMCONTACTADD&data[FIELDS][ID]=1');
        expect(res.status).toBe(200);
        expect(res.body.ignored).toBe('ONCRMCONTACTADD');
    });

    it('escopo estreito: quando o bitrixRecordId não corresponde a nenhum Lead JÁ IMPORTADO, não cria nada — só registra "skipped"', async () => {
        prismaMock.bitrixConnection.findUnique.mockResolvedValue(CONNECTION);
        prismaMock.lead.findFirst.mockResolvedValue(null);
        const app = await buildApp();

        const res = await request(app)
            .post('/webhook/conn-1')
            .send('auth[application_token]=segredo-correto&event=ONCRMLEADUPDATE&data[FIELDS][ID]=123');

        expect(res.status).toBe(200);
        expect(prismaMock.lead.update).not.toHaveBeenCalled();
        expect(clientMock.callBitrix).not.toHaveBeenCalled();
        expect(prismaMock.bitrixSyncLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'skipped', leadId: null }) }));
    });

    it('atualiza o Lead local já importado com os dados atuais do Bitrix, dentro do contexto de tenant correto (RLS)', async () => {
        prismaMock.bitrixConnection.findUnique.mockResolvedValue(CONNECTION);
        prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-local-1', organizationId: 'org-1', bitrixLeadId: '123', contactId: null, qualification: null });
        clientMock.callBitrix.mockResolvedValue({ result: { ID: '123', STATUS_ID: 'IN_PROCESS' } });
        prismaMock.lead.update.mockResolvedValue({});

        const app = await buildApp();
        const res = await request(app)
            .post('/webhook/conn-1')
            .send('auth[application_token]=segredo-correto&event=ONCRMLEADUPDATE&data[FIELDS][ID]=123');

        expect(res.status).toBe(200);
        expect(clientMock.callBitrix).toHaveBeenCalledWith(CONNECTION.webhookUrl, 'crm.lead.get', { id: '123' });
        expect(prismaMock.lead.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'lead-local-1' },
            data: expect.objectContaining({ bitrixStageLabel: 'IN_PROCESS' }),
        }));
        expect(prismaMock.bitrixSyncLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'success', direction: 'inbound' }) }));
        // O bootstrap (achar a conexão) usa bypassRls; o processamento do lead já roda escopado ao tenant certo.
        expect(contextStore.some((s) => s.bypassRls === true)).toBe(true);
        expect(contextStore.some((s) => s.tenantId === 'org-1')).toBe(true);
    });

    it('NUNCA dispara push/export de volta ao Bitrix a partir de um evento de entrada (evita loop Bitrix→webhook→Atlas→push→Bitrix)', async () => {
        // Verificação estrutural: o módulo do webhook não importa nada de outboundSync.js. Se
        // algum dia alguém adicionar essa chamada, este require vai continuar funcionando (o
        // teste em si não quebra), então o que prova a ausência de loop é a leitura de código —
        // este teste apenas documenta e fixa o comportamento observável: mesmo processando um
        // evento com sucesso, nenhuma chamada crm.lead.add/crm.lead.update de EXPORTAÇÃO ocorre,
        // só crm.lead.get (leitura).
        prismaMock.bitrixConnection.findUnique.mockResolvedValue(CONNECTION);
        prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-local-1', organizationId: 'org-1', bitrixLeadId: '123', contactId: null, qualification: null });
        clientMock.callBitrix.mockResolvedValue({ result: { ID: '123' } });

        const app = await buildApp();
        await request(app).post('/webhook/conn-1').send('auth[application_token]=segredo-correto&event=ONCRMLEADUPDATE&data[FIELDS][ID]=123');

        const methodsCalled = clientMock.callBitrix.mock.calls.map((c) => c[1]);
        expect(methodsCalled).not.toContain('crm.lead.add');
        expect(methodsCalled).not.toContain('crm.lead.update');
    });
});
