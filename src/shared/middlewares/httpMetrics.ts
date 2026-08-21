import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

/**
 * Métrica Prometheus de duração de requisição HTTP, expondo o mesmo nome de série que
 * `infrastructure/observability/alert.rules.yml` → `HighErrorRate5xx` já espera
 * (`http_server_duration_milliseconds_*` com o label `http_status_code`).
 *
 * Handoff `.agents/handoffs/onda-4/10-para-01-metricas-http-otel.md`: a auto-instrumentação OTel
 * (`getNodeAutoInstrumentations()` em `src/lib/tracing.ts`) foi confirmada emitindo métricas de
 * runtime/GC via OTLP → otel-collector, mas NÃO a métrica de duração HTTP por status code, com a
 * versão instalada de `@opentelemetry/instrumentation-http` (verificado em duas rodadas, Onda 5 e
 * Onda 8). O handoff propunha 3 caminhos; este módulo aplica a opção (c) — medir manualmente — mas
 * via `prom-client`, não `@opentelemetry/api`, para reusar o mesmo registro/endpoint `/metrics`
 * (`server.ts`, condicional a `EXPOSE_METRICS`) já usado por toda outra métrica custom deste
 * projeto (`src/lib/ai/metrics.ts`, `src/lib/queue/metrics.ts`), em vez de depender de um segundo
 * pipeline de exportação (OTLP → otel-collector → `:9464`) só para esta série.
 */
export const httpServerDurationMs = new client.Histogram({
    name: 'http_server_duration_milliseconds',
    help: 'Duração de requisições HTTP em milissegundos, por método, rota e status code.',
    labelNames: ['method', 'route', 'http_status_code'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

/**
 * Usa `req.route.path` (padrão da rota, ex.: `/api/leads/:id`) em vez de `req.url` para o label
 * `route` — evita explosão de cardinalidade por id/UUID na série do Prometheus. Quando o Express
 * ainda não resolveu a rota (404, erro antes do roteamento), cai para `'unmatched'`.
 */
function resolveRouteLabel(req: Request): string {
    const mountPath = typeof req.baseUrl === 'string' ? req.baseUrl : '';
    const routePath = (req.route as { path?: string } | undefined)?.path;
    if (!routePath) return 'unmatched';
    return `${mountPath}${routePath}` || 'unmatched';
}

export const httpMetricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        httpServerDurationMs.observe(
            {
                method: req.method,
                route: resolveRouteLabel(req),
                http_status_code: String(res.statusCode),
            },
            durationMs,
        );
    });

    next();
};
