import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  bitrixSyncLog: { findMany: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

// Backing real da tela "Webhooks & Monitor" (ver WebhookMonitor.tsx e o comentário de topo de
// syncLogs.ts para o achado real da Onda 1: o componente antes fabricava dado fictício em vez de
// consumir isto). O requisito não-negociável aqui é tenancy: nunca ler BitrixSyncLog sem
// organizationId no WHERE — este arquivo prova isso, não só a "feliz".
describe('listRecentBitrixSyncLogs — isolamento de tenant (bloqueador tenancy de /AGENTS.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.bitrixSyncLog.findMany.mockResolvedValue([]);
  });

  it('sempre filtra por organizationId no WHERE', async () => {
    const { listRecentBitrixSyncLogs } = await import('../syncLogs.js');
    await listRecentBitrixSyncLogs('org-1');
    expect(prismaMock.bitrixSyncLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1' },
      }),
    );
  });

  it('ordena do mais recente para o mais antigo', async () => {
    const { listRecentBitrixSyncLogs } = await import('../syncLogs.js');
    await listRecentBitrixSyncLogs('org-1');
    expect(prismaMock.bitrixSyncLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('limita "take" ao teto de 200 mesmo se um valor maior for pedido', async () => {
    const { listRecentBitrixSyncLogs } = await import('../syncLogs.js');
    await listRecentBitrixSyncLogs('org-1', 99999);
    expect(prismaMock.bitrixSyncLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it('usa um mínimo de 1 mesmo com "take" inválido/negativo', async () => {
    const { listRecentBitrixSyncLogs } = await import('../syncLogs.js');
    await listRecentBitrixSyncLogs('org-1', -5);
    expect(prismaMock.bitrixSyncLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it('nunca seleciona campos fora do necessário (sem vazar dado de outra tabela via include implícito)', async () => {
    const { listRecentBitrixSyncLogs } = await import('../syncLogs.js');
    await listRecentBitrixSyncLogs('org-1');
    const call = prismaMock.bitrixSyncLog.findMany.mock.calls[0][0];
    expect(call.select).toEqual({
      id: true,
      connectionId: true,
      direction: true,
      entityType: true,
      leadId: true,
      bitrixRecordId: true,
      status: true,
      errorMessage: true,
      correlationId: true,
      createdAt: true,
    });
  });
});
