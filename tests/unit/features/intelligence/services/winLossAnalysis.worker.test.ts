import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bug de segurança real corrigido: a versão anterior de `runWinLossAnalysis` (então inline no
// processor do Worker) fazia UMA query sem `organizationId`, misturando leads de TODAS as
// organizações no mesmo prompt de IA — vazamento cross-tenant. Esta suíte prova que agora cada
// organização gera sua própria análise, isolada, e que nenhuma chamada de leitura de leads
// acontece sem `organizationId` no filtro.

const organizationFindMany = vi.fn();
const leadFindMany = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
  prisma: {
    organization: { findMany: (...args: unknown[]) => organizationFindMany(...args) },
    lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
  },
}));

const invoke = vi.fn();
vi.mock('../../../../../src/lib/ai/gateway.js', () => ({
  getAiModel: () => ({ invoke: (...args: unknown[]) => invoke(...args) }),
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { requestContext } = await import('../../../../../src/lib/async-context.js');
const { runWinLossAnalysis } = await import(
  '../../../../../src/features/intelligence/services/winLossAnalysis.worker.js'
);

function lead(id: string) {
  return { id, status: 'Negocios_Ganhos', whatsAppMessages: [], timeline: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  organizationFindMany.mockResolvedValue([{ id: 'org-a' }, { id: 'org-b' }]);
  leadFindMany.mockResolvedValue([]);
  invoke.mockResolvedValue({ content: 'análise' });
});

describe('runWinLossAnalysis', () => {
  it('roda uma análise por organização, nunca misturando leads de organizações diferentes', async () => {
    leadFindMany.mockImplementation(({ where }: { where: { organizationId: string } }) => {
      return Promise.resolve(
        where.organizationId === 'org-a' ? [lead('lead-a1'), lead('lead-a2')] : [lead('lead-b1')],
      );
    });

    const result = await runWinLossAnalysis();

    expect(leadFindMany).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { organizationId: 'org-a', analysis: 'análise', leadsAnalyzed: 2 },
      { organizationId: 'org-b', analysis: 'análise', leadsAnalyzed: 1 },
    ]);
  });

  it('toda chamada de leitura de leads inclui organizationId no filtro (nunca uma query global)', async () => {
    leadFindMany.mockResolvedValue([lead('lead-1')]);

    await runWinLossAnalysis();

    for (const call of leadFindMany.mock.calls) {
      const where = call[0].where;
      expect(where.organizationId).toBeTruthy();
    }
  });

  it('roda cada organização dentro do próprio contexto de tenant (requestContext)', async () => {
    const seenTenants: Array<string | undefined> = [];
    leadFindMany.mockImplementation(() => {
      seenTenants.push(requestContext.getStore()?.tenantId);
      return Promise.resolve([]);
    });

    await runWinLossAnalysis();

    expect(seenTenants).toEqual(['org-a', 'org-b']);
  });

  it('usa os mesmos 4 status do disparo manual, incluindo Negocios_Ganhos', async () => {
    await runWinLossAnalysis();

    const statusFilter = leadFindMany.mock.calls[0][0].where.status.in;
    expect(statusFilter).toEqual([
      'Convertido_em_Oportunidade',
      'Lead_Desqualificado',
      'Negocios_Perdidos',
      'Negocios_Ganhos',
    ]);
  });

  it('pula organizações sem leads no período (não chama a IA nem entra no resultado)', async () => {
    leadFindMany.mockResolvedValue([]);

    const result = await runWinLossAnalysis();

    expect(invoke).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('uma falha de IA numa organização não impede a análise das demais', async () => {
    leadFindMany.mockResolvedValue([lead('lead-1')]);
    invoke.mockRejectedValueOnce(new Error('modelo indisponível')).mockResolvedValueOnce({
      content: 'análise ok',
    });

    const result = await runWinLossAnalysis();

    expect(result).toEqual([{ organizationId: 'org-b', analysis: 'análise ok', leadsAnalyzed: 1 }]);
  });
});
