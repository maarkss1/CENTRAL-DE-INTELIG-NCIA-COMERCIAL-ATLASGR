import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cobre o handoff .agents/handoffs/onda-1/06-para-01-persistencia-3cx.md: antes desta mudança,
// threecx.service.ts guardava conexões num `Map` em memória (perdido a cada restart/redeploy,
// inconsistente entre instâncias). Estes testes provam que a leitura/escrita passa 100% pelo
// Prisma (nenhum estado em memória module-level sobrevive entre chamadas) e que a operação nunca
// vaza/apaga dado de outra organização.
const prismaMock = {
    threeCXConnection: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
    },
    threeCXCallEvent: {
        findFirst: vi.fn(),
        create: vi.fn(),
    },
    organization: {
        findMany: vi.fn(),
    },
    lead: {
        findFirst: vi.fn(),
    },
    activity: {
        create: vi.fn(),
        findFirst: vi.fn(),
    },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const assertSafeExternalUrlMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../shared/security/urlGuard.js', () => ({
    assertSafeExternalUrl: assertSafeExternalUrlMock,
}));

const isSuppressedMock = vi.fn().mockResolvedValue(false);
vi.mock('@/features/integrations/birth-voice/callSuppression.service', () => ({
    isSuppressed: (...args: unknown[]) => isSuppressedMock(...args),
}));

// Logger real (pino + pino-pretty transport) grava em stdout via worker thread — trocado por um
// double simples para os testes de idempotência/tenant poderem espiar o que foi logado, e para o
// teste de "nunca loga o telefone completo" conseguir inspecionar os argumentos reais.
const loggerMock = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

beforeEach(() => {
    vi.clearAllMocks();
    assertSafeExternalUrlMock.mockResolvedValue(undefined);
    isSuppressedMock.mockResolvedValue(false);
});

describe('get3CXConnectionsForOrg / save3CXConnectionForOrg / delete3CXConnectionForOrg', () => {
    it('lista sempre consulta o Prisma filtrado por organizationId — nenhum cache em memória entre chamadas', async () => {
        const { get3CXConnectionsForOrg } = await import('../threecx.service.js');
        prismaMock.threeCXConnection.findMany.mockResolvedValueOnce([{ id: 'conn-1', organizationId: 'org-a' }]);
        const first = await get3CXConnectionsForOrg('org-a');
        expect(first).toHaveLength(1);
        expect(prismaMock.threeCXConnection.findMany).toHaveBeenCalledWith({
            where: { organizationId: 'org-a' },
            orderBy: { createdAt: 'desc' },
        });

        // Uma segunda chamada, mesmo com o mock devolvendo vazio, não reaproveita nenhum resultado
        // anterior — prova que não sobrou nenhum Map/estado module-level do storage antigo.
        prismaMock.threeCXConnection.findMany.mockResolvedValueOnce([]);
        const second = await get3CXConnectionsForOrg('org-a');
        expect(second).toEqual([]);
    });

    it('save grava via prisma.threeCXConnection.create com o organizationId correto', async () => {
        const { save3CXConnectionForOrg } = await import('../threecx.service.js');
        prismaMock.threeCXConnection.create.mockResolvedValueOnce({});
        await save3CXConnectionForOrg('org-a', {
            id: 'conn-1',
            label: '3CX Ramal 101',
            pbxUrl: 'https://pbx.example.com',
            extension: '101',
            apiKey: 'key',
            apiSecret: 'secret',
            autoDialEnabled: true,
            createdAt: new Date('2026-01-01T00:00:00Z'),
        });

        expect(prismaMock.threeCXConnection.create).toHaveBeenCalledWith({
            data: {
                id: 'conn-1',
                organizationId: 'org-a',
                label: '3CX Ramal 101',
                pbxUrl: 'https://pbx.example.com',
                extension: '101',
                apiKey: 'key',
                apiSecret: 'secret',
                autoDialEnabled: true,
            },
        });
    });

    it('delete é escopado por organizationId — nunca apaga conexão de outro tenant mesmo com id adivinhado', async () => {
        const { delete3CXConnectionForOrg } = await import('../threecx.service.js');
        prismaMock.threeCXConnection.deleteMany.mockResolvedValueOnce({ count: 0 });
        await delete3CXConnectionForOrg('org-a', 'conn-de-outra-org');
        expect(prismaMock.threeCXConnection.deleteMany).toHaveBeenCalledWith({
            where: { id: 'conn-de-outra-org', organizationId: 'org-a' },
        });
    });
});

describe('list3CXConnections', () => {
    it('nunca expõe apiKey/apiSecret no resumo devolvido à UI', async () => {
        const { list3CXConnections } = await import('../threecx.service.js');
        prismaMock.threeCXConnection.findMany.mockResolvedValueOnce([
            {
                id: 'conn-1',
                label: '3CX Ramal 101',
                pbxUrl: 'https://pbx.example.com',
                extension: '101',
                apiKey: 'super-secret-key',
                apiSecret: 'super-secret-secret',
                autoDialEnabled: true,
                createdAt: new Date('2026-01-01T00:00:00Z'),
            },
        ]);

        const result = await list3CXConnections('org-a');
        expect(result).toEqual([
            {
                id: 'conn-1',
                label: '3CX Ramal 101',
                pbxUrl: 'https://pbx.example.com',
                extension: '101',
                autoDialEnabled: true,
                createdAt: new Date('2026-01-01T00:00:00Z'),
            },
        ]);
        expect(result[0]).not.toHaveProperty('apiKey');
        expect(result[0]).not.toHaveProperty('apiSecret');
    });
});

describe('connect3CX', () => {
    it('rejeita sem pbxUrl', async () => {
        const { connect3CX } = await import('../threecx.service.js');
        await expect(connect3CX('org-a', { pbxUrl: '', extension: '101' })).rejects.toThrow(
            'Informe a URL do servidor 3CX PABX',
        );
        expect(prismaMock.threeCXConnection.create).not.toHaveBeenCalled();
    });

    it('rejeita sem extension', async () => {
        const { connect3CX } = await import('../threecx.service.js');
        await expect(
            connect3CX('org-a', { pbxUrl: 'https://pbx.example.com', extension: '' }),
        ).rejects.toThrow('Informe o ramal 3CX');
        expect(prismaMock.threeCXConnection.create).not.toHaveBeenCalled();
    });

    it('valida a URL contra SSRF (assertSafeExternalUrl) antes de persistir', async () => {
        const { connect3CX } = await import('../threecx.service.js');
        assertSafeExternalUrlMock.mockRejectedValueOnce(new Error('Endereço de webhook não permitido (IP privado/reservado).'));
        prismaMock.threeCXConnection.create.mockResolvedValueOnce({});

        await expect(
            connect3CX('org-a', { pbxUrl: 'https://169.254.169.254', extension: '101' }),
        ).rejects.toThrow('IP privado/reservado');
        expect(prismaMock.threeCXConnection.create).not.toHaveBeenCalled();
    });

    it('persiste via Prisma e devolve resumo sem apiKey/apiSecret', async () => {
        const { connect3CX } = await import('../threecx.service.js');
        prismaMock.threeCXConnection.create.mockResolvedValueOnce({});

        const result = await connect3CX('org-a', {
            pbxUrl: 'https://pbx.example.com/',
            extension: '101',
            apiKey: 'key',
            apiSecret: 'secret',
        });

        expect(prismaMock.threeCXConnection.create).toHaveBeenCalledTimes(1);
        const createArgs = prismaMock.threeCXConnection.create.mock.calls[0][0];
        expect(createArgs.data.organizationId).toBe('org-a');
        expect(createArgs.data.pbxUrl).toBe('https://pbx.example.com'); // barra final removida
        expect(createArgs.data.apiKey).toBe('key');
        expect(createArgs.data.apiSecret).toBe('secret');

        expect(result).not.toHaveProperty('apiKey');
        expect(result).not.toHaveProperty('apiSecret');
        expect(result.pbxUrl).toBe('https://pbx.example.com');
        expect(result.extension).toBe('101');
    });
});

describe('make3CXCall', () => {
    const conn = {
        id: 'conn-1',
        organizationId: 'org-a',
        label: '3CX Ramal 101',
        pbxUrl: 'https://pbx.example.com',
        extension: '101',
        apiKey: null,
        apiSecret: null,
        autoDialEnabled: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    beforeEach(() => {
        prismaMock.threeCXConnection.findMany.mockResolvedValue([conn]);
        prismaMock.activity.create.mockResolvedValue({});
    });

    // "Um número suprimido nunca é discado, por nenhum caminho" — o Click-to-Call do 3CX é um
    // segundo caminho de discagem além do SDR de voz (birth-voice), e precisa respeitar a mesma
    // lista de bloqueio.
    it('recusa a chamada e não bate na rede quando o número está na lista de bloqueio', async () => {
        const { make3CXCall } = await import('../threecx.service.js');
        isSuppressedMock.mockResolvedValue(true);
        vi.stubGlobal('fetch', vi.fn());

        await expect(make3CXCall('org-a', 'conn-1', '11999998888')).rejects.toThrow(
            'lista interna de bloqueio',
        );
        expect(fetch).not.toHaveBeenCalled();
        expect(isSuppressedMock).toHaveBeenCalledWith('org-a', '11999998888', { leadId: null, email: null });

        vi.unstubAllGlobals();
    });

    // leadId, quando informado pela rota, entra como contexto para o opt-out unificado entre
    // canais (ver `17-para-05-06-12-contrato-optout.md`) — sem isso, um opt-out feito por e-mail
    // (05) ou WhatsApp (06) do mesmo lead não bloquearia o Click-to-Call do 3CX.
    it('propaga o leadId, quando informado, como contexto do opt-out unificado', async () => {
        const { make3CXCall } = await import('../threecx.service.js');
        isSuppressedMock.mockResolvedValue(true);
        vi.stubGlobal('fetch', vi.fn());

        await expect(make3CXCall('org-a', 'conn-1', '11999998888', 'lead-1')).rejects.toThrow(
            'lista interna de bloqueio',
        );
        expect(isSuppressedMock).toHaveBeenCalledWith('org-a', '11999998888', { leadId: 'lead-1', email: null });

        vi.unstubAllGlobals();
    });

    // Gap fechado nesta auditoria: sem leadId resolvido, o e-mail do contato agora também entra
    // no contexto do opt-out unificado — antes disso o Click-to-Call só era barrado por telefone
    // ou por leadId, nunca por e-mail sozinho.
    it('propaga o email, quando informado sem leadId, como contexto do opt-out unificado', async () => {
        const { make3CXCall } = await import('../threecx.service.js');
        isSuppressedMock.mockResolvedValue(true);
        vi.stubGlobal('fetch', vi.fn());

        await expect(
            make3CXCall('org-a', 'conn-1', '11999998888', undefined, 'ana@exemplo.com'),
        ).rejects.toThrow('lista interna de bloqueio');
        expect(isSuppressedMock).toHaveBeenCalledWith('org-a', '11999998888', {
            leadId: null,
            email: 'ana@exemplo.com',
        });

        vi.unstubAllGlobals();
    });

    it('nunca afirma sucesso quando o PABX não responde OK — falha honesta', async () => {
        const { make3CXCall } = await import('../threecx.service.js');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));

        await expect(make3CXCall('org-a', 'conn-1', '11999998888', 'lead-1')).rejects.toThrow(
            'Não foi possível disparar a chamada',
        );

        // A atividade gravada no CRM reflete a falha real, nunca "chamada iniciada".
        expect(prismaMock.activity.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    observations: expect.stringContaining('FALHOU'),
                }),
            }),
        );

        vi.unstubAllGlobals();
    });

    it('só afirma sucesso quando o PABX de fato responde OK', async () => {
        const { make3CXCall } = await import('../threecx.service.js');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

        const result = await make3CXCall('org-a', 'conn-1', '11999998888', 'lead-1');

        expect(result.success).toBe(true);
        expect(prismaMock.activity.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    observations: expect.stringContaining('Chamada disparada via 3CX PABX'),
                }),
            }),
        );

        vi.unstubAllGlobals();
    });

    // Gap real de auditoria: `conn.pbxUrl` já foi validado uma vez em `connect3CX`, mas nunca era
    // revalidado no momento da chamada real — um DNS rebinding (host resolvia IP público no
    // cadastro, IP privado agora) passaria batido em toda chamada Click-to-Call seguinte.
    it('revalida a URL persistida contra SSRF (assertSafeExternalUrl) antes de discar de verdade', async () => {
        const { make3CXCall } = await import('../threecx.service.js');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        assertSafeExternalUrlMock.mockRejectedValueOnce(
            new Error('Endereço não permitido (resolve para IP privado/reservado).'),
        );

        await expect(make3CXCall('org-a', 'conn-1', '11999998888', 'lead-1')).rejects.toThrow(
            'IP privado/reservado',
        );
        expect(assertSafeExternalUrlMock).toHaveBeenCalledWith('https://pbx.example.com');
        expect(fetchMock).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });
});

describe('test3CXConnection', () => {
    const conn = {
        id: 'conn-1',
        organizationId: 'org-a',
        label: '3CX Ramal 101',
        pbxUrl: 'https://pbx.example.com',
        extension: '101',
        apiKey: null,
        apiSecret: null,
        autoDialEnabled: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    beforeEach(() => {
        prismaMock.threeCXConnection.findMany.mockResolvedValue([conn]);
    });

    it('revalida a URL persistida contra SSRF (assertSafeExternalUrl) antes do healthcheck', async () => {
        const { test3CXConnection } = await import('../threecx.service.js');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await test3CXConnection('org-a', 'conn-1');

        expect(assertSafeExternalUrlMock).toHaveBeenCalledWith('https://pbx.example.com');
        vi.unstubAllGlobals();
    });

    // Mesmo gap de DNS rebinding do make3CXCall: pbxUrl já validado no cadastro, mas o botão
    // "Testar conexão" reusa a URL persistida — sem revalidação aqui, uma mudança de DNS depois do
    // cadastro nunca seria pega de novo por este caminho.
    it('nunca bate na rede quando a URL persistida falha na revalidação de SSRF', async () => {
        const { test3CXConnection } = await import('../threecx.service.js');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        assertSafeExternalUrlMock.mockRejectedValueOnce(
            new Error('Endereço não permitido (resolve para IP privado/reservado).'),
        );

        await expect(test3CXConnection('org-a', 'conn-1')).rejects.toThrow('IP privado/reservado');
        expect(fetchMock).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });
});

describe('process3CXWebhook', () => {
    const CONN_ORG_A = {
        id: 'conn-1',
        organizationId: 'org-a',
        label: '3CX Ramal 101',
        pbxUrl: 'https://pbx.example.com',
        extension: '101',
        apiKey: null,
        apiSecret: null,
        autoDialEnabled: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    const CONN_ORG_B = { ...CONN_ORG_A, id: 'conn-2', organizationId: 'org-b' };

    const FULL_PAYLOAD = {
        event: 'call.ended',
        extension: '101',
        callId: 'call-1',
        disposition: 'answered',
        duration: 42,
        to: '5511999998888',
    };

    it('resolve a organização certa a partir do ramal e grava a Activity real no lead correspondente', async () => {
        const { process3CXWebhook } = await import('../threecx.service.js');

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-a' }]);
        prismaMock.threeCXConnection.findFirst.mockResolvedValue(CONN_ORG_A);
        prismaMock.threeCXCallEvent.findFirst.mockResolvedValue(null);
        prismaMock.threeCXCallEvent.create.mockResolvedValue({});
        prismaMock.lead.findFirst.mockResolvedValue({
            id: 'lead-1',
            contact: { phone: '5511999998888', whatsapp: null },
        });
        prismaMock.activity.findFirst.mockResolvedValue(null);
        prismaMock.activity.create.mockResolvedValue({});

        const result = await process3CXWebhook(FULL_PAYLOAD);

        expect(result).toMatchObject({ status: 'processed', organizationId: 'org-a', leadId: 'lead-1' });

        // O rastro de auditoria (ThreeCXCallEvent) é gravado escopado à organização resolvida.
        expect(prismaMock.threeCXCallEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: 'org-a',
                    connectionId: 'conn-1',
                    callId: 'call-1',
                    eventType: 'call.ended',
                }),
            }),
        );

        // A Activity reflete o resultado real (disposition/duração/estado), nunca inventado.
        expect(prismaMock.activity.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: 'org-a',
                    leadId: 'lead-1',
                    type: 'Ligacao',
                    status: 'Concluida', // 'answered' + 42s -> classifyCallOutcome = 'completed'
                    observations: expect.stringContaining('[call:call-1]'),
                }),
            }),
        );
        expect(prismaMock.activity.create.mock.calls[0][0].data.observations).toContain('answered');
    });

    it('reentrega do mesmo call_id não duplica a nota (idempotência por ThreeCXCallEvent)', async () => {
        const { process3CXWebhook } = await import('../threecx.service.js');

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-a' }]);
        prismaMock.threeCXConnection.findFirst.mockResolvedValue(CONN_ORG_A);
        prismaMock.lead.findFirst.mockResolvedValue({
            id: 'lead-1',
            contact: { phone: '5511999998888', whatsapp: null },
        });
        prismaMock.activity.findFirst.mockResolvedValue(null);
        prismaMock.activity.create.mockResolvedValue({});
        prismaMock.threeCXCallEvent.create.mockResolvedValue({});

        // Primeira entrega: nenhum evento gravado ainda.
        prismaMock.threeCXCallEvent.findFirst.mockResolvedValueOnce(null);
        const first = await process3CXWebhook(FULL_PAYLOAD);
        expect(first.status).toBe('processed');
        expect(first.duplicate).toBeFalsy();

        // Segunda entrega (reentrega do PABX): o evento já existe.
        prismaMock.threeCXCallEvent.findFirst.mockResolvedValueOnce({ id: 'evt-1' });
        const second = await process3CXWebhook(FULL_PAYLOAD);
        expect(second).toMatchObject({ status: 'processed', duplicate: true, organizationId: 'org-a' });

        // Nem o rastro de auditoria nem a Activity são duplicados na reentrega.
        expect(prismaMock.threeCXCallEvent.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.activity.create).toHaveBeenCalledTimes(1);
    });

    it('nunca adivinha o tenant quando o ramal é ambíguo entre duas organizações — descarta', async () => {
        const { process3CXWebhook } = await import('../threecx.service.js');

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-a' }, { id: 'org-b' }]);
        prismaMock.threeCXConnection.findFirst
            .mockResolvedValueOnce(CONN_ORG_A)
            .mockResolvedValueOnce(CONN_ORG_B);

        const result = await process3CXWebhook(FULL_PAYLOAD);

        expect(result).toEqual({ status: 'discarded', reason: 'ramal-ambiguo' });
        expect(prismaMock.threeCXCallEvent.create).not.toHaveBeenCalled();
        expect(prismaMock.activity.create).not.toHaveBeenCalled();
    });

    it('descarta (não persiste nada) quando nenhuma organização tem esse ramal cadastrado', async () => {
        const { process3CXWebhook } = await import('../threecx.service.js');

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-a' }]);
        prismaMock.threeCXConnection.findFirst.mockResolvedValue(null);

        const result = await process3CXWebhook(FULL_PAYLOAD);

        expect(result).toEqual({ status: 'discarded', reason: 'ramal-desconhecido' });
        expect(prismaMock.threeCXCallEvent.create).not.toHaveBeenCalled();
        expect(prismaMock.activity.create).not.toHaveBeenCalled();
    });

    it('payload mínimo sem número reconhecível grava o rastro de auditoria mas não inventa um lead', async () => {
        const { process3CXWebhook } = await import('../threecx.service.js');

        // Mesmo shape mínimo já coberto por tests/unit/features/integrations/threecx/threecx.routes.test.ts.
        const minimalPayload = { event: 'call.ended', extension: '101', callId: 'call-abc' };

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-a' }]);
        prismaMock.threeCXConnection.findFirst.mockResolvedValue(CONN_ORG_A);
        prismaMock.threeCXCallEvent.findFirst.mockResolvedValue(null);
        prismaMock.threeCXCallEvent.create.mockResolvedValue({});

        const result = await process3CXWebhook(minimalPayload);

        expect(result).toMatchObject({ status: 'processed', organizationId: 'org-a', leadId: null });
        expect(prismaMock.lead.findFirst).not.toHaveBeenCalled();
        expect(prismaMock.activity.create).not.toHaveBeenCalled();
        expect(prismaMock.threeCXCallEvent.create).toHaveBeenCalledTimes(1);
    });

    it('nunca loga o número de telefone completo — só ids (callId/organizationId/leadId/connectionId)', async () => {
        const { process3CXWebhook } = await import('../threecx.service.js');

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-a' }]);
        prismaMock.threeCXConnection.findFirst.mockResolvedValue(CONN_ORG_A);
        prismaMock.threeCXCallEvent.findFirst.mockResolvedValue(null);
        prismaMock.threeCXCallEvent.create.mockResolvedValue({});
        prismaMock.lead.findFirst.mockResolvedValue({
            id: 'lead-1',
            contact: { phone: '5511999998888', whatsapp: null },
        });
        prismaMock.activity.findFirst.mockResolvedValue(null);
        prismaMock.activity.create.mockResolvedValue({});

        await process3CXWebhook(FULL_PAYLOAD);

        const phoneDigits = '5511999998888';
        const allLogCalls = [...loggerMock.info.mock.calls, ...loggerMock.warn.mock.calls, ...loggerMock.error.mock.calls];
        expect(allLogCalls.length).toBeGreaterThan(0);
        for (const call of allLogCalls) {
            const serialized = JSON.stringify(call);
            expect(serialized).not.toContain(phoneDigits);
            expect(serialized).not.toContain('999998888'); // sufixo também não pode vazar
        }
    });
});
