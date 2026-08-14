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

beforeEach(() => {
    vi.clearAllMocks();
    assertSafeWebhookUrlMock.mockResolvedValue(undefined);
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
