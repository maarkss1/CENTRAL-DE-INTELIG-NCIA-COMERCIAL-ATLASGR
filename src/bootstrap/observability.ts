import type { Express } from 'express';
import client from 'prom-client';
import { env } from '../config/env.js';
import { httpMetricsMiddleware } from '../shared/middlewares/httpMetrics.js';
import { observabilityMiddleware } from '../shared/middlewares/observability.js';
import { requirePlatformOperator } from '../shared/middlewares/requirePlatformOperator.js';

/**
 * Métrica http_server_duration_milliseconds (prom-client), consumida pelo alerta
 * HighErrorRate5xx em infrastructure/observability/alert.rules.yml. Ver
 * .agents/handoffs/onda-4/10-para-01-metricas-http-otel.md — a auto-instrumentação OTel não
 * emite esta métrica com a versão instalada de instrumentation-http, então ela é medida aqui
 * manualmente. Precisa ser montada antes de qualquer rota (inclusive webhooks) para cobrir toda
 * requisição, só quando EXPOSE_METRICS está ligado (mesmo opt-in do endpoint /metrics abaixo).
 */
export function applyHttpMetricsMiddleware(app: Express): void {
  if (env.EXPOSE_METRICS) {
    app.use(httpMetricsMiddleware);
  }
}

/**
 * OBS-001: EXPOSE_METRICS existia em env.ts mas nunca era lida no bootstrap — /metrics ficava
 * sempre montado publicamente (sem autenticação), independentemente da flag.
 */
export function mountMetricsEndpoint(app: Express): void {
  if (!env.EXPOSE_METRICS) return;

  client.collectDefaultMetrics();
  // SEC-002 (Sprint 01/Onda 13): quando habilitado, /metrics não tem conceito de sessão de
  // usuário (é um endpoint de scraping, tipicamente chamado pelo Prometheus, não por um
  // navegador logado) — a trava aqui é só o token de operador de plataforma, configurado no
  // scraper como header `x-platform-operator-token` ou query `?operator_token=`.
  app.get('/metrics', requirePlatformOperator, async (_req, res) => {
    try {
      res.set('Content-Type', client.register.contentType);
      res.end(await client.register.metrics());
    } catch (ex) {
      res.status(500).end(ex);
    }
  });
}

/**
 * Middleware de correlação de requisição (requestId/correlationId/traceId), montado logo antes
 * das rotas protegidas — precisa rodar depois de auth/BullBoard (que não dependem dele) e antes
 * de toda rota de feature, mesma posição do server.ts original.
 */
export function applyRequestObservability(app: Express): void {
  app.use(observabilityMiddleware);
}
