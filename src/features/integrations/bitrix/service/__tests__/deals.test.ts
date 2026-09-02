import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const auditServiceMock = { log: vi.fn() };
vi.mock('@/lib/audit/audit.service', () => ({ AuditService: auditServiceMock }));

const prismaMock = {
  lead: { findFirst: vi.fn(), create: vi.fn() },
  company: { create: vi.fn() },
  contact: { create: vi.fn() },
  user: { findFirst: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const clientMock = {
  callBitrix: vi.fn(),
  getStatusLabels: vi.fn(),
  getConnectionWebhookUrl: vi.fn(),
};
vi.mock('../client.js', () => clientMock);

vi.mock('../customFields.js', () => ({
  resolveEnumMaps: vi.fn().mockResolvedValue(new Map()),
  applyInboundCustomFields: vi
    .fn()
    .mockReturnValue({ qualification: {}, leadFields: {}, contactRole: null }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clientMock.getConnectionWebhookUrl.mockResolvedValue(
    'https://portal.bitrix24.com.br/rest/1/token/',
  );
});

/**
 * Cobre a correção de .agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md:
 * Lead.owner precisa gravar o User.id do responsável (casado por e-mail via ASSIGNED_BY_ID),
 * nunca o User.name — o nome quebrava requireLeadOwnership (RBAC) e duplicava vendedores no
 * ranking de BI por owner.
 */
describe('importSelectedBitrixDeals — owner grava User.id, não User.name (Onda 10)', () => {
  it('resolve ASSIGNED_BY_ID -> e-mail do usuário Bitrix -> User.id do Atlas e grava esse id em Lead.owner', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(null); // não existe ainda / sem conflito de posse (sem phone/email)
    prismaMock.user.findFirst.mockResolvedValue({ id: 'user-cuid-ana' }); // resolveAtlasUserIdByEmail
    prismaMock.company.create.mockResolvedValue({ id: 'company-1' });
    prismaMock.lead.create.mockResolvedValue({ id: 'lead-1' });

    clientMock.callBitrix.mockImplementation(async (_url: string, method: string) => {
      if (method === 'user.get') {
        return {
          result: [{ ID: '7', NAME: 'Ana', LAST_NAME: 'Souza', EMAIL: 'ana@atlasgr.com.br' }],
        };
      }
      if (method === 'crm.deal.get') {
        return { result: { ID: '99', TITLE: 'Negócio Ana', ASSIGNED_BY_ID: '7' } };
      }
      throw new Error(`método Bitrix inesperado neste teste: ${method}`);
    });

    const { importSelectedBitrixDeals } = await import('../deals.js');
    const result = await importSelectedBitrixDeals('org-1', 'conn-1', ['99']);

    expect(result).toEqual({
      imported: 1,
      skipped: 0,
      skippedConflicts: 0,
      skippedNotOwned: 0,
      failed: 0,
      importedLeadIds: ['lead-1'],
    });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          email: { equals: 'ana@atlasgr.com.br', mode: 'insensitive' },
        },
      }),
    );
    expect(prismaMock.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ owner: 'user-cuid-ana' }),
      }),
    );
    // Nunca o nome — essa era exatamente a convenção quebrada que este teste protege contra regressão.
    const createdData = prismaMock.lead.create.mock.calls[0][0].data;
    expect(createdData.owner).not.toBe('Ana Souza');
  });

  it('sem correspondência de e-mail no Atlas, importa o negócio sem responsável (owner null) — nunca fabrica um vínculo', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(null); // nenhum usuário Atlas com esse e-mail
    prismaMock.company.create.mockResolvedValue({ id: 'company-1' });
    prismaMock.lead.create.mockResolvedValue({ id: 'lead-2' });

    clientMock.callBitrix.mockImplementation(async (_url: string, method: string) => {
      if (method === 'user.get') {
        return { result: [{ ID: '8', NAME: 'Carla', EMAIL: 'carla@bitrix-externo.com' }] };
      }
      if (method === 'crm.deal.get') {
        return { result: { ID: '100', TITLE: 'Negócio Carla', ASSIGNED_BY_ID: '8' } };
      }
      throw new Error(`método Bitrix inesperado neste teste: ${method}`);
    });

    const { importSelectedBitrixDeals } = await import('../deals.js');
    const result = await importSelectedBitrixDeals('org-1', 'conn-1', ['100']);

    expect(result.imported).toBe(1);
    expect(prismaMock.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ owner: null }) }),
    );
  });
});

describe('importSelectedBitrixDeals — falha de item não derruba o lote inteiro (achado corrigido: auditoria da plataforma)', () => {
  it('conta um erro não-P2002 como "failed" em vez de rejeitar a promise e descartar os contadores já coletados', async () => {
    prismaMock.lead.findFirst.mockResolvedValue(null);
    prismaMock.company.create.mockResolvedValue({ id: 'company-1' });
    prismaMock.lead.create.mockRejectedValue(new Error('Falha de conexão com o banco'));

    clientMock.callBitrix.mockImplementation(async (_url: string, method: string) => {
      if (method === 'crm.deal.get') {
        return { result: { ID: '101', TITLE: 'Negócio com erro' } };
      }
      throw new Error(`método Bitrix inesperado neste teste: ${method}`);
    });

    const { importSelectedBitrixDeals } = await import('../deals.js');
    const result = await importSelectedBitrixDeals('org-1', 'conn-1', ['101']);

    expect(result).toEqual({
      imported: 0,
      skipped: 0,
      skippedConflicts: 0,
      skippedNotOwned: 0,
      failed: 1,
      importedLeadIds: [],
    });
  });
});
