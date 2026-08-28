import client from 'prom-client';
import { recordProspectingProviderSpend, type ProspectingCostProvider } from './providerBudget.js';

// Onda 42 (DEC-09): `ProspectingCostProvider` é definido em `providerBudget.ts`, não aqui — este
// arquivo já depende daquele em runtime (`recordProspectingProviderSpend`, logo abaixo), então
// manter a definição do tipo lá também evita um ciclo de import entre os dois módulos
// (dependency-cruiser `no-circular`). Reexportado aqui para não quebrar quem já importa o tipo
// deste arquivo (searchExecution.service.ts).
export type { ProspectingCostProvider };

/**
 * Gap de auditoria (05 — Prospecção): `providerRateLimit.ts` e `providerCache.ts` (já criados
 * neste mesmo ciclo) e `MAX_DECISION_MAKER_LOOKUPS`/`DECISION_MAKER_PREFETCH_BUDGET_MS`
 * (apollo/client.ts) limitam QUANTIDADE de chamadas e latência — nenhum deles rastreia CUSTO
 * monetário real acumulado por provider externo (Apollo/Hunter). Este módulo segue o MESMO padrão
 * já usado para custo de IA (src/lib/ai/metrics.ts::ai_usage_cost_usd_total): um Counter
 * Prometheus honesto do que JÁ foi gasto, incrementado só depois de uma chamada de rede real e
 * bem-sucedida ao provider — nunca um teto/bloqueio (orçamento é decisão de produto, fora de
 * escopo desta tarefa; outra ferramenta pode alertar em cima deste contador, como o alerta
 * AIBudgetOverrun já faz hoje para IA em cima de `ai_usage_cost_usd_total`).
 *
 * ATUALIZAÇÃO (DEC-09, onda 42): o parágrafo acima ("nunca um teto/bloqueio") descrevia o estado
 * ANTES desta rodada — a decisão de produto mudou (dossiê CPI, opção B). O Counter Prometheus
 * abaixo continua sendo só observação (sem rótulo de organização, sem corte por mês), mas
 * `recordProviderCallCost` agora TAMBÉM alimenta `providerBudget.ts` (armazenamento durável por
 * organização/mês, ver o comentário grande no topo daquele arquivo), que é o que
 * `assertProspectingBudgetNotExceeded` usa para bloquear de verdade uma chamada nova quando o teto
 * mensal por organização (`Organization.monthlyProspectingBudgetUsd`) é excedido. O bloqueio em si
 * acontece ANTES da chamada de rede (nos 7 pontos onde `checkProviderRateLimit` já é checado);
 * este arquivo só registra o gasto DEPOIS de uma chamada bem-sucedida, como sempre fez.
 *
 * Fonte do custo por chamada: nem Apollo nem Hunter devolvem custo/crédito consumido no corpo da
 * resposta de nenhum dos endpoints usados neste domínio (Organization Search/Enrich, People
 * Search/Match, Email Finder, Domain Search) — confirmado lendo os tipos de resposta mapeados em
 * apollo/types.ts e hunter.service.ts: nenhum expõe algo como `credits_used` ou `cost`. Sem esse
 * dado real por chamada, o custo abaixo é uma ESTIMATIVA CONSERVADORA fixa por chamada bem-
 * sucedida, documentada explicitamente como tal (não o valor exato faturado, que depende do plano
 * contratado do tenant):
 *
 * - Apollo: os planos pagos publicamente listados (Basic/Professional, ~US$49-99/usuário/mês)
 *   incluem um número fixo de créditos de export/enrich por mês; dividindo o preço do plano pelos
 *   créditos incluídos, o custo por crédito aproxima-se de US$0.01-0.05 dependendo do tier e do
 *   endpoint (Organization Search/Enrich tende à ponta mais barata dessa faixa; People
 *   Search/Match, historicamente mais caro em créditos, à ponta mais cara). Sem acesso ao plano
 *   real do tenant, usamos US$0.01/chamada — a ponta conservadora (mais barata) da faixa citada,
 *   para não superestimar o gasto — igual para todos os endpoints Apollo instrumentados aqui.
 * - Hunter.io: planos pagos publicamente listados (Starter ~US$34/mês por 500 buscas, Growth
 *   ~US$104/mês por 2.500 buscas) aproximam-se de US$0.04-0.07 por busca. Usamos US$0.02/chamada
 *   como estimativa conservadora, abaixo dessa faixa — coerente com o uso real esperado deste
 *   provider hoje (tier gratuito/básico, ver comentários de hunter.service.ts).
 *
 * Nenhum destes dois números é o valor exato faturado por nenhum provider — é um piso estimado
 * para tornar o gasto observável e permitir alerta de TENDÊNCIA (ex.: "custo estimado Apollo subiu
 * 3x este mês"), não um cálculo de fatura. Ajustável via PROSPECTING_APOLLO_COST_PER_CALL_USD /
 * PROSPECTING_HUNTER_COST_PER_CALL_USD assim que o custo real do plano contratado for conhecido —
 * mesmo padrão de override por env já usado por getRateLimitPerMinute (providerRateLimit.ts).
 */

export const DEFAULT_PROVIDER_COST_PER_CALL_USD: Record<ProspectingCostProvider, number> = {
  apollo: 0.01,
  hunter: 0.02,
};

function envVarNameFor(provider: ProspectingCostProvider): string {
  return provider === 'apollo'
    ? 'PROSPECTING_APOLLO_COST_PER_CALL_USD'
    : 'PROSPECTING_HUNTER_COST_PER_CALL_USD';
}

/** Lê o custo estimado por chamada (env), com fallback à estimativa conservadora documentada acima. */
export function getCostPerCallUsd(
  provider: ProspectingCostProvider,
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const raw = environment[envVarNameFor(provider)];
  const parsed = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return DEFAULT_PROVIDER_COST_PER_CALL_USD[provider];
}

export const prospectingProviderCostUsdTotal = new client.Counter({
  name: 'prospecting_provider_cost_usd_total',
  help: 'Custo estimado acumulado (USD) de chamadas bem-sucedidas a providers de prospecção (Apollo/Hunter), por provider. Estimativa fixa por chamada (ver providerCostMetrics.ts) — NÃO é um teto/orçamento, só um contador honesto do que já foi gasto.',
  labelNames: ['provider'] as const,
});

/**
 * Registra o custo estimado de UMA chamada de rede real e bem-sucedida ao `provider`. Chame nos
 * mesmos pontos onde `checkProviderRateLimit`/`withProviderCache` já foram integrados — sempre
 * DEPOIS de confirmar `res.ok` (nunca antes: uma chamada que falhou ou nunca saiu por estar
 * bloqueada pelo rate limiter não gastou crédito real) e NUNCA dentro de um cache hit (o resultado
 * cacheado não bateu o provider de novo, então não deve contar custo de novo) — ou seja, sempre
 * dentro da função "Uncached" de cada operação, nunca no wrapper público que primeiro checa o
 * cache.
 *
 * Desde DEC-09 (onda 42), também dispara (fire-and-forget, nunca aguardado pelo chamador — uma
 * falha ao persistir o gasto nunca deve atrasar ou derrubar uma resposta que o provider já deu de
 * verdade) `recordProspectingProviderSpend`, que soma esse mesmo custo ao acumulado do mês
 * corrente da organização ativa (`getTenantId()`), usado por
 * `assertProspectingBudgetNotExceeded` (providerBudget.ts) para decidir se a PRÓXIMA chamada deve
 * ser bloqueada. Erros dessa persistência são só logados dentro de `recordProspectingProviderSpend`
 * — nunca propagam para cá.
 */
export function recordProviderCallCost(
  provider: ProspectingCostProvider,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const costUsd = getCostPerCallUsd(provider, environment);
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  prospectingProviderCostUsdTotal.inc({ provider }, costUsd);
  void recordProspectingProviderSpend(provider, costUsd);
}
