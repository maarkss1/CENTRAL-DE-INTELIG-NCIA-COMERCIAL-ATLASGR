import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AI-011 (onda 30) — circuit breaker de orçamento mensal de IA contra Postgres real. Prova o que um
 * teste unitário com prisma mockado não consegue provar: que a soma é GLOBAL de verdade (cross-
 * tenant, via bypass de RLS — AILog em BYPASS_RLS_ALLOWED_MODELS, src/lib/prisma.ts) e não apenas
 * escopada ao tenant da request corrente por engano.
 *
 * `AI_MONTHLY_BUDGET_USD` é lida do módulo `env` parseado uma única vez no import — mesmo problema
 * já resolvido em document-signature.routes.test.ts: mocka o módulo mantendo o resto do env real,
 * e cada teste sobrescreve o campo diretamente no objeto retornado (mesma referência em todo import).
 */
vi.mock('../../src/config/env.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/config/env.js')>();
    return { ...actual, env: { ...actual.env, AI_MONTHLY_BUDGET_USD: undefined } };
});

const { prisma } = await import('../../src/lib/prisma');
const { requestContext } = await import('../../src/lib/async-context');
const { env } = await import('../../src/config/env');
const {
    assertAiBudgetNotExceeded,
    getMonthCostUsd,
    AiBudgetExceededError,
    __resetAiBudgetCacheForTests,
} = await import('../../src/lib/ai/budget');

const ORG_A = 'test-org-id'; // pré-seedado por tests/helpers/integration-setup.ts
const ORG_B = 'test-org-id-ai-budget-b';
const PROMPT_PREFIX = 'onda-30-ai-budget-';

function createLog(organizationId: string, cost: number, promptId: string) {
    return requestContext.run({ tenantId: organizationId }, () =>
        prisma.aILog.create({
            data: { organizationId, tokens: 100, cost, latencyMs: 10, model: 'test-model', promptId },
        }),
    );
}

async function cleanupTestLogs() {
    await requestContext.run({ bypassRls: true }, () =>
        prisma.aILog.deleteMany({ where: { promptId: { startsWith: PROMPT_PREFIX } } }),
    );
}

describe('AI-011: circuit breaker de orçamento mensal de IA (Postgres real)', () => {
    beforeEach(async () => {
        (env as { AI_MONTHLY_BUDGET_USD?: number }).AI_MONTHLY_BUDGET_USD = undefined;
        await __resetAiBudgetCacheForTests();
        await cleanupTestLogs();
        await requestContext.run({ bypassRls: true }, async () => {
            const orgB = await prisma.organization.findUnique({ where: { id: ORG_B } });
            if (!orgB) await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org AI Budget B' } });
        });
    });

    afterEach(async () => {
        await cleanupTestLogs();
        await requestContext.run({ bypassRls: true }, () =>
            prisma.organization.deleteMany({ where: { id: ORG_B } }),
        );
        await __resetAiBudgetCacheForTests();
        (env as { AI_MONTHLY_BUDGET_USD?: number }).AI_MONTHLY_BUDGET_USD = undefined;
    });

    it('sem AI_MONTHLY_BUDGET_USD configurado, nunca bloqueia', async () => {
        await expect(assertAiBudgetNotExceeded()).resolves.toBeUndefined();
    });

    it('soma custo de AILog de TODAS as organizações — não fica preso ao tenant de quem chama', async () => {
        const before = await getMonthCostUsd();

        await createLog(ORG_A, 1.5, `${PROMPT_PREFIX}org-a`);
        await createLog(ORG_B, 2.25, `${PROMPT_PREFIX}org-b`);
        await __resetAiBudgetCacheForTests();

        const after = await getMonthCostUsd();
        expect(after - before).toBeCloseTo(3.75, 6);
    });

    it('bloqueia com AiBudgetExceededError quando o custo do mês atinge o teto configurado', async () => {
        const baseline = await getMonthCostUsd();
        await createLog(ORG_A, 5, `${PROMPT_PREFIX}exceed`);
        await __resetAiBudgetCacheForTests();
        (env as { AI_MONTHLY_BUDGET_USD?: number }).AI_MONTHLY_BUDGET_USD = baseline + 5;

        await expect(assertAiBudgetNotExceeded()).rejects.toThrow(AiBudgetExceededError);
    });

    it('não bloqueia quando o custo do mês está abaixo do teto configurado', async () => {
        const baseline = await getMonthCostUsd();
        await createLog(ORG_A, 1, `${PROMPT_PREFIX}under`);
        await __resetAiBudgetCacheForTests();
        (env as { AI_MONTHLY_BUDGET_USD?: number }).AI_MONTHLY_BUDGET_USD = baseline + 1000;

        await expect(assertAiBudgetNotExceeded()).resolves.toBeUndefined();
    });

    it('usa cache: uma leitura dentro do TTL não enxerga uma linha gravada depois dela, até o cache ser limpo', async () => {
        const first = await getMonthCostUsd();
        await createLog(ORG_A, 9, `${PROMPT_PREFIX}cache-not-yet-visible`);

        const second = await getMonthCostUsd();
        expect(second).toBeCloseTo(first, 6);

        await __resetAiBudgetCacheForTests();
        const third = await getMonthCostUsd();
        expect(third - first).toBeCloseTo(9, 6);
    });

    it('a leitura roda sob bypass de RLS: um tenant autenticado ainda enxerga o custo GLOBAL, não só o próprio', async () => {
        await createLog(ORG_B, 4, `${PROMPT_PREFIX}rls-cross-tenant`);
        await __resetAiBudgetCacheForTests();

        const globalCost = await requestContext.run({ tenantId: ORG_A }, () => getMonthCostUsd());

        const onlyOrgA = await requestContext.run({ tenantId: ORG_A }, () =>
            prisma.aILog.aggregate({
                where: { promptId: `${PROMPT_PREFIX}rls-cross-tenant` },
                _sum: { cost: true },
            }),
        );
        expect(onlyOrgA._sum.cost ?? 0).toBe(0); // RLS normal (sem bypass) não veria a linha de ORG_B
        expect(globalCost).toBeGreaterThanOrEqual(4); // getMonthCostUsd() (com bypass) vê
    });
});
