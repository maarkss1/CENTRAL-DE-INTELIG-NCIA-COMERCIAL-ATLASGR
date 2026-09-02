import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão de um bug P1 real: o Prisma Client devolve/exige a CHAVE do enum CompanyStatus
 * ("Em_analise"), não o valor mapeado via @map exibido na UI/validado pelo Zod ("Em análise") —
 * já corrigido para Company aninhada em Lead (PrismaLeadRepository), mas nunca aplicado aqui, no
 * CRUD direto de Company usado pela tela Empresas.
 */
const prismaMock = {
  company: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('../../../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../../../config/env', () => ({ env: { ENABLE_SEARCH: false } }));

const { PrismaCompanyRepository } = await import('../PrismaCompanyRepository');

afterEach(() => {
  vi.clearAllMocks();
});

describe('PrismaCompanyRepository — conversão de status "Em análise"', () => {
  it('create: converte "Em análise" (validado pelo Zod) para a chave do enum Prisma antes de gravar, e devolve o valor exibido', async () => {
    prismaMock.company.create.mockResolvedValue({ id: 'c1', status: 'Em_analise' });
    const repo = new PrismaCompanyRepository();

    const result = await repo.create('org-1', {
      status: 'Em análise',
      tradeName: 'Empresa Teste',
    } as never);

    expect(prismaMock.company.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'Em_analise' }),
    });
    expect(result.status).toBe('Em análise');
  });

  it('findById: converte a chave crua do Prisma ("Em_analise") de volta para "Em análise" na leitura', async () => {
    prismaMock.company.findFirst.mockResolvedValue({ id: 'c1', status: 'Em_analise' });
    const repo = new PrismaCompanyRepository();

    const result = await repo.findById('org-1', 'c1');

    expect(result?.status).toBe('Em análise');
  });

  it('findAllWithFilters: converte o status de cada item da lista', async () => {
    prismaMock.$transaction.mockResolvedValue([[{ id: 'c1', status: 'Em_analise' }], 1]);
    const repo = new PrismaCompanyRepository();

    const result = await repo.findAllWithFilters('org-1');

    expect(result.data[0]?.status).toBe('Em análise');
  });

  it('update: converte "Em análise" para a chave do Prisma antes de atualizar', async () => {
    prismaMock.company.findFirst.mockResolvedValue({ id: 'c1', status: 'Ativo' });
    prismaMock.company.update.mockResolvedValue({ id: 'c1', status: 'Em_analise' });
    const repo = new PrismaCompanyRepository();

    const result = await repo.update('org-1', 'c1', { status: 'Em análise' } as never);

    expect(prismaMock.company.update).toHaveBeenCalledWith({
      where: { id: 'c1', organizationId: 'org-1' },
      data: expect.objectContaining({ status: 'Em_analise' }),
    });
    expect(result.status).toBe('Em análise');
  });

  it('status "Ativo"/"Inativo" (sem divergência de @map) continua funcionando normalmente', async () => {
    prismaMock.company.create.mockResolvedValue({ id: 'c2', status: 'Ativo' });
    const repo = new PrismaCompanyRepository();

    const result = await repo.create('org-1', { status: 'Ativo' } as never);

    expect(prismaMock.company.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'Ativo' }),
    });
    expect(result.status).toBe('Ativo');
  });
});
