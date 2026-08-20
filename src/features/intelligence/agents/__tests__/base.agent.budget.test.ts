import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * AI-011: `BaseAgent.runWithTools` (base.agent.ts) fala direto com LangChain/Groq via
 * `buildModelWithFallback` (fallback.util.ts), sem passar pelo gateway central — precisa da própria
 * checagem de orçamento, não herda a de `getAiModel().invoke()` (coberta em
 * src/lib/ai/__tests__/gateway.test.ts). BDR é o agente mais simples que usa este caminho
 * (`run()` delega direto para `runWithTools` com uma única ferramenta).
 */
describe('BaseAgent.runWithTools — AI-011 (orçamento mensal de IA)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('bloqueia antes de montar qualquer modelo de IA quando o orçamento mensal foi excedido', async () => {
        const budgetModule = await import('../../../../lib/ai/budget.js');
        const fallbackUtil = await import('../fallback.util.js');
        vi.spyOn(budgetModule, 'assertAiBudgetNotExceeded')
            .mockRejectedValueOnce(new Error('Orçamento mensal de IA excedido (teste)'));
        const buildSpy = vi.spyOn(fallbackUtil, 'buildModelWithFallback');

        const { BDRAgent } = await import('../bdr.agent.js');
        const agent = new BDRAgent();

        const result = await agent.run('Dados do lead de teste', 'session-budget-test');

        expect(result.error).toContain('Orçamento mensal de IA excedido (teste)');
        expect(buildSpy).not.toHaveBeenCalled();
    }, 15_000);
});
