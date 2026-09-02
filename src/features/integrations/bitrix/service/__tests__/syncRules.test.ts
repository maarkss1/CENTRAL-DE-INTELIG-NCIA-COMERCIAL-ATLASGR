import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitrixSyncFailuresTotal } from '../metrics.js';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const prismaMock = {
  organization: { findMany: vi.fn() },
  bitrixSyncRule: {
    findMany: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  bitrixConnection: { findFirst: vi.fn() },
  bitrixSyncLog: { create: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const auditServiceMock = { log: vi.fn() };
vi.mock('@/lib/audit/audit.service', () => ({ AuditService: auditServiceMock }));

vi.mock('../leads.js', () => ({
  findUnimportedBitrixLeadIds: vi.fn(),
  importSelectedBitrixLeads: vi.fn(),
}));
vi.mock('../deals.js', () => ({
  findUnimportedBitrixDealIds: vi.fn(),
  importSelectedBitrixDeals: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  bitrixSyncFailuresTotal.reset();
  prismaMock.bitrixSyncLog.create.mockResolvedValue({});
});

describe('runBitrixSyncTick — bloqueador #11 (sincronização não pode falhar silenciosamente)', () => {
  it('atualiza lastRunAt E lastError MESMO quando a regra falha — antes desta correção, uma regra sempre falhando nunca marcava lastRunAt e a UI mentia "Ainda não rodou" para sempre', async () => {
    const { findUnimportedBitrixLeadIds } = await import('../leads.js');
    vi.mocked(findUnimportedBitrixLeadIds).mockRejectedValue(new Error('webhook desconectado'));

    prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    prismaMock.bitrixSyncRule.findMany.mockResolvedValue([
      {
        id: 'rule-1',
        connectionId: 'conn-1',
        source: 'lead',
        categoryId: null,
        stageId: null,
        assignedById: null,
      },
    ]);
    prismaMock.bitrixSyncRule.update.mockResolvedValue({});

    const { runBitrixSyncTick } = await import('../syncRules.js');
    const result = await runBitrixSyncTick();

    expect(result.rulesFailed).toBe(1);
    expect(result.totalImported).toBe(0);
    expect(prismaMock.bitrixSyncRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rule-1' },
        data: expect.objectContaining({
          lastRunAt: expect.any(Date),
          lastError: 'webhook desconectado',
        }),
      }),
    );
    // A falha NÃO deve zerar lastImportedCount (representa a última importação bem-sucedida, não a última tentativa).
    const failureUpdateCall = prismaMock.bitrixSyncRule.update.mock.calls.find(
      (c) => !('lastImportedCount' in c[0].data),
    );
    expect(failureUpdateCall).toBeDefined();
    // A falha também precisa ficar rastreável em BitrixSyncLog, não só no campo lastError da regra.
    expect(prismaMock.bitrixSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorMessage: 'webhook desconectado' }),
      }),
    );

    // Handoff 10-para-06 (bloqueador #11): a falha de regra também precisa incrementar o
    // Counter Prometheus consumido pelo alerta BitrixSyncFailuresHigh.
    const metric = await bitrixSyncFailuresTotal.get();
    const point = metric.values.find(
      (v) => v.labels.tenant === 'org-1' && v.labels.entity === 'lead',
    );
    expect(point?.value).toBe(1);
  });

  it('uma regra com falha não impede as demais regras/organizações de rodar', async () => {
    const { findUnimportedBitrixLeadIds, importSelectedBitrixLeads } = await import('../leads.js');
    vi.mocked(findUnimportedBitrixLeadIds)
      .mockRejectedValueOnce(new Error('falha na regra 1'))
      .mockResolvedValueOnce({ ids: ['L1'], pagesExhausted: true, pagesScanned: 1 });
    vi.mocked(importSelectedBitrixLeads).mockResolvedValue({
      imported: 1,
      skipped: 0,
      skippedConflicts: 0,
      skippedNotOwned: 0,
      failed: 0,
      importedLeadIds: ['lead-1'],
    });

    prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    prismaMock.bitrixSyncRule.findMany.mockResolvedValue([
      {
        id: 'rule-fail',
        connectionId: 'conn-1',
        source: 'lead',
        categoryId: null,
        stageId: null,
        assignedById: null,
      },
      {
        id: 'rule-ok',
        connectionId: 'conn-1',
        source: 'lead',
        categoryId: null,
        stageId: null,
        assignedById: null,
      },
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

  it('P0-2 CORRIGIDO: uma regra bem-sucedida cuja varredura precisou de mais de uma página ainda assim conta como sucesso e limpa lastError de uma falha anterior', async () => {
    const { findUnimportedBitrixLeadIds, importSelectedBitrixLeads } = await import('../leads.js');
    // pagesScanned=3 simula que a página 0 e 1 estavam inteiramente já importadas e só a
    // página 2 tinha um registro novo — exatamente o cenário que o antigo `start=0` fixo
    // nunca alcançava.
    vi.mocked(findUnimportedBitrixLeadIds).mockResolvedValue({
      ids: ['L99'],
      pagesExhausted: true,
      pagesScanned: 3,
    });
    vi.mocked(importSelectedBitrixLeads).mockResolvedValue({
      imported: 1,
      skipped: 0,
      skippedConflicts: 0,
      skippedNotOwned: 0,
      failed: 0,
      importedLeadIds: ['lead-1'],
    });

    prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    prismaMock.bitrixSyncRule.findMany.mockResolvedValue([
      {
        id: 'rule-1',
        connectionId: 'conn-1',
        source: 'lead',
        categoryId: null,
        stageId: null,
        assignedById: null,
      },
    ]);
    prismaMock.bitrixSyncRule.update.mockResolvedValue({});

    const { runBitrixSyncTick } = await import('../syncRules.js');
    const result = await runBitrixSyncTick();

    expect(result.totalImported).toBe(1);
    expect(result.rulesFailed).toBe(0);
    expect(prismaMock.bitrixSyncRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastImportedCount: 1, lastError: null }),
      }),
    );
    expect(prismaMock.bitrixSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'success', errorMessage: null }),
      }),
    );
  });
});

describe('createSyncRule — isolamento de tenant', () => {
  it('rejeita criar regra apontando pra uma conexão de OUTRA organização', async () => {
    prismaMock.bitrixConnection.findFirst.mockResolvedValue(null); // não achou (porque o findFirst já filtra por organizationId)

    const { createSyncRule } = await import('../syncRules.js');

    await expect(
      createSyncRule('org-vitima', {
        connectionId: 'conn-de-outra-org',
        source: 'lead',
      }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it('exige categoryId quando source="deal"', async () => {
    const { createSyncRule } = await import('../syncRules.js');

    await expect(
      createSyncRule('org-1', { connectionId: 'conn-1', source: 'deal' }),
    ).rejects.toThrow(/pipeline/i);
  });
});
