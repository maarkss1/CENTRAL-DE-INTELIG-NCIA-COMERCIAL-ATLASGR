import { logger } from './logger.js';

let sdkInstance: { start: () => void; shutdown: () => Promise<void> } | null = null;

export function initTracing() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { NodeSDK } = require('@opentelemetry/sdk-node');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

        sdkInstance = new NodeSDK({
            traceExporter: new OTLPTraceExporter(),
            // Antes desta mudança, o NodeSDK só registrava traceExporter — NENHUMA métrica saía da
            // aplicação (mesmo as automáticas de runtime/GC do Node), porque sem metricReader não
            // existe MeterProvider nenhum para as instrumentações reportarem. O otel-collector
            // (infrastructure/observability/otel-collector.yml, dono: Agente 10) já recebe OTLP e
            // expõe Prometheus em :9464 — faltava só a aplicação enviar métricas via OTLP também,
            // não só traces. Ver handoff .agents/handoffs/onda-4/10-para-01-metricas-http-otel.md.
            // VALIDADO localmente (Agente 01, Onda 5): com este metricReader, métricas de
            // runtime/GC (nodejs_eventloop_*, v8js_*) chegam de fato em :9464/metrics via
            // @opentelemetry/instrumentation-runtime-node. A métrica HTTP específica que o alerta
            // HighErrorRate5xx (alert.rules.yml) espera (http.server.duration /
            // http_server_duration_milliseconds_*) NÃO apareceu nos testes locais com a versão
            // instalada de @opentelemetry/auto-instrumentations-node (^0.78.0) / instrumentation-http
            // (^0.220.0), mesmo com OTEL_SEMCONV_STABILITY_OPT_IN=http — pendência registrada de
            // volta para o Agente 10 no handoff acima, não resolvida por completo aqui.
            metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
            instrumentations: [getNodeAutoInstrumentations()],
        });

        sdkInstance?.start();
        logger.info('OpenTelemetry initialized');

        process.on('SIGTERM', () => {
            sdkInstance?.shutdown()
                .then(() => logger.info('Tracing terminated'))
                .catch((error) => logger.error({ err: error }, 'Error terminating tracing'))
                .finally(() => process.exit(0));
        });
    } catch {
        logger.warn('OpenTelemetry disabled or dependencies not installed.');
    }
}

