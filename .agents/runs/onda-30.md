# Onda 30 — AI-011: circuit breaker de orçamento mensal de IA

## Contexto

Item 10/15 da rodada "resolver todas as pendências" (`docs/AI-SWARM-GOVERNANCE-AUDIT.md`, Sprint
07). Fecha o primeiro item do bloco AI-011/AI-003/AI-002/AI-007/AI-010/AI-005/AI-006, seguindo o
merge de CYC-009 (PR #204), que fechou todo o bloco de cadência (CYC-001..CYC-009) desta rodada.

**Estado de entrada (auditoria, onda 20)**: `AI_MONTHLY_BUDGET_USD` existia só como referência
estática para um alerta Prometheus passivo (`AIBudgetOverrun`), nem necessariamente declarada em
`render.yaml`. Nenhum bloqueio de chamada de IA dependia dela. O que já existia de guardrail era
outra coisa: `MAX_STEPS=5` (teto de iterações do supervisor do enxame) e um circuit breaker **por
provedor** (`gateway.ts`, reage a falhas HTTP consecutivas de Groq/OpenAI/LiteLLM, nada a ver com
custo acumulado). O item ficava documentado como pendência porque a pergunta "o que 'cortar'
significa" era uma decisão de produto, não algo para uma correção inventar sozinha.

## Decisão de produto

Já resolvida antes do início desta rodada (decisão-padrão que governa todo o bloco AI): **exceder o
teto BLOQUEIA novas chamadas de IA** — não degrada para outro modelo, não é só notificação passiva.

Escopo do orçamento (pergunta nova, não coberta pela decisão-padrão): **global** (soma de todas as
organizações), não por tenant. Justificativa: `AI_MONTHLY_BUDGET_USD` já era um único valor escalar
antes desta correção — ao contrário de outros pares flag+allowlist-por-organização já estabelecidos
neste repo (`SWARM_SCHEDULER_ORGANIZATIONS`, `AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS`), não há
precedente de orçamento por tenant, e construir um exigiria uma coluna/tabela nova — fora do escopo
desta correção pontual. Documentado como risco aceito em `docs/AI-SWARM-GOVERNANCE-AUDIT.md` (uma
organização de alto consumo pode bloquear IA para as demais).

## O que foi construído

- **`src/lib/ai/budget.ts`** (novo) — `assertAiBudgetNotExceeded()`: no-op se
  `AI_MONTHLY_BUDGET_USD` não estiver configurada; caso contrário, compara o custo do mês corrente
  contra o teto e lança `AiBudgetExceededError` (mensagem informativa: custo atual, teto, motivo)
  quando atingido/ultrapassado.
  - `getMonthCostUsd()`: soma real de `AILog.cost` do mês corrente em TODAS as organizações — mesma
    fonte de verdade de `usageService.summary`/`GET /api/usage` (que soma por uma organização), mas
    sem filtro de tenant. Cacheada por 60s (Redis, com fallback em memória local desta instância se
    o Redis cair) — evita um `aggregate` no Postgres por chamada de IA.
  - Falha ao CALCULAR o custo (Postgres indisponível) é tratada como "custo desconhecido" (não
    bloqueia), não como "orçamento excedido" — decisão deliberada de resiliência: um Postgres fora
    do ar não deveria ter um raio de impacto maior (derrubar toda a superfície de IA) do que o
    problema que este circuit breaker existe para prevenir.
- **`src/lib/prisma.ts`** — `AILog` adicionado a `BYPASS_RLS_ALLOWED_MODELS`. Categoria de bypass
  DIFERENTE das entradas anteriores da allowlist (que são todas "bootstrap: ache o tenant, depois
  volte a operar escopado"): aqui é uma leitura agregada genuinamente cross-tenant e permanente.
  Seguro porque a única operação que usa o bypass é `_sum: { cost: true }` — nunca uma linha, nunca
  um `organizationId` específico devolvido a ninguém; nenhuma API expõe este bypass.
- **Dois pontos de checagem** (os dois caminhos reais de saída para um provedor de IA):
  - `getAiModel().invoke()` (`src/lib/ai/gateway.ts`) — checado antes de qualquer tentativa de rede,
    cobre os ~34 arquivos que já chamam o gateway central diretamente.
  - `BaseAgent.runWithTools()` (`src/features/intelligence/agents/base.agent.ts`) — o único caminho
    que fala direto com LangChain/Groq via `buildModelWithFallback` (fallback.util.ts), sem passar
    pelo gateway; usado só por BDR e Closer. Sem este segundo ponto, os dois únicos agentes do
    enxame com acesso a ferramentas ficariam fora do circuit breaker.
- **`src/lib/ai/metrics.ts`** — `ai_budget_blocked_total` (Counter novo): incrementado a cada
  bloqueio real. Antes só existia o gauge `ai_usage_budget_usd_total` (valor de referência estático,
  nunca soube se algo de fato foi bloqueado).
- **`src/config/env.ts`** — comentário de `AI_MONTHLY_BUDGET_USD` corrigido (estava
  factualmente desatualizado, afirmando "nenhum bloqueio de chamada de IA depende dela hoje").

## Fora de escopo (documentado, não corrigido)

- Orçamento por organização (ver "Decisão de produto" acima).
- Gating de `generateEmbedding()`: o provedor padrão é local (sem custo, nunca registrado em
  `AILog`/`estimateCostUsd`); o caminho remoto (`EMBEDDINGS_PROVIDER=gateway`) já não tinha nenhum
  registro de custo antes desta correção — não há dado real para o circuit breaker usar ali sem
  construir contabilização de custo de embeddings do zero, fora do escopo pontual deste item.

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (baseline herdado, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **190/190 arquivos, 1472/1472 testes**
  (18 testes novos: 10 em `tests/unit/lib/ai/budget.test.ts`, 1 em
  `src/lib/ai/__tests__/gateway.test.ts`, 1 em
  `src/features/intelligence/agents/__tests__/base.agent.budget.test.ts`, mais os 6 que também
  rodam via `src/**/__tests__/**` mas contam no total do arquivo — ver detalhamento abaixo)
- integration (Postgres+Redis reais): `npx vitest run -c vitest.integration.config.ts` —
  **42/42 arquivos, 210/210 testes**, incluindo os 6 casos novos de `tests/integration/ai-budget.test.ts`
  (sem teto configurado nunca bloqueia; soma GLOBAL cross-tenant com 2 organizações reais; bloqueia
  no teto; não bloqueia abaixo do teto; cache não vê linha gravada depois da leitura até ser limpo;
  bypass de RLS confirmado contra a policy real da tabela — um tenant autenticado só enxerga a
  própria organização numa query normal, mas `getMonthCostUsd()` com bypass enxerga o total global)
- `npm run build` e `npm run build:worker` — ambos limpos

## Correção durante a implementação

Ao rodar `tests/unit/lib/ai/budget.test.ts` pela primeira vez, 9/10 casos falharam com "A metric
with the name ai_usage_cost_usd_total has already been registered": `budget.ts` importa
`metrics.ts` (para `recordAiBudgetBlocked`), que registra Counters/Gauges no registry global do
prom-client no top-level do módulo. Como o teste usa `vi.resetModules()` para variar
`AI_MONTHLY_BUDGET_USD` por caso (mesmo problema de módulo-parseado-uma-vez de
`tests/unit/lib/ai/metrics.test.ts`), `metrics.ts` era reimportado do zero a cada teste — mas o
registry do prom-client é um singleton do processo, não por módulo. Corrigido com
`client.register.clear()` no `beforeEach`/`afterEach`, mesmo cuidado que `metrics.test.ts` já tomava
para o próprio módulo.

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada.
