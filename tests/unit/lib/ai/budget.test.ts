import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import client from 'prom-client';

/**
 * AI-011: circuit breaker de orçamento mensal de IA (src/lib/ai/budget.ts). `AI_MONTHLY_BUDGET_USD`
 * é lida do módulo `env` parseado uma única vez no import — igual ao problema já resolvido em
 * `tests/unit/lib/ai/metrics.test.ts`, o valor precisa variar por caso de teste, então cada teste
 * usa `vi.resetModules()` + `vi.doMock` + import dinâmico para pegar uma instância fresca do módulo
 * (o que também reseta o cache em memória local do módulo entre casos, sem precisar mexer nele
 * diretamente na maioria dos testes).
 */
describe('src/lib/ai/budget.ts (AI-011)', () => {
    let aggregateMock: ReturnType<typeof vi.fn>;
    let redisStore: Map<string, string>;

    beforeEach(() => {
        // budget.ts importa metrics.ts (recordAiBudgetBlocked), que registra Counters/Gauges no
        // registry global do prom-client no top-level do módulo — vi.resetModules() reimporta
        // metrics.ts do zero a cada teste, mas o registry do prom-client é um singleton do
        // processo, não por módulo. Sem isto, o segundo teste falha com "already registered"
        // (mesmo cuidado já tomado em tests/unit/lib/ai/metrics.test.ts).
        client.register.clear();
        vi.resetModules();
        aggregateMock = vi.fn().mockResolvedValue({ _sum: { cost: 0 } });
        redisStore = new Map();

        vi.doMock('../../../../src/lib/prisma.js', () => ({
            prisma: { aILog: { aggregate: aggregateMock } },
        }));
        vi.doMock('../../../../src/lib/queue/redis.js', () => ({
            cacheConnection: {
                get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
                set: vi.fn(async (key: string, value: string) => {
                    redisStore.set(key, value);
                    return 'OK';
                }),
                del: vi.fn(async (key: string) => (redisStore.delete(key) ? 1 : 0)),
            },
        }));
    });

    afterEach(() => {
        vi.doUnmock('../../../../src/lib/prisma.js');
        vi.doUnmock('../../../../src/lib/queue/redis.js');
        vi.doUnmock('../../../../src/config/env.js');
        client.register.clear();
        vi.resetModules();
    });

    async function loadBudget(budgetUsd?: number) {
        vi.doMock('../../../../src/config/env.js', () => ({ env: { AI_MONTHLY_BUDGET_USD: budgetUsd } }));
        return import('../../../../src/lib/ai/budget.js');
    }

    it('sem AI_MONTHLY_BUDGET_USD configurado, nunca bloqueia — nem tenta calcular o custo', async () => {
        aggregateMock.mockResolvedValue({ _sum: { cost: 999_999 } });
        const { assertAiBudgetNotExceeded } = await loadBudget(undefined);

        await expect(assertAiBudgetNotExceeded()).resolves.toBeUndefined();
        expect(aggregateMock).not.toHaveBeenCalled();
    });

    it('não bloqueia quando o custo do mês está abaixo do teto configurado', async () => {
        aggregateMock.mockResolvedValue({ _sum: { cost: 10 } });
        const { assertAiBudgetNotExceeded } = await loadBudget(50);

        await expect(assertAiBudgetNotExceeded()).resolves.toBeUndefined();
    });

    it('bloqueia com AiBudgetExceededError quando o custo do mês atinge exatamente o teto', async () => {
        aggregateMock.mockResolvedValue({ _sum: { cost: 50 } });
        const { assertAiBudgetNotExceeded, AiBudgetExceededError } = await loadBudget(50);

        await expect(assertAiBudgetNotExceeded()).rejects.toThrow(AiBudgetExceededError);
    });

    it('bloqueia quando o custo do mês ultrapassa o teto, com mensagem informativa', async () => {
        aggregateMock.mockResolvedValue({ _sum: { cost: 75 } });
        const { assertAiBudgetNotExceeded } = await loadBudget(50);

        await expect(assertAiBudgetNotExceeded()).rejects.toThrow(/Orçamento mensal de IA excedido/);
    });

    it('trata custo nulo (nenhuma chamada registrada ainda no mês) como zero, não como erro', async () => {
        aggregateMock.mockResolvedValue({ _sum: { cost: null } });
        const { assertAiBudgetNotExceeded } = await loadBudget(10);

        await expect(assertAiBudgetNotExceeded()).resolves.toBeUndefined();
    });

    it('usa cache: chamadas repetidas dentro do TTL não recomputam contra o Postgres', async () => {
        aggregateMock.mockResolvedValue({ _sum: { cost: 5 } });
        const { assertAiBudgetNotExceeded } = await loadBudget(50);

        await assertAiBudgetNotExceeded();
        await assertAiBudgetNotExceeded();
        await assertAiBudgetNotExceeded();

        expect(aggregateMock).toHaveBeenCalledTimes(1);
    });

    it('__resetAiBudgetCacheForTests força um novo cálculo na próxima checagem', async () => {
        aggregateMock.mockResolvedValue({ _sum: { cost: 5 } });
        const { assertAiBudgetNotExceeded, __resetAiBudgetCacheForTests } = await loadBudget(50);

        await assertAiBudgetNotExceeded();
        await __resetAiBudgetCacheForTests();
        await assertAiBudgetNotExceeded();

        expect(aggregateMock).toHaveBeenCalledTimes(2);
    });

    it('Postgres indisponível ao calcular custo: trata como custo desconhecido (não bloqueia), não derruba a chamada de IA', async () => {
        aggregateMock.mockRejectedValue(new Error('connection refused'));
        const { assertAiBudgetNotExceeded } = await loadBudget(1);

        await expect(assertAiBudgetNotExceeded()).resolves.toBeUndefined();
    });

    it('Redis indisponível na leitura do cache: recalcula direto do Postgres em vez de falhar', async () => {
        aggregateMock.mockResolvedValue({ _sum: { cost: 5 } });
        vi.doUnmock('../../../../src/lib/queue/redis.js');
        vi.doMock('../../../../src/lib/queue/redis.js', () => ({
            cacheConnection: {
                get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
                set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
                del: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
            },
        }));
        const { assertAiBudgetNotExceeded } = await loadBudget(50);

        await expect(assertAiBudgetNotExceeded()).resolves.toBeUndefined();
        expect(aggregateMock).toHaveBeenCalledTimes(1);
    });

    it('calcula o custo do mês com bypass de RLS (soma GLOBAL, não escopada pelo tenant da request)', async () => {
        let capturedStore: unknown;
        aggregateMock.mockImplementation(async () => {
            const { requestContext } = await import('../../../../src/lib/async-context.js');
            capturedStore = requestContext.getStore();
            return { _sum: { cost: 5 } };
        });
        const { assertAiBudgetNotExceeded } = await loadBudget(50);
        const { requestContext } = await import('../../../../src/lib/async-context.js');

        await requestContext.run({ tenantId: 'org-x' }, () => assertAiBudgetNotExceeded());

        expect(capturedStore).toEqual({ bypassRls: true });
    });
});
