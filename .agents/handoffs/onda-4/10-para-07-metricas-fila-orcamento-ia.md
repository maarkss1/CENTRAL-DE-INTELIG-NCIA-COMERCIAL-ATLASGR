- De: 10
- Para: 07
- Onda: 4
- Status: aberto
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
