import { initTracing } from './src/lib/tracing.js';
initTracing();

import { env } from './src/config/env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { rateLimiterConnection } from './src/lib/queue/redis.js';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './src/lib/auth.js';
import { requestContext } from './src/lib/async-context.js';
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
import { whatsappRoutes } from './src/features/integrations/whatsapp/whatsapp.routes.js';
import { googleRoutes } from './src/features/integrations/google/google.routes.js';
import { agentRoutes } from './src/features/intelligence/routes/agent.routes.js';
import { knowledgeRoutes } from './src/features/knowledge/knowledge.routes.js';
import { notificationRoutes } from './src/features/notifications/notification.routes.js';
import { automationRoutes } from './src/features/automations/automation.routes.js';
import { usageRoutes } from './src/features/billing/usage.routes.js';
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

const sendRateLimitCommand = (...args: string[]): Promise<RedisReply> =>
    rateLimiterConnection.call(args[0], ...args.slice(1)) as Promise<RedisReply>;

async function startServer() {
    const app = express();
    const PORT = parseInt(env.PORT, 10);

    // ── Segurança ──────────────────────────────────────────────────────────
    // Helmet adiciona cabeçalhos HTTP de segurança (X-Frame-Options, HSTS, etc.)
    // CSP customizada (em vez do default implícito do Helmet) cobrindo os recursos
    // externos conhecidos da aplicação: Google Fonts, Font Awesome (cdnjs), áudio
    // ambiente do Welcome Screen (Pixabay) e o redirecionamento de login social do
    // Google via better-auth. Script-src permanece estrito ('self' apenas) — é o
    // vetor que a CSP existe para mitigar; style-src mantém 'unsafe-inline' porque
    // React aplica estilos inline via atributo `style` de forma extensiva no app.
    app.use(helmet({
        contentSecurityPolicy: env.NODE_ENV === 'production' ? {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
                imgSrc: ["'self'", 'data:', 'https:'],
                mediaSrc: ["'self'", 'https://cdn.pixabay.com'],
                connectSrc: ["'self'"],
                frameSrc: ["'self'", 'https://accounts.google.com'],
                formAction: ["'self'", 'https://accounts.google.com'],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
            },
        } : false,
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

    // Rate Limiting — API_RATE_LIMIT_MAX req/15min por IP nas rotas /api
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: env.API_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        store: env.NODE_ENV === 'production' ? new RedisStore({
            sendCommand: sendRateLimitCommand,
        }) : undefined,
        message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' }
    });
    app.use('/api', apiLimiter);

    // Rate Limiting — 15 req/15min por IP nas rotas /api/intelligence
    const aiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: env.AI_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        store: env.NODE_ENV === 'production' ? new RedisStore({
            sendCommand: sendRateLimitCommand,
        }) : undefined,
        message: { success: false, error: 'Too many requests to AI services from this IP, please try again after 15 minutes' }
    });
    app.use('/api/intelligence', aiLimiter);
    // As rotas de agentes (Swarm/SDR) também disparam chamadas de LLM e ficavam de
    // fora de qualquer limitador dedicado de IA, cobertas só pelo apiLimiter genérico.
    app.use('/api/agent', aiLimiter);

    // A Base de Conhecimento gera embeddings a cada ingestão e a cada busca, então cai no mesmo
    // limite das rotas de IA — é o mesmo provedor e a mesma cota.
    app.use('/api/knowledge', aiLimiter);

    // Rate Limiting dedicado e mais restritivo para autenticação — login/cadastro
    // não devem compartilhar a cota genérica de 600 req/15min usada pelo resto da
    // API, que é folgada demais para conter tentativas de força bruta/credential
    // stuffing contra contas específicas.
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        store: env.NODE_ENV === 'production' ? new RedisStore({
            sendCommand: sendRateLimitCommand,
        }) : undefined,
        message: { success: false, error: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.' }
    });
    app.use('/api/auth', authLimiter);

    app.use(express.json({ limit: '10mb' }));

    // ── Metrics ────────────────────────────────────────────────────────────
    // OBS-001: EXPOSE_METRICS existia em env.ts mas nunca era lida aqui — /metrics ficava sempre
    // montado publicamente (sem autenticação), independentemente da flag.
    if (env.EXPOSE_METRICS) {
        client.collectDefaultMetrics();
        app.get('/metrics', async (_req, res) => {
            try {
                res.set('Content-Type', client.register.contentType);
                res.end(await client.register.metrics());
            } catch (ex) {
                res.status(500).end(ex);
            }
        });
    }

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
    // As tabelas user/session/account/verification têm tenant_isolation_policy via RLS
    // (app.current_tenant_id = organizationId). Login e validação de sessão acontecem
    // ANTES de descobrir o tenant do usuário — sem bypass explícito, a própria consulta
    // que descobriria o tenant é bloqueada pelo RLS, e login por e-mail/senha nunca
    // consegue ler o usuário (ver src/lib/prisma.ts::bypassRls, que já previa esse
    // escape hatch mas nunca era setado em lugar nenhum). O isolamento de dados de
    // negócio (companies, leads, etc.) continua real: essas rotas passam por
    // authenticateToken, que só concede bypassRls=false + tenantId real da sessão.
    app.all('/api/auth/*', (req, res) => {
        requestContext.run({ bypassRls: true }, () => toNodeHandler(auth)(req, res));
    });

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
    app.use('/api/knowledge', authenticateToken, requireTenant, knowledgeRoutes);
    app.use('/api/notifications', authenticateToken, requireTenant, notificationRoutes);
    app.use('/api/automations', authenticateToken, requireTenant, automationRoutes);
    app.use('/api/usage', authenticateToken, requireTenant, usageRoutes);
    app.use('/api/whatsapp', authenticateToken, requireTenant, whatsappRoutes);
    app.use('/api/google', authenticateToken, requireTenant, googleRoutes);
    app.use('/api/agent', authenticateToken, requireTenant, agentRoutes);

    // Qualquer /api/* que não bateu em nenhuma rota acima deve 404 aqui, e nunca
    // cair no fallback do Vite/SPA abaixo: em dev, `vite.middlewares` reprocessa
    // requisições sem arquivo correspondente e isso re-executa toda a cadeia de
    // middlewares (incluindo o apiLimiter) repetidamente para a mesma requisição,
    // estourando o rate limit em segundos com uma única chamada a um endpoint
    // inexistente (ex.: /api/analytics/overview, que nunca teve rota registrada).
    app.use('/api', (_req, res) => {
        res.status(404).json({ success: false, error: 'Not found' });
    });

    // ── Frontend ───────────────────────────────────────────────────────────
    if (env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true, host: true, allowedHosts: true },
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
    const companyWorker = createCompanyWorker();
    const enrichmentWorker = createEnrichmentWorker();
    // OBS-001: ENABLE_SEARCH existia em env.ts mas nunca era lida aqui — o worker de indexação e a
    // inicialização do Meilisearch sempre rodavam, independentemente da flag.
    const searchWorker = env.ENABLE_SEARCH ? createSearchWorker() : null;
    if (env.ENABLE_SEARCH) {
        await initMeiliIndexes().catch(() => logger.warn('Meilisearch offline'));
    }

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`${signal} received: closing gracefully`);
        await leadsWorker.close();
        await agentWorker.close();
        await searchWorker?.close();
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
