import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: '*' };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

/**
 * AI-011: `BaseAgent.runWithTools` (base.agent.ts) fala direto com LangChain/Groq via
 * `buildModelWithFallback` (fallback.util.ts), sem passar pelo gateway central — precisa da própria
 * checagem de orçamento, não herda a de `getAiModel().invoke()` (coberta em
 * src/lib/ai/__tests__/gateway.test.ts). BDR é o agente mais simples que usa este caminho
 * (`run()` delega direto para `runWithTools` com uma única ferramenta).
 *
 * Mock de env acima com consentimento liberado ('*'): desde AI-007 (parte 2, onda 33),
 * `runWithTools` checa a trava de consentimento LGPD (guardrails.service.ts) ANTES da checagem de
 * orçamento — sem isto, este teste bloquearia no gate errado e nunca chegaria a exercitar o
 * circuit breaker de orçamento que ele existe para provar.
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

        const { requestContext } = await import('../../../../lib/async-context.js');
        const { BDRAgent } = await import('../bdr.agent.js');
        const agent = new BDRAgent();

        const result = await requestContext.run(
            { tenantId: 'org-budget-test' },
            () => agent.run('Dados do lead de teste', 'session-budget-test'),
        );

        expect(result.error).toContain('Orçamento mensal de IA excedido (teste)');
        expect(buildSpy).not.toHaveBeenCalled();
    }, 15_000);
});
