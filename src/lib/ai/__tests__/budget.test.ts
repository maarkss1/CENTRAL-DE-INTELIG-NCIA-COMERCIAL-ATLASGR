import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DEC-09 (dossiê CPI, onda 42, opção B): teto REAL por organização em `assertAiBudgetNotExceeded`
 * (src/lib/ai/budget.ts), além do teto global de plataforma (AI-011) já coberto por
 * src/lib/ai/__tests__/gateway.test.ts (que só faz spy na função inteira, sem exercitar a lógica
 * interna). Este arquivo cobre o CONTRATO da checagem por organização diretamente, sem depender de
 * `Organization.monthlyAiBudgetUsd` existir de verdade no banco (o campo ainda não foi migrado —
 * ver .agents/handoffs/onda-42/03-para-00-campo-orcamento-organization.md) — `prisma` é mockado.
 */

const aggregateMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock('../../prisma.js', () => ({
  prisma: {
    aILog: {
      aggregate: (...args: unknown[]) => aggregateMock(...args),
    },
    organization: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Redis sempre indisponível nestes testes — força cada checagem a passar pelo fallback em memória
// (resetado a cada teste via __resetOrgAiBudgetCacheForTests), sem depender de um Redis real nem
// mascarar o comportamento por trás de um mock de cache "sempre acerta".
vi.mock('../../queue/redis.js', () => ({
  cacheConnection: {
    get: vi.fn().mockRejectedValue(new Error('Redis indisponível (teste)')),
    set: vi.fn().mockRejectedValue(new Error('Redis indisponível (teste)')),
    del: vi.fn().mockResolvedValue(1),
  },
}));

// Teto global de plataforma desligado por padrão nestes testes — isola a checagem por organização
// (env.AI_MONTHLY_BUDGET_USD indefinida = mesmo "sem teto" que a suíte de gateway.test.ts já
// cobre para o caminho global). `vi.hoisted` garante que `mockEnv` exista antes do factory de
// `vi.mock` rodar (vi.mock é hoisted para o topo do arquivo, acima de qualquer `const` comum).
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { AI_MONTHLY_BUDGET_USD: undefined as number | undefined },
}));
vi.mock('../../../config/env.js', () => ({ env: mockEnv }));

import {
  assertAiBudgetNotExceeded,
  AiOrgBudgetExceededError,
  __resetOrgAiBudgetCacheForTests,
} from '../budget.js';
import { requestContext } from '../../async-context.js';

function mockOrgBudget(byOrgId: Record<string, number | null>): void {
  findUniqueMock.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (!(where.id in byOrgId)) return null;
    return { monthlyAiBudgetUsd: byOrgId[where.id] };
  });
}

function mockOrgMonthCost(byOrgId: Record<string, number>): void {
  aggregateMock.mockImplementation(async ({ where }: { where: { organizationId: string } }) => ({
    _sum: { cost: byOrgId[where.organizationId] ?? 0 },
  }));
}

async function runAs<T>(organizationId: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (organizationId === undefined) return fn();
  return requestContext.run({ tenantId: organizationId }, fn);
}

describe('assertAiBudgetNotExceeded — teto por organização (DEC-09)', () => {
  beforeEach(() => {
    __resetOrgAiBudgetCacheForTests();
    aggregateMock.mockReset();
    findUniqueMock.mockReset();
    mockEnv.AI_MONTHLY_BUDGET_USD = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('permite a chamada quando o gasto do mês está abaixo do teto configurado', async () => {
    mockOrgBudget({ 'org-abaixo': 10 });
    mockOrgMonthCost({ 'org-abaixo': 5 });

    await expect(runAs('org-abaixo', () => assertAiBudgetNotExceeded())).resolves.toBeUndefined();
  });

  it('bloqueia a chamada com AiOrgBudgetExceededError (429) quando o gasto do mês atinge o teto', async () => {
    mockOrgBudget({ 'org-no-teto': 10 });
    mockOrgMonthCost({ 'org-no-teto': 10 });

    await expect(runAs('org-no-teto', () => assertAiBudgetNotExceeded())).rejects.toBeInstanceOf(
      AiOrgBudgetExceededError,
    );
  });

  it('bloqueia a chamada quando o gasto do mês excede o teto', async () => {
    mockOrgBudget({ 'org-excedeu': 10 });
    mockOrgMonthCost({ 'org-excedeu': 25 });

    const error = await runAs('org-excedeu', () => assertAiBudgetNotExceeded()).catch((e) => e);
    expect(error).toBeInstanceOf(AiOrgBudgetExceededError);
    expect((error as AiOrgBudgetExceededError).statusCode).toBe(429);
    expect((error as AiOrgBudgetExceededError).monthCostUsd).toBe(25);
    expect((error as AiOrgBudgetExceededError).budgetUsd).toBe(10);
    expect(error.message).toContain('Orçamento mensal de IA desta organização foi atingido');
  });

  it('organização sem teto configurado (monthlyAiBudgetUsd null) nunca bloqueia, mesmo com gasto alto', async () => {
    mockOrgBudget({ 'org-sem-teto': null });
    mockOrgMonthCost({ 'org-sem-teto': 999_999 });

    await expect(runAs('org-sem-teto', () => assertAiBudgetNotExceeded())).resolves.toBeUndefined();
  });

  it('sem organização conhecida no requestContext (worker/script), nunca bloqueia e nem consulta o banco', async () => {
    await expect(assertAiBudgetNotExceeded()).resolves.toBeUndefined();
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it('escopa a leitura de gasto pela organização certa — não vaza custo de outro tenant', async () => {
    mockOrgBudget({ 'org-a': 10, 'org-b': 10 });
    // org-a estourou o teto (custo 50), org-b está bem abaixo (custo 1) — se a checagem
    // vazasse o custo de uma organização para a outra, org-b também seria bloqueada.
    mockOrgMonthCost({ 'org-a': 50, 'org-b': 1 });

    await expect(runAs('org-a', () => assertAiBudgetNotExceeded())).rejects.toBeInstanceOf(
      AiOrgBudgetExceededError,
    );
    await expect(runAs('org-b', () => assertAiBudgetNotExceeded())).resolves.toBeUndefined();

    expect(aggregateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
    expect(aggregateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-b' }),
      }),
    );
  });

  it('escopa a leitura de gasto pelo mês corrente — nunca soma createdAt de antes do início do mês', async () => {
    mockOrgBudget({ 'org-mes': 10 });
    mockOrgMonthCost({ 'org-mes': 1 });

    await runAs('org-mes', () => assertAiBudgetNotExceeded());

    expect(aggregateMock).toHaveBeenCalledTimes(1);
    const [args] = aggregateMock.mock.calls[0] as [{ where: { createdAt: { gte: Date } } }];
    const gte = args.where.createdAt.gte;

    const now = new Date();
    expect(gte.getFullYear()).toBe(now.getFullYear());
    expect(gte.getMonth()).toBe(now.getMonth());
    expect(gte.getDate()).toBe(1);
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
    expect(gte.getSeconds()).toBe(0);
  });

  it('consulta o teto usando o id da organização certo, via prisma.organization.findUnique', async () => {
    mockOrgBudget({ 'org-consulta': 5 });
    mockOrgMonthCost({ 'org-consulta': 1 });

    await runAs('org-consulta', () => assertAiBudgetNotExceeded());

    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org-consulta' },
      }),
    );
  });
});
