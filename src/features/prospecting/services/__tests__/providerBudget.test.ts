import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DEC-09 (dossiê CPI, onda 42, opção B): teto REAL por organização para providers de prospecção
 * pagos (Apollo/Hunter) — src/features/prospecting/services/providerBudget.ts. Cobre o CONTRATO
 * público (`recordProspectingProviderSpend`, `getOrgMonthProspectingCostUsd`,
 * `assertProspectingBudgetNotExceeded`) tanto no caminho Redis quanto no fallback em memória, sem
 * depender de `Organization.monthlyProspectingBudgetUsd` existir de verdade no banco (o campo
 * ainda não foi migrado — ver .agents/handoffs/onda-42/03-para-00-campo-orcamento-organization.md)
 * — `prisma` é mockado.
 */

const findUniqueMock = vi.fn();
vi.mock('../../../../lib/prisma.js', () => ({
  prisma: {
    organization: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let redisConfiguredValue = false;
const cacheGet = vi.fn();
const cacheIncrByFloat = vi.fn();
const cacheExpire = vi.fn();
vi.mock('../../../../lib/queue/redis.js', () => ({
  get redisConfigured() {
    return redisConfiguredValue;
  },
  cacheConnection: {
    get: (...args: unknown[]) => cacheGet(...args),
    incrbyfloat: (...args: unknown[]) => cacheIncrByFloat(...args),
    expire: (...args: unknown[]) => cacheExpire(...args),
  },
}));

import {
  recordProspectingProviderSpend,
  getOrgMonthProspectingCostUsd,
  assertProspectingBudgetNotExceeded,
  ProspectingBudgetExceededError,
  __resetProspectingBudgetForTests,
} from '../providerBudget.js';
import { requestContext } from '../../../../lib/async-context.js';

function mockOrgBudget(byOrgId: Record<string, number | null>): void {
  findUniqueMock.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (!(where.id in byOrgId)) return null;
    return { monthlyProspectingBudgetUsd: byOrgId[where.id] };
  });
}

async function runAs<T>(organizationId: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (organizationId === undefined) return fn();
  return requestContext.run({ tenantId: organizationId }, fn);
}

describe('providerBudget — teto por organização de prospecção (DEC-09)', () => {
  beforeEach(() => {
    __resetProspectingBudgetForTests();
    findUniqueMock.mockReset();
    cacheGet.mockReset();
    cacheIncrByFloat.mockReset();
    cacheExpire.mockReset();
    redisConfiguredValue = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('fallback em memória (Redis não configurado)', () => {
    it('permite a chamada quando o gasto acumulado do mês está abaixo do teto', async () => {
      mockOrgBudget({ 'org-abaixo': 10 });
      await recordProspectingProviderSpend('apollo', 5, 'org-abaixo');

      await expect(
        runAs('org-abaixo', () => assertProspectingBudgetNotExceeded('apollo')),
      ).resolves.toBeUndefined();
    });

    it('bloqueia com ProspectingBudgetExceededError (429) quando o gasto acumulado atinge o teto', async () => {
      mockOrgBudget({ 'org-no-teto': 10 });
      await recordProspectingProviderSpend('apollo', 6, 'org-no-teto');
      await recordProspectingProviderSpend('apollo', 4, 'org-no-teto');

      const error = await runAs('org-no-teto', () =>
        assertProspectingBudgetNotExceeded('apollo'),
      ).catch((e) => e);
      expect(error).toBeInstanceOf(ProspectingBudgetExceededError);
      expect((error as ProspectingBudgetExceededError).statusCode).toBe(429);
      expect((error as ProspectingBudgetExceededError).monthCostUsd).toBe(10);
      expect((error as ProspectingBudgetExceededError).budgetUsd).toBe(10);
      expect((error as ProspectingBudgetExceededError).provider).toBe('apollo');
      expect(error.message).toContain('Orçamento mensal de prospecção');
    });

    it('organização sem teto configurado (monthlyProspectingBudgetUsd null) nunca bloqueia, mesmo com gasto alto', async () => {
      mockOrgBudget({ 'org-sem-teto': null });
      await recordProspectingProviderSpend('hunter', 500, 'org-sem-teto');

      await expect(
        runAs('org-sem-teto', () => assertProspectingBudgetNotExceeded('hunter')),
      ).resolves.toBeUndefined();
    });

    it('sem organização conhecida no requestContext, nunca bloqueia e nem consulta o teto', async () => {
      await expect(assertProspectingBudgetNotExceeded('apollo')).resolves.toBeUndefined();
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('escopa o acumulado pela organização certa — não vaza gasto de outro tenant', async () => {
      mockOrgBudget({ 'org-a': 10, 'org-b': 10 });
      await recordProspectingProviderSpend('apollo', 50, 'org-a');
      await recordProspectingProviderSpend('apollo', 1, 'org-b');

      await expect(
        runAs('org-a', () => assertProspectingBudgetNotExceeded('apollo')),
      ).rejects.toBeInstanceOf(ProspectingBudgetExceededError);
      await expect(
        runAs('org-b', () => assertProspectingBudgetNotExceeded('apollo')),
      ).resolves.toBeUndefined();

      expect(await getOrgMonthProspectingCostUsd('org-a')).toBe(50);
      expect(await getOrgMonthProspectingCostUsd('org-b')).toBe(1);
    });

    it('escopa o acumulado pelo mês corrente — não herda gasto do mês anterior na virada do mês', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
      await recordProspectingProviderSpend('hunter', 40, 'org-mes');
      expect(await getOrgMonthProspectingCostUsd('org-mes')).toBe(40);

      vi.setSystemTime(new Date('2026-09-01T00:05:00Z'));
      expect(await getOrgMonthProspectingCostUsd('org-mes')).toBe(0);
    });

    it('chamadas de valores diferentes acumulam corretamente no mesmo mês/organização', async () => {
      await recordProspectingProviderSpend('apollo', 0.01, 'org-soma');
      await recordProspectingProviderSpend('apollo', 0.02, 'org-soma');
      await recordProspectingProviderSpend('hunter', 0.02, 'org-soma');

      expect(await getOrgMonthProspectingCostUsd('org-soma')).toBeCloseTo(0.05, 5);
    });
  });

  describe('Redis configurado', () => {
    beforeEach(() => {
      redisConfiguredValue = true;
    });

    it('grava o gasto via INCRBYFLOAT com chave por organização+mês e define TTL', async () => {
      cacheIncrByFloat.mockResolvedValue('7.5');
      cacheExpire.mockResolvedValue(1);

      await recordProspectingProviderSpend('apollo', 7.5, 'org-redis');

      expect(cacheIncrByFloat).toHaveBeenCalledTimes(1);
      const [key, amount] = cacheIncrByFloat.mock.calls[0] as [string, number];
      expect(key).toContain('org-redis');
      expect(amount).toBe(7.5);
      expect(cacheExpire).toHaveBeenCalledWith(key, expect.any(Number));
    });

    it('lê o acumulado do mês via Redis (GET)', async () => {
      cacheGet.mockResolvedValue('12.34');

      const cost = await getOrgMonthProspectingCostUsd('org-redis-leitura');

      expect(cost).toBe(12.34);
      expect(cacheGet).toHaveBeenCalledWith(expect.stringContaining('org-redis-leitura'));
    });

    it('bloqueia usando o valor lido do Redis quando ele atinge o teto', async () => {
      mockOrgBudget({ 'org-redis-bloqueio': 20 });
      cacheGet.mockResolvedValue('20');

      await expect(
        runAs('org-redis-bloqueio', () => assertProspectingBudgetNotExceeded('hunter')),
      ).rejects.toBeInstanceOf(ProspectingBudgetExceededError);
    });

    it('nunca lança se o Redis falhar ao ler — trata como custo desconhecido (fail-open)', async () => {
      mockOrgBudget({ 'org-redis-falha': 5 });
      cacheGet.mockRejectedValue(new Error('Redis fora do ar (teste)'));

      await expect(
        runAs('org-redis-falha', () => assertProspectingBudgetNotExceeded('apollo')),
      ).resolves.toBeUndefined();
    });

    it('cai para o fallback em memória se o Redis falhar ao gravar', async () => {
      cacheIncrByFloat.mockRejectedValue(new Error('Redis fora do ar (teste)'));

      await expect(
        recordProspectingProviderSpend('apollo', 3, 'org-redis-grava-falha'),
      ).resolves.toBeUndefined();
    });
  });
});
