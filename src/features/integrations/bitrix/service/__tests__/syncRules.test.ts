import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const prismaMock = {
    organization: { findMany: vi.fn() },
    bitrixSyncRule: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    bitrixConnection: { findFirst: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../leads.js', () => ({
    listBitrixLeads: vi.fn(),
    importSelectedBitrixLeads: vi.fn(),
}));
vi.mock('../deals.js', () => ({
    listBitrixDeals: vi.fn(),
    importSelectedBitrixDeals: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('runBitrixSyncTick — bloqueador #11 (sincronização não pode falhar silenciosamente)', () => {
    it('atualiza lastRunAt MESMO quando a regra falha — antes desta correção, uma regra sempre falhando nunca marcava lastRunAt e a UI mentia "Ainda não rodou" para sempre', async () => {
        const { listBitrixLeads } = await import('../leads.js');
        vi.mocked(listBitrixLeads).mockRejectedValue(new Error('webhook desconectado'));

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
        prismaMock.bitrixSyncRule.findMany.mockResolvedValue([
            { id: 'rule-1', connectionId: 'conn-1', source: 'lead', categoryId: null, stageId: null, assignedById: null },
        ]);
        prismaMock.bitrixSyncRule.update.mockResolvedValue({});

        const { runBitrixSyncTick } = await import('../syncRules.js');
        const result = await runBitrixSyncTick();

        expect(result.rulesFailed).toBe(1);
        expect(result.totalImported).toBe(0);
        expect(prismaMock.bitrixSyncRule.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'rule-1' }, data: expect.objectContaining({ lastRunAt: expect.any(Date) }) }),
        );
        // A falha NÃO deve zerar lastImportedCount (representa a última importação bem-sucedida, não a última tentativa).
        const failureUpdateCall = prismaMock.bitrixSyncRule.update.mock.calls.find((c) => !('lastImportedCount' in c[0].data));
        expect(failureUpdateCall).toBeDefined();
    });

    it('uma regra com falha não impede as demais regras/organizações de rodar', async () => {
        const { listBitrixLeads, importSelectedBitrixLeads } = await import('../leads.js');
        vi.mocked(listBitrixLeads)
            .mockRejectedValueOnce(new Error('falha na regra 1'))
            .mockResolvedValueOnce({ leads: [{ id: 'L1', alreadyImported: false }] as never, next: null, total: 1 });
        vi.mocked(importSelectedBitrixLeads).mockResolvedValue({ imported: 1, skipped: 0 });

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
        prismaMock.bitrixSyncRule.findMany.mockResolvedValue([
            { id: 'rule-fail', connectionId: 'conn-1', source: 'lead', categoryId: null, stageId: null, assignedById: null },
            { id: 'rule-ok', connectionId: 'conn-1', source: 'lead', categoryId: null, stageId: null, assignedById: null },
        ]);
        prismaMock.bitrixSyncRule.update.mockResolvedValue({});

        const { runBitrixSyncTick } = await import('../syncRules.js');
        const result = await runBitrixSyncTick();

        expect(result.rulesFailed).toBe(1);
        expect(result.totalImported).toBe(1);
    });

    it('organização sem nenhuma regra ativa não é contada em organizationsProcessed', async () => {
        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
        prismaMock.bitrixSyncRule.findMany.mockResolvedValue([]);

        const { runBitrixSyncTick } = await import('../syncRules.js');
        const result = await runBitrixSyncTick();

        expect(result.organizationsProcessed).toBe(0);
        expect(result.rulesFailed).toBe(0);
    });
});

describe('createSyncRule — isolamento de tenant', () => {
    it('rejeita criar regra apontando pra uma conexão de OUTRA organização', async () => {
        prismaMock.bitrixConnection.findFirst.mockResolvedValue(null); // não achou (porque o findFirst já filtra por organizationId)

        const { createSyncRule } = await import('../syncRules.js');

        await expect(createSyncRule('org-vitima', {
            connectionId: 'conn-de-outra-org',
            source: 'lead',
        })).rejects.toThrow(/não encontrada/i);
    });

    it('exige categoryId quando source="deal"', async () => {
        const { createSyncRule } = await import('../syncRules.js');

        await expect(createSyncRule('org-1', { connectionId: 'conn-1', source: 'deal' })).rejects.toThrow(/pipeline/i);
    });
});
