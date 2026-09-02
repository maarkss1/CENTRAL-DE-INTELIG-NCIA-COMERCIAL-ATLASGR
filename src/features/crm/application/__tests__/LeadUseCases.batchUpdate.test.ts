import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão de um bug P1/P2 real: um erro real (não capturado) no update de um item do lote
 * propagava sem ser pega e derrubava batchUpdateLeads inteiro — os itens já atualizados nas
 * iterações anteriores continuavam persistidos no banco, mas o caller (CrmBoard.tsx) recebia um
 * erro genérico em vez do resultado real, sem saber quantos já tinham sido aplicados. Também
 * cobre o achado irmão: o frontend usava selectedLeadIds.size (contagem solicitada) no toast em
 * vez de updatedCount (contagem real).
 */
const prismaMock = {
  lead: { findMany: vi.fn(), update: vi.fn() },
  leadStageHistory: { create: vi.fn() },
};
vi.mock('../../../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { LeadUseCases } = await import('../LeadUseCases');

afterEach(() => {
  vi.clearAllMocks();
});

describe('LeadUseCases.batchUpdateLeads — item falho não derruba o lote inteiro', () => {
  it('conta um item com erro real em failedCount em vez de lançar e perder o progresso já feito', async () => {
    prismaMock.lead.findMany.mockResolvedValue([
      { id: 'lead-1', status: 'Lead_Recebido', customFields: null, owner: null },
      { id: 'lead-2', status: 'Lead_Recebido', customFields: null, owner: null },
    ]);
    prismaMock.lead.update
      .mockResolvedValueOnce({}) // lead-1: sucesso
      .mockRejectedValueOnce(new Error('Falha de conexão com o banco')); // lead-2: falha real
    prismaMock.leadStageHistory.create.mockResolvedValue({});

    const useCases = new LeadUseCases({} as never);
    const result = await useCases.batchUpdateLeads('org-1', ['lead-1', 'lead-2'], {
      status: 'Qualificacao_SDR',
    });

    expect(result).toEqual({ updatedCount: 1, total: 2, failedCount: 1 });
  });

  it('sem erros, updatedCount bate com o total processado e failedCount é zero', async () => {
    prismaMock.lead.findMany.mockResolvedValue([
      { id: 'lead-1', status: 'Lead_Recebido', customFields: null, owner: null },
      { id: 'lead-2', status: 'Lead_Recebido', customFields: null, owner: null },
    ]);
    prismaMock.lead.update.mockResolvedValue({});
    prismaMock.leadStageHistory.create.mockResolvedValue({});

    const useCases = new LeadUseCases({} as never);
    const result = await useCases.batchUpdateLeads('org-1', ['lead-1', 'lead-2'], {
      status: 'Qualificacao_SDR',
    });

    expect(result).toEqual({ updatedCount: 2, total: 2, failedCount: 0 });
  });
});
