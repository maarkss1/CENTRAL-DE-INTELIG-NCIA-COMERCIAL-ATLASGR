import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão de um bug P1 real: o fallback de resolução de identidade por nome (quando não há
 * CNPJ confiável) não filtrava `deletedAt: null`, diferente do path de CNPJ (que inclui
 * deletados de propósito documentado). Isso podia reabrir/reanexar uma empresa soft-deletada só
 * por coincidência de nome fantasia — o Lead novo criado em cima dela ficava órfão, porque
 * enrichmentCascade.service.ts filtra deletedAt: null e trataria a empresa como inexistente.
 */
const prismaMock = {
  company: { findFirst: vi.fn(), findUnique: vi.fn() },
};

vi.mock('../../../../lib/prisma.js', () => ({
  prisma: prismaMock,
  withRlsContext: vi.fn(),
}));

const { resolveCompanyIdentity } = await import('../companyIdentity.service');

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveCompanyIdentity — fallback por nome não reabre empresa soft-deletada', () => {
  it('filtra deletedAt: null na query de fallback por nome (sem CNPJ informado)', async () => {
    prismaMock.company.findFirst.mockResolvedValue(null);

    await resolveCompanyIdentity({
      organizationId: 'org-1',
      tradeName: 'Acme Ltda',
    });

    expect(prismaMock.company.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId: 'org-1', deletedAt: null }),
    });
  });

  it('continua encontrando normalmente uma empresa ativa (não deletada) por nome', async () => {
    const activeCompany = { id: 'c1', tradeName: 'Acme Ltda', deletedAt: null };
    prismaMock.company.findFirst.mockResolvedValue(activeCompany);

    const result = await resolveCompanyIdentity({
      organizationId: 'org-1',
      tradeName: 'Acme Ltda',
    });

    expect(result).toEqual({ company: activeCompany, method: 'name-heuristic' });
  });
});
