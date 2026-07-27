import { initTracing } from './src/lib/tracing.js';
initTracing();

import { env } from './src/config/env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { connection } from './src/lib/queue/redis.js';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './src/lib/auth.js';
import { intelligenceRoutes } from './src/features/intelligence/routes/intelligence.routes.js';
import { promptRoutes } from './src/features/intelligence/routes/prompt.routes.js';
import { authenticateToken } from './src/shared/middlewares/authenticateToken.js';
import { requireTenant } from './src/shared/middlewares/authorization.js';
import { prisma } from './src/lib/prisma.js';
import { companyRoutes } from './src/features/companies/routes/company.routes.js';
import { contactRoutes } from './src/features/contacts/routes/contact.routes.js';
import { leadRoutes } from './src/features/crm/routes/lead.routes.js';
import { activityRoutes } from './src/features/activities/routes/activity.routes.js';
import { prospectingRoutes } from './src/features/prospecting/routes/prospecting.routes.js';
import { noteRoutes } from './src/features/notes/routes/note.routes.js';
import { analyticsRoutes } from './src/features/analytics/routes/analytics.routes.js';
import { errorHandler } from './src/shared/middlewares/errorHandler.js';
import { logger } from './src/lib/logger.js';
import { createLeadsWorker } from './src/lib/queue/index.js';
import { createAgentWorker } from './src/lib/queue/agent.worker.js';
import { createEnrichmentWorker } from './src/lib/queue/enrichment.queue.js';
import { createSearchWorker } from './src/lib/queue/search.queue.js';
import { initMeiliIndexes } from './src/lib/search/index.js';
import { observabilityMiddleware } from './src/shared/middlewares/observability.js';
import client from 'prom-client';
import { setupDI } from './src/shared/di/setup.js';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { leadsQueue } from './src/lib/queue/index.js';
import { searchQueue } from './src/lib/queue/search.queue.js';
import { agentQueue } from './src/lib/queue/agent.worker.js';
import { companyQueue, createCompanyWorker } from './src/lib/queue/company.worker.js';

const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : (env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173'] : []);

if (env.NODE_ENV === 'production' && ALLOWED_ORIGINS.length === 0) {
    console.error('FATAL ERROR: ALLOWED_ORIGINS is not set in production. Failing fast.');
    process.exit(1);
}

async function startServer() {
    const app = express();
    const PORT = parseInt(env.PORT, 10);

    // ── Segurança ──────────────────────────────────────────────────────────
    // Helmet adiciona cabeçalhos HTTP de segurança (X-Frame-Options, HSTS, etc.)
    app.use(helmet({
        contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    }));

    // CORS — permite qualquer origem em ambiente de desenvolvimento
    app.use(cors({
        origin: (origin, callback) => {
            // Permitir requests sem origin (Postman, curl, apps mobile)
            if (!origin) return callback(null, true);
            // Permitir todas as origens localmente para acesso na rede
            if (env.NODE_ENV !== 'production') return callback(null, true);
            if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
            callback(new Error(`CORS policy: origin ${origin} not allowed`));
        },
        credentials: true, // Necessário para Better Auth (cookies de sessão)
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compressão gzip/brotli — reduz tamanho de resposta até 70%
    app.use(compression());

    // Rate Limiting — 500 req/15min por IP nas rotas /api
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 500,
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
            sendCommand: (...args: string[]) => (connection.call as any)(...args),
        }),
        message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' }
    });
    app.use('/api', apiLimiter);

    // Rate Limiting — 15 req/15min por IP nas rotas /api/intelligence
    const aiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
            sendCommand: (...args: string[]) => (connection.call as any)(...args),
        }),
        message: { success: false, error: 'Too many requests to AI services from this IP, please try again after 15 minutes' }
    });
    app.use('/api/intelligence', aiLimiter);

    app.use(express.json({ limit: '10mb' }));

    // ── Metrics ────────────────────────────────────────────────────────────
    client.collectDefaultMetrics();
    app.get('/metrics', async (_req, res) => {
        try {
            res.set('Content-Type', client.register.contentType);
            res.end(await client.register.metrics());
        } catch (ex) {
            res.status(500).end(ex);
        }
    });

    // ── Health Checks ──────────────────────────────────────────────────────
    app.get('/health/live', (_req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.get('/health/ready', async (_req, res) => {
        try {
            await prisma.$queryRaw`SELECT 1`;
            res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
        } catch (error) {
            logger.error({ err: error }, 'Readiness probe failed');
            res.status(503).json({ status: 'error', message: 'Database unavailable' });
        }
    });

    // ── Auth (Better Auth) ─────────────────────────────────────────────────
    app.all('/api/auth/*', toNodeHandler(auth));

    // ── BullBoard (UI de Monitoramento de Filas) ──────────────────────────
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    createBullBoard({
        queues: [
            new BullMQAdapter(leadsQueue),
            new BullMQAdapter(searchQueue),
            new BullMQAdapter(agentQueue),
            new BullMQAdapter(companyQueue)
        ],
        serverAdapter: serverAdapter,
    });
    // Protegemos o painel de administração com autenticação
    app.use('/admin/queues', authenticateToken, requireTenant, serverAdapter.getRouter());

    // ── Rotas protegidas ───────────────────────────────────────────────────
    app.use(observabilityMiddleware);

    app.use('/api/companies', authenticateToken, requireTenant, companyRoutes);
    app.use('/api/contacts', authenticateToken, requireTenant, contactRoutes);
    app.use('/api/leads', authenticateToken, requireTenant, leadRoutes);
    app.use('/api/leads/:leadId/notes', authenticateToken, requireTenant, noteRoutes);
    app.use('/api/activities', authenticateToken, requireTenant, activityRoutes);
    app.use('/api/prospecting', authenticateToken, requireTenant, prospectingRoutes);
    app.use('/api/intelligence', authenticateToken, requireTenant, intelligenceRoutes);
    app.use('/api/prompts', authenticateToken, requireTenant, promptRoutes);
    app.use('/api/analytics', authenticateToken, requireTenant, analyticsRoutes);

    // ── Frontend ───────────────────────────────────────────────────────────
    if (env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    // ── Error Handler (deve ser o último middleware) ───────────────────────
    app.use(errorHandler);

    // ── Bootstrapping DI & Services ───────────────────────────────────────
    setupDI();
    const leadsWorker = createLeadsWorker();
    const agentWorker = createAgentWorker();
    const searchWorker = createSearchWorker();
    const companyWorker = createCompanyWorker();
    const enrichmentWorker = createEnrichmentWorker();
    await initMeiliIndexes();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`${signal} received: closing gracefully`);
        await leadsWorker.close();
        await agentWorker.close();
        await searchWorker.close();
        await companyWorker.close();
        await enrichmentWorker.close();
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    app.listen(PORT, '0.0.0.0', () => {
        logger.info({ port: PORT, env: env.NODE_ENV }, 'Server running');
    });
}

startServer();
