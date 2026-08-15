import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cobre o handoff .agents/handoffs/onda-1/06-para-01-persistencia-3cx.md: antes desta mudança,
// threecx.service.ts guardava conexões num `Map` em memória (perdido a cada restart/redeploy,
// inconsistente entre instâncias). Estes testes provam que a leitura/escrita passa 100% pelo
// Prisma (nenhum estado em memória module-level sobrevive entre chamadas) e que a operação nunca
// vaza/apaga dado de outra organização.
const prismaMock = {
    threeCXConnection: {
        findMany: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
    },
    activity: {
        create: vi.fn(),
    },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const assertSafeWebhookUrlMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/adapters/crm/Bitrix24Adapter.js', () => ({
    assertSafeWebhookUrl: assertSafeWebhookUrlMock,
}));

const isSuppressedMock = vi.fn().mockResolvedValue(false);
vi.mock('@/features/integrations/birth-voice/callSuppression.service', () => ({
    isSuppressed: (...args: unknown[]) => isSuppressedMock(...args),
}));

beforeEach(() => {
    vi.clearAllMocks();
    assertSafeWebhookUrlMock.mockResolvedValue(undefined);
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

    it('valida a URL contra SSRF (assertSafeWebhookUrl) antes de persistir', async () => {
        const { connect3CX } = await import('../threecx.service.js');
        assertSafeWebhookUrlMock.mockRejectedValueOnce(new Error('Endereço de webhook não permitido (IP privado/reservado).'));
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
        expect(isSuppressedMock).toHaveBeenCalledWith('org-a', '11999998888', { leadId: null });

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
        expect(isSuppressedMock).toHaveBeenCalledWith('org-a', '11999998888', { leadId: 'lead-1' });

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
});
