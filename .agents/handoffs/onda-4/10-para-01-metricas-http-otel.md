- De: 10
- Para: 01
- Onda: 4
- Status: em-andamento
- Prioridade: normal
## Problema
Minha missão pede alerta para "erro 5xx acima de limiar" (`.agents/prompts/10-infraestrutura-sre.md`).
Escrevi a regra em `infrastructure/observability/alert.rules.yml` (grupo
`prospector-atlas.http-5xx.pendente-instrumentacao`, alerta `HighErrorRate5xx`), mas ela depende
de uma métrica HTTP por status code que não é exportada hoje.

O caminho mais barato para isso **não é** instrumentar cada rota manualmente: `src/lib/
tracing.ts` já chama `getNodeAutoInstrumentations()` do OpenTelemetry, que auto-instrumenta
Express/HTTP e naturalmente gera métricas como `http.server.duration` com o `status_code` como
atributo — mas o `NodeSDK` ali só registra um `traceExporter` (`OTLPTraceExporter`), sem
`metricReader`/exportador de métricas. O pipeline de métricas do `otel-collector`
(`infrastructure/observability/otel-collector.yml`, que eu não precisei alterar — já está
correto: recebe OTLP em `:4317`/`:4318` e exporta para Prometheus em `:9464`) fica sem nada para
processar porque a aplicação nunca envia métricas via OTLP, só traces.
## Arquivo(s) envolvido(s)
- `src/lib/tracing.ts` — falta um `PeriodicExportingMetricReader` + `OTLPMetricExporter`
  (`@opentelemetry/exporter-metrics-otlp-http`, já teria dependência semelhante à
  `@opentelemetry/exporter-trace-otlp-http` já usada) passado para o `NodeSDK`.
- Meu lado (já correto, só esperando a origem dos dados):
  `infrastructure/observability/otel-collector.yml`, `infrastructure/observability/
  alert.rules.yml`.
## Alteração necessária
No `NodeSDK` de `src/lib/tracing.ts`, adicionar:
```ts
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
// ...
sdkInstance = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    instrumentations: [getNodeAutoInstrumentations()],
});
```
Isso dá métricas HTTP (duração, contagem por status code) "de graça" via auto-instrumentação,
sem precisar de `Counter`/`Histogram` custom por rota. Confirmar o nome exato da métrica gerada
pela versão instalada do auto-instrumentations-node (`http.server.duration` costuma virar
`http_server_duration_milliseconds_*` depois do exporter Prometheus — ajustei a expressão em
`alert.rules.yml` para esse nome, mas validar contra a saída real de `/metrics` do
otel-collector, porta `:9464`, depois de ligar o exporter).
## Teste esperado
`curl http://localhost:9464/metrics` (otel-collector, stack `npm run infra:up`) mostra séries
`http_server_duration_milliseconds_*` com label `http_status_code`. A regra `HighErrorRate5xx`
deixa de ficar `unknown` no Prometheus.
## Contexto adicional
Onda 4 — Agente 10. `EXPOSE_METRICS`/`/metrics` (prom-client, métricas de processo) já funciona e
não depende desta mudança — este handoff é só sobre a lacuna de métricas HTTP via OTel.

## Resolução (parcial — deixado `em-andamento`, não `resolvido`)

Feito (Agente 01, remediação Onda 5):
- `src/lib/tracing.ts`: `metricReader: new PeriodicExportingMetricReader({ exporter: new
  OTLPMetricExporter() })` adicionado ao `NodeSDK`, exatamente como pedido. Dependência
  `@opentelemetry/exporter-metrics-otlp-http` adicionada como direta em `package.json`/
  `package-lock.json` (autorização explícita do Coordenador — já era transitiva via
  `@opentelemetry/sdk-node`, agora também é direta).
- `npx tsc --noEmit`, `npm run lint`, `npm run build` e `npm run test:unit` (694 testes) seguem
  verdes com esta mudança.

Validado empiricamente contra a stack local (subi só `otel-collector` via
`docker compose -f docker-compose.yml -f docker-compose.opensource.yml up -d --no-deps
otel-collector` — `npm run infra:up` completo não foi necessário para isolar este ponto; imagem
`otel/opentelemetry-collector-contrib:0.136.0` puxada e rodando, `:4317`/`:4318`/`:9464`
mapeadas; app real rodada via `node dist/server.cjs` com `OTEL_EXPORTER_OTLP_ENDPOINT=
http://localhost:4318`):
- **Confirmado**: com o `metricReader`, a aplicação agora EXPORTA métricas de verdade — antes
  desta mudança, zero métrica saía (não só HTTP: nenhuma). `curl http://localhost:9464/metrics`
  mostra séries reais de runtime/GC do Node (`nodejs_eventloop_delay_*`,
  `nodejs_eventloop_utilization_ratio`, `v8js_gc_duration_seconds`, `v8js_memory_heap_*`),
  vindas de `@opentelemetry/instrumentation-runtime-node` (parte de
  `getNodeAutoInstrumentations()`) — prova de que o pipeline app → OTLP → otel-collector →
  Prometheus (`:9464`) está funcionando ponta a ponta. Isto sozinho já corrige o defeito raiz
  descrito no "Problema" (NodeSDK sem metricReader = zero telemetria de métrica).
- **NÃO confirmado**: a métrica HTTP específica que `HighErrorRate5xx` espera
  (`http.server.duration` / `http_server_duration_milliseconds_*` com `http_status_code`) NÃO
  apareceu em `:9464/metrics` depois de gerar tráfego real contra o servidor (`GET /`, `GET
  /api/health`, uma rota inexistente para gerar 404). Tentei também com
  `OTEL_SEMCONV_STABILITY_OPT_IN=http` (env var conhecida para habilitar métricas HTTP estáveis
  em algumas versões do SDK JS) — mesmo resultado, sem série HTTP. Com a versão instalada hoje
  (`@opentelemetry/auto-instrumentations-node@^0.78.0` → `@opentelemetry/instrumentation-http@
  ^0.220.0`), a auto-instrumentação parece gerar métricas de runtime/GC mas não a métrica de
  duração HTTP por rota/status — possivelmente essa versão específica do pacote de
  instrumentation-http ainda não implementa a métrica (ou exige uma opção de configuração que não
  identifiquei na janela de tempo desta rodada, ex.: `HttpInstrumentationConfig` passado
  explicitamente em vez de confiar no default do `getNodeAutoInstrumentations()`).

**Deixo aberto para o Agente 10** (ou para quem pegar este handoff a seguir): confirmar se a
versão instalada de `instrumentation-http` realmente não emite essa métrica (checar
CHANGELOG/README do pacote na versão `0.220.0`) e, se for o caso, decidir entre (a) atualizar a
versão do pacote quando uma versão com suporte estiver disponível, (b) configurar
`getNodeAutoInstrumentations()` com uma opção específica para habilitar a métrica, ou (c) medir
duração HTTP manualmente via um middleware Express + `Histogram` do próprio `@opentelemetry/api`
(rota de fallback que o próprio handoff original descartou como "não é o caminho mais barato",
mas pode ser necessário se a auto-instrumentação desta versão realmente não suportar). Isso está
fora do meu escopo desta rodada de remediação pontual (só o wiring do `metricReader` foi pedido),
por isso não decidi por nenhuma das três opções.
