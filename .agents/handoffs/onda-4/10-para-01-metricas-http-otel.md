- De: 10
- Para: 01
- Onda: 4
- Status: aberto
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
