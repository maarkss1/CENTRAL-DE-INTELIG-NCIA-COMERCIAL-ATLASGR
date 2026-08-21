import client from 'prom-client';
import { env } from '../../config/env.js';

/**
 * Métricas Prometheus de custo/orçamento de IA, expostas em `/metrics` (montado
 * condicionalmente por `EXPOSE_METRICS` em server.ts).
 *
 * Handoff: .agents/handoffs/onda-4/10-para-07-metricas-fila-orcamento-ia.md — o Agente 10
 * (Infra/SRE) já escreveu o alerta `AIBudgetOverrun` em
 * infrastructure/observability/alert.rules.yml referenciando `ai_usage_cost_usd_total` e
 * `ai_usage_budget_usd_total` como contrato de nome de métrica. Antes deste módulo, custo de IA só
 * existia em banco (tabela AILog, ver docs/deploy/producao.md seção 1.3) — nenhuma contraparte em
 * Prometheus, então o alerta ficava permanentemente "unknown".
 */

export const aiUsageCostUsdTotal = new client.Counter({
    name: 'ai_usage_cost_usd_total',
    help: 'Custo estimado acumulado (USD) de chamadas de IA via src/lib/ai/gateway.ts, por provedor e tenant.',
    labelNames: ['provider', 'tenant'] as const,
});

/**
 * Registra o custo estimado de uma chamada de IA bem-sucedida. Chamado de dentro de
 * `getAiModel().invoke()` (gateway.ts) — o mesmo ponto onde `traceAiGeneration` já é disparado —
 * logo após o provedor real (`providerUsed`) e o uso de tokens serem conhecidos, para o rótulo
 * `provider` refletir quem de fato atendeu a chamada (não uma aproximação pelo nome do modelo).
 *
 * `tenant` cai para 'unattributed' fora de uma requisição HTTP (scripts, workers sem
 * requestContext) — mesmo tratamento que `logAiUsage` já dá a `organizationId: null` no AILog.
 */
export function recordAiUsageCost(provider: string, tenant: string | null | undefined, costUsd: number): void {
    if (!Number.isFinite(costUsd) || costUsd < 0) return;
    aiUsageCostUsdTotal.inc({ provider: provider || 'unknown', tenant: tenant || 'unattributed' }, costUsd);
}

/**
 * AI-011: contador de quantas chamadas de IA foram efetivamente bloqueadas pelo circuit breaker de
 * orçamento (src/lib/ai/budget.ts) por terem batido no teto de `AI_MONTHLY_BUDGET_USD`. Ao
 * contrário do gauge de orçamento abaixo (só um valor de referência estático), este é o sinal real
 * de que o bloqueio está acontecendo em produção — sem ele, um teto configurado bloqueando chamadas
 * silenciosamente não teria nenhuma métrica própria para alertar sobre isso.
 */
export const aiBudgetBlockedTotal = new client.Counter({
    name: 'ai_budget_blocked_total',
    help: 'Chamadas de IA bloqueadas pelo circuit breaker de orçamento mensal (AI-011) por excederem AI_MONTHLY_BUDGET_USD.',
});

export function recordAiBudgetBlocked(): void {
    aiBudgetBlockedTotal.inc();
}

// Gauge de orçamento só é registrado (e, portanto, só aparece em /metrics) quando
// AI_MONTHLY_BUDGET_USD está configurada. Sem valor configurado, a série simplesmente não existe
// — não fabricamos um "0" que faria `ai_usage_cost_usd_total / ai_usage_budget_usd_total` virar
// +Inf a qualquer custo real (falso positivo no alerta AIBudgetOverrun).
if (env.AI_MONTHLY_BUDGET_USD !== undefined) {
    const aiUsageBudgetUsdTotal = new client.Gauge({
        name: 'ai_usage_budget_usd_total',
        help: 'Orçamento mensal de IA configurado (USD) via AI_MONTHLY_BUDGET_USD (AI-011: excedê-lo bloqueia novas chamadas de IA, ver src/lib/ai/budget.ts). Este gauge é só o valor de referência para o alerta AIBudgetOverrun, não o próprio bloqueio.',
    });
    aiUsageBudgetUsdTotal.set(env.AI_MONTHLY_BUDGET_USD);
}
