- De: 10
- Para: 07
- Onda: 4
- Status: resolvido
- Prioridade: normal
## Problema
Minha missão (observabilidade) pede alertas para "fila/queue travada" e "uso de IA fora do
orçamento definido pelo Agente 07" (`.agents/prompts/10-infraestrutura-sre.md`). Escrevi as
regras de alerta em `infrastructure/observability/alert.rules.yml`
(grupos `prospector-atlas.filas.pendente-instrumentacao` e
`prospector-atlas.orcamento-ia.pendente-instrumentacao`), mas elas referenciam métricas
Prometheus que não existem hoje:

- `bullmq_queue_waiting_jobs`, `bullmq_queue_active_jobs`, `bullmq_queue_completed_jobs` — nenhum
  `src/lib/queue/**` expõe profundidade/taxa de conclusão de fila como métrica Prometheus
  (`prom-client`). `server.ts` só chama `client.collectDefaultMetrics()` (métricas padrão de
  processo Node.js), sem nenhum `new client.Gauge(...)`/`Counter(...)` de negócio.
- `ai_usage_cost_usd_total` / `ai_usage_budget_usd_total` — custo de IA é hoje só registrado em
  banco (tabela `AILog`, ver `docs/deploy/producao.md` seção 1.3), sem contraparte em
  Prometheus. Não há um "orçamento" formalizado que eu tenha encontrado como métrica ou
  configuração — se existir só como valor no código/env, também vale documentar onde.

Sem essas métricas, as regras de alerta ficam prontas mas inertes — Prometheus não encontra a
série (`unknown`), não é um falso positivo, mas também não é observabilidade real do painel
`/admin/queues` nem do orçamento de IA em produção.
## Arquivo(s) envolvido(s)
- `src/lib/queue/index.ts`, `src/lib/queue/redis.ts` e os workers em `src/lib/queue/*.worker.ts`
  (fila).
- `src/lib/ai/gateway.ts` (uso/custo de IA, onde o orçamento provavelmente vive ou deveria viver).
- Meu lado (já pronto, só esperando a métrica existir): `infrastructure/observability/
  alert.rules.yml`.
## Alteração necessária
1. Expor no endpoint `/metrics` (já montado condicionalmente por `EXPOSE_METRICS` em `server.ts`)
   um `Gauge`/`Counter` `prom-client` por fila com profundidade waiting/active/failed e taxa de
   conclusão — nome sugerido `bullmq_queue_waiting_jobs{queue="<nome>"}` etc. (BullMQ já expõe
   `getWaitingCount()`/`getActiveCount()` nativamente, é questão de expor via um scrape
   periódico ou hook nos workers).
2. Expor `ai_usage_cost_usd_total{provider,tenant}` (Counter, incrementado por chamada) e o valor
   de orçamento configurado (`ai_usage_budget_usd_total` como Gauge, ou documentar onde o
   orçamento já vive se for só uma env/config estática) para permitir alertar antes do bloqueio
   acontecer, não só depois.
## Teste esperado
`GET /metrics` (com `EXPOSE_METRICS=true`) retorna as séries acima com valores reais sob carga
(fila com jobs pendentes, uma chamada de IA feita). As regras em `alert.rules.yml` deixam de
ficar `unknown` no Prometheus (`/alerts`) assim que scrapeadas.
## Contexto adicional
Onda 4 — Agente 10. Não bloqueador: os bloqueadores reais de `/AGENTS.md` ("Ferramentas do Hub de
IA inacessíveis") continuam sendo tratados via runbook manual
(`infrastructure/observability/RUNBOOK.md` seção 5) enquanto a métrica não existe.

## Resolução

Resolvido pelo Agente 07 (rodada de remediação pontual, fora da missão original da Onda 2).

### 1. Profundidade/conclusão de fila BullMQ

Novo módulo `src/lib/queue/metrics.ts` com `prom-client`:

- `bullmq_queue_waiting_jobs{queue}` / `bullmq_queue_active_jobs{queue}` — Gauges com `collect()`
  assíncrono que chamam `Queue.getWaitingCount()`/`getActiveCount()` de verdade a cada scrape, para
  cada fila registrada via `registerQueueForMetrics(nome, queue)`.
- `bullmq_queue_failed_jobs{queue}` — Gauge extra (não pedido explicitamente no handoff, mas
  praticamente gratuito e útil como sinal complementar de fila travada) via `getFailedCount()`.
- `bullmq_queue_completed_jobs{queue}` — **Counter** (não um Gauge amostrado de
  `getCompletedCount()`): BullMQ poda jobs completados retidos (`removeOnComplete`), então esse
  valor pode cair ao longo do tempo — usado com `rate()` (como a regra `QueueStalled` já faz)
  produziria taxas incorretas. O Counter é incrementado pelo listener `worker.on('completed', ...)`
  de cada worker, garantindo monotonicidade sob `rate()`.
- Uma falha ao coletar uma fila específica (Redis temporariamente indisponível) fica isolada — não
  derruba o scrape das demais filas nem o `/metrics` inteiro.

Todas as 8 filas de `src/lib/queue/**` foram registradas: `leads-enrichment`, `search-indexing`,
`intelligence-agents`, `sdr-cold-call`, `swarm-scheduler`, `bitrix-sync`, `enrichment-queue`,
`whatsapp-conversation-signal`. Cada worker (`create*Worker`) ganhou um listener `'completed'`
chamando `recordQueueJobCompleted(NOME_DA_FILA)`.

### 2. Custo/orçamento de IA

Novo módulo `src/lib/ai/metrics.ts`:

- `ai_usage_cost_usd_total{provider,tenant}` (Counter) — incrementado dentro de
  `getAiModel().invoke()` em `src/lib/ai/gateway.ts`, logo após o provedor real (`providerUsed`) e
  o uso de tokens serem conhecidos, usando o mesmo `estimateCostUsd()` que já alimenta o `AILog`.
  Não foi colocado dentro de `logAiUsage()` porque essa função só recebe `model`/`usage`, sem saber
  qual provedor real atendeu a chamada — instrumentar em `invoke()` dá o rótulo `provider` correto
  e dispara mesmo que o chamador decida não persistir o `AILog`. `tenant` cai para `'unattributed'`
  fora de uma requisição HTTP, mesmo tratamento que o `AILog.organizationId = null` já recebe.
- `ai_usage_budget_usd_total` (Gauge, sem labels) — **não existia nenhum conceito de orçamento de
  IA no código** antes deste item (confirmado: nada em `env.ts`, `usage.service.ts`, ou schema).
  Criada a variável de ambiente opcional `AI_MONTHLY_BUDGET_USD` (`src/config/env.ts`) como o lugar
  onde esse orçamento passa a viver — puramente informativo, nenhuma chamada de IA é bloqueada por
  ela hoje. **Importante**: a métrica só é registrada (e só aparece em `/metrics`) quando a env var
  está configurada. Sem valor configurado, a série simplesmente não existe, em vez de publicar um
  "0" fabricado — `ai_usage_cost_usd_total / ai_usage_budget_usd_total` com `budget=0` viraria
  `+Inf` a qualquer custo real, um falso positivo permanente no alerta `AIBudgetOverrun`.

### Nota sobre a regra `AIBudgetOverrun`

`ai_usage_cost_usd_total` tem labels `{provider, tenant}` e `ai_usage_budget_usd_total` não tem
nenhum label — a expressão atual (`ai_usage_cost_usd_total / ai_usage_budget_usd_total > 1`) não
casa os vetores em PromQL sem `on()`/`group_left` ou uma agregação (`sum(...)`) do lado do custo.
Fora do escopo deste handoff (arquivo é propriedade do Agente 10) — não editado; registrado aqui
para o Agente 10 ajustar a expressão quando for revisar o grupo `orcamento-ia`.

### Evidência

- `npx tsc --noEmit`: sem erros.
- `npm run lint`: 0 erros (101 warnings pré-existentes, nenhum nos arquivos alterados).
- `npm run build`: sucesso (vite + esbuild do `server.ts`).
- `npm run test:unit`: 695 testes passando (107 arquivos), incluindo os novos
  `tests/unit/lib/queue/metrics.test.ts` (5 testes) e `tests/unit/lib/ai/metrics.test.ts` (5
  testes) — exercitam os Gauges/Counter reais do `prom-client` (não mockados), incluindo o caso de
  uma fila falhando no scrape sem contaminar as demais.
- `npm run test:integration`: rodado diretamente via `vitest -c vitest.integration.config.ts`
  (o hook `pretest:integration` deste worktree tentou subir contêineres Docker com nomes que
  colidiram com um stack já em execução — ambiente compartilhado entre agentes/worktrees, não uma
  falha de código) contra Postgres/Redis locais já ativos: 34 passaram, 2 falharam
  (`ailog-rls.test.ts` — violação de RLS pré-existente — e uma falha intermitente em
  `rbac-e2e-crm-operations.test.ts`). Confirmado via `git stash` que **ambas as falhas reproduzem
  identicamente na árvore sem estas mudanças** — pré-existentes, não introduzidas por este item.
- `verify:ai`: não executável neste ambiente — nenhuma `GROQ_API_KEY`/`OPENAI_API_KEY`/
  `GEMINI_API_KEY`/`LITELLM_URL` configurada (dependência externa real, ver seção "Scripts
  ausentes"/limitações de ambiente de `/AGENTS.md`). Pela mesma razão, `ai_usage_cost_usd_total`
  não pôde ser exercitado ponta-a-ponta contra um provedor real neste ambiente — a lógica de
  incremento/rótulo é coberta por `tests/unit/lib/ai/metrics.test.ts` com o Counter real do
  `prom-client`.
- Smoke test real (não simulação): build de produção iniciado localmente com `EXPOSE_METRICS=true`
  e `AI_MONTHLY_BUDGET_USD=500`, Redis/Postgres locais reais. `GET /metrics` retornou séries
  populadas com valores reais das 8 filas registradas (incluindo dados de execuções anteriores já
  presentes no Redis local: `bullmq_queue_waiting_jobs{queue="search-indexing"} 491`,
  `bullmq_queue_active_jobs{queue="enrichment-queue"} 5`,
  `bullmq_queue_failed_jobs{queue="enrichment-queue"} 3`,
  `bullmq_queue_completed_jobs{queue="bitrix-sync"} 1` — este último provado por um job de sync
  real completado durante o próprio boot do processo) e `ai_usage_budget_usd_total 500`.

### Arquivos alterados
- `src/lib/queue/metrics.ts` (novo)
- `src/lib/ai/metrics.ts` (novo)
- `src/config/env.ts` (nova var `AI_MONTHLY_BUDGET_USD`)
- `src/lib/ai/gateway.ts` (chamada a `recordAiUsageCost` em `invoke()`)
- `src/lib/queue/index.ts`, `search.queue.ts`, `agent.worker.ts`, `coldCall.worker.ts`,
  `swarmScheduler.worker.ts`, `bitrixSync.worker.ts`, `enrichment.queue.ts`,
  `whatsappSignal.worker.ts` (registro de fila + listener `'completed'`)
- `tests/unit/lib/queue/metrics.test.ts` (novo)
- `tests/unit/lib/ai/metrics.test.ts` (novo)
