import { initTracing } from './src/lib/tracing.js';
initTracing();

// Registrado logo no boot: sem Redis configurado, comandos internos do BullMQ rejeitam com
// "Connection is closed." fora de qualquer await nosso, e a rejeicao nao tratada derrubava o
// processo poucos segundos depois de o servidor subir (deploy falhando com status 1).
import { registerProcessGuards } from './src/lib/process-guards.js';
registerProcessGuards();

import express from 'express';
import { env } from './src/config/env.js';
import { logger } from './src/lib/logger.js';
import { prisma } from './src/lib/prisma.js';
import { shutdownLangfuse } from './src/lib/langfuse.js';
import { connection, rateLimiterConnection, cacheConnection } from './src/lib/queue/redis.js';
import { sseService } from './src/features/notifications/sse.service.js';
import { errorHandler } from './src/shared/middlewares/errorHandler.js';

import { assertAllowedOriginsConfigured, applySecurityMiddleware } from './src/bootstrap/security.js';
import { applyRateLimiters } from './src/bootstrap/rateLimiters.js';
import { mountPreJsonWebhooks } from './src/bootstrap/webhooks.js';
import { applyHttpMetricsMiddleware, mountMetricsEndpoint, applyRequestObservability } from './src/bootstrap/observability.js';
import { mountApiDocs } from './src/bootstrap/apiDocs.js';
import { mountHealthChecks } from './src/bootstrap/healthchecks.js';
import { mountAuthHandler } from './src/bootstrap/auth.js';
import { mountBullBoard } from './src/bootstrap/bullBoard.js';
import { mountFeatureRoutes } from './src/bootstrap/routes.js';
import { mountFrontend } from './src/bootstrap/frontend.js';
import { startEmbeddedWorkers } from './src/bootstrap/workers.js';
import { createGracefulShutdown, registerShutdownSignals } from './src/bootstrap/shutdown.js';
import { bootstrapApplicationServices } from './src/bootstrap/appServices.js';

// Falha rápido no boot, antes de qualquer outra etapa, se a aplicação subiria "saudável" em
// produção mas rejeitando todo tráfego real por CORS — ver src/bootstrap/security.ts.
assertAllowedOriginsConfigured();

async function startServer() {
    const app = express();
    const PORT = parseInt(env.PORT, 10);

    // ── Segurança de borda (trust proxy, Helmet, CORS, compressão) ─────────
    applySecurityMiddleware(app);

    // ── Métrica de duração HTTP (opt-in via EXPOSE_METRICS) ─────────────────
    applyHttpMetricsMiddleware(app);

    // ── Rate limiting por rota ───────────────────────────────────────────────
    applyRateLimiters(app);

    // ── Webhooks montados antes do parser JSON global ───────────────────────
    mountPreJsonWebhooks(app);

    app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
    // CORREÇÃO: JSON_BODY_LIMIT definida em env.ts (default '2mb') mas um valor hardcoded '10mb'
    // sobrescrevia a configuração da env completamente — corrigido usando env.JSON_BODY_LIMIT.

    // ── Métricas Prometheus, documentação da API e health checks ────────────
    mountMetricsEndpoint(app);
    mountApiDocs(app);
    mountHealthChecks(app);

    // ── Auth (Better Auth) e UI de monitoramento de filas ────────────────────
    mountAuthHandler(app);
    mountBullBoard(app);

    // ── Rotas protegidas de todos os módulos de feature ──────────────────────
    applyRequestObservability(app);
    mountFeatureRoutes(app);

    // ── Frontend (Vite em dev, estáticos buildados em produção) ─────────────
    await mountFrontend(app);

    // ── Error Handler (deve ser o último middleware) ─────────────────────────
    app.use(errorHandler);

    // ── Serviços de aplicação (DI, sincronização de feature flags) ──────────
    bootstrapApplicationServices();

    const server = app.listen(PORT, '0.0.0.0', () => {
        logger.info({ port: PORT, env: env.NODE_ENV }, `Server running on http://localhost:${PORT}`);
    });

    // ── Workers embutidos (gated por ENABLE_EMBEDDED_WORKERS) ────────────────
    const workers = startEmbeddedWorkers();

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    const shutdown = createGracefulShutdown({
        httpServer: server,
        workers,
        sseService,
        prisma,
        shutdownLangfuse,
        connection,
        rateLimiterConnection,
        cacheConnection,
        logger,
    });
    registerShutdownSignals(shutdown);
}

startServer().catch((err) => {
    logger.fatal({ err }, 'server.ts: falha fatal no bootstrap — encerrando o processo');
    process.exit(1);
});
