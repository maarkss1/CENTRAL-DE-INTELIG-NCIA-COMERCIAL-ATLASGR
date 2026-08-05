import { initTracing } from './src/lib/tracing.js';
initTracing();

import { env } from './src/config/env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { rateLimiterConnection } from './src/lib/queue/redis.js';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './src/lib/auth.js';
import { intelligenceRoutes } from './src/features/intelligence/routes/intelligence.routes.js';
import { promptRoutes } from './src/features/intelligence/routes/prompt.routes.js';
import { authenticateToken, type AuthRequest } from './src/shared/middlewares/authenticateToken.js';
import { requestContext } from './src/lib/async-context.js';
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
import { birthVoiceRoutes } from './src/features/integrations/birth-voice/birthVoice.routes.js';
import { birthVoiceWebhookRoutes } from './src/features/integrations/birth-voice/birthVoice.webhook.js';
import { googleRoutes } from './src/features/integrations/google/google.routes.js';
import { bitrixRoutes } from './src/features/integrations/bitrix/bitrix.routes.js';
import { teamRoutes } from './src/features/team/routes/team.routes.js';
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
import { createColdCallWorker, scheduleColdCallCampaigns } from './src/lib/queue/coldCall.worker.js';
import { createWhatsAppSignalWorker } from './src/lib/queue/whatsappSignal.worker.js';
import { enabledOrganizations } from './src/features/integrations/birth-voice/coldCall.service.js';
import { createSwarmSchedulerWorker, scheduleSwarmScheduler } from './src/lib/queue/swarmScheduler.worker.js';
import { enabledOrganizations as swarmSchedulerEnabledOrganizations } from './src/features/intelligence/services/swarmScheduler.service.js';
import { createBitrixSyncWorker, scheduleBitrixSync } from './src/lib/queue/bitrixSync.worker.js';
import { threecxRoutes, threecxWebhookRouter } from './src/features/integrations/threecx/threecx.routes.js';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'fs';

const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3005', 'http://localhost:3000', 'http://localhost:5173'];

const sendRateLimitCommand = (...args: string[]): Promise<RedisReply> =>
    rateLimiterConnection.call(args[0], ...args.slice(1)) as Promise<RedisReply>;

async function startServer() {
    const app = express();
    const PORT = parseInt(env.PORT, 10);

    // ── Segurança ──────────────────────────────────────────────────────────
    // CORREÇÃO: TRUST_PROXY definido em env.ts mas nunca aplicado aqui — sem isso
    // o rate limiter usava o IP do proxy reverso (sempre o mesmo) em vez do IP real
    // do cliente, tornando o limite ineficaz em produção atrás de um load balancer.
    if (env.TRUST_PROXY) {
        app.set('trust proxy', 1);
    }

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
            if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.railway.app')) return callback(null, true);
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

    // Rate Limiting — SEC-008b: 15 req/15min por TENANT (organizationId) nas rotas de IA, não por
    // IP. Por IP, um escritório inteiro atrás do mesmo NAT compartilha (e esgota) a cota de outras
    // organizações; por tenant, cada organização tem a sua própria cota isolada, e vários tenants
    // atrás do mesmo IP não se atrapalham. Exige identidade conhecida ANTES do limiter rodar, por
    // isso authenticateToken foi movido pra cá (e removido do mount tardio destas 3 rotas abaixo —
    // roda só uma vez, não duas).
    const aiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: env.AI_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        // ipKeyGenerator normaliza/trunca IPv6 corretamente pro fallback (sem isso, express-rate-limit
        // v8 recusa a config na subida: "Custom keyGenerator appears to use request IP without
        // calling the ipKeyGenerator helper... could allow IPv6 users to bypass limits").
        keyGenerator: (req) => (req as AuthRequest).user?.organizationId || ipKeyGenerator(req.ip || 'unknown'),
        store: env.NODE_ENV === 'production' ? new RedisStore({
            sendCommand: sendRateLimitCommand,
        }) : undefined,
        message: { success: false, error: 'Too many requests to AI services from this organization, please try again after 15 minutes' }
    });
    app.use('/api/intelligence', authenticateToken, aiLimiter);
    // As rotas de agentes (Swarm/SDR) também disparam chamadas de LLM e ficavam de
    // fora de qualquer limitador dedicado de IA, cobertas só pelo apiLimiter genérico.
    app.use('/api/agent', authenticateToken, aiLimiter);

    // A Base de Conhecimento gera embeddings a cada ingestão e a cada busca, então cai no mesmo
    // limite das rotas de IA — é o mesmo provedor e a mesma cota.
    app.use('/api/knowledge', authenticateToken, aiLimiter);

    // Rate Limiting dedicado e mais restritivo para autenticação — login/cadastro
    // não devem compartilhar a cota genérica de 600 req/15min usada pelo resto da
    // API, que é folgada demais para conter tentativas de força bruta/credential
    // stuffing contra contas específicas.
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        // get-session e o callback OAuth (GET) são checagens/redirecionamentos disparados
        // automaticamente pelo better-auth a cada carregamento de página — não são o vetor
        // de força bruta que este limiter existe para conter. Só POST (sign-in/sign-up/social)
        // consome a cota.
        skip: (req) => req.method === 'GET',
        store: env.NODE_ENV === 'production' ? new RedisStore({
            sendCommand: sendRateLimitCommand,
        }) : undefined,
        message: { success: false, error: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.' }
    });
    app.use('/api/auth', authLimiter);

    // Montado ANTES do express.json(): a autenticidade deste webhook é provada por uma assinatura
    // HMAC calculada sobre os bytes crus do corpo, que o parser global consumiria. Quem chama é o
    // Birth Voices Hub, não um usuário logado, por isso não passa por authenticateToken.
    app.use('/api/integrations/birth-voice', birthVoiceWebhookRoutes);
    app.use('/api/integrations/3cx/webhook', threecxWebhookRouter);

    app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
    // CORREÇÃO: JSON_BODY_LIMIT definida em env.ts (default '2mb') mas o valor
    // hardcoded '10mb' aqui sobrescrevia a configuração da env completamente.

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

    // ── Documentação da API (OpenAPI/Swagger) ─────────────────────────────
    // DOC-002: a API não tinha nenhuma documentação além do código-fonte das rotas. Montada em dev
    // por padrão, ou em qualquer ambiente quando EXPOSE_API_DOCS=true é setado explicitamente —
    // mesmo padrão de opt-in explícito usado por EXPOSE_METRICS/ENABLE_SEARCH (nunca ligado
    // implicitamente em produção).
    if (env.NODE_ENV !== 'production' || env.EXPOSE_API_DOCS) {
        try {
            const openApiDocument = parseYaml(
                readFileSync(path.join(process.cwd(), 'docs', 'openapi.yaml'), 'utf-8'),
            );
            app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
        } catch (err) {
            logger.warn({ err }, 'Falha ao carregar docs/openapi.yaml — /api-docs não foi montado');
        }
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
    // As tabelas Organization/user/session/account/verification têm tenant_isolation_policy via RLS
    // (app.current_tenant_id = organizationId). Login e validação de sessão acontecem
    // ANTES de descobrir o tenant do usuário — sem bypass explícito, a própria consulta
    // que descobriria o tenant é bloqueada pelo RLS, e login por e-mail/senha nunca
    // consegue ler o usuário (ver bypassRls em src/lib/async-context.ts e o allowlist de
    // models em src/lib/prisma.ts, que restringe esse bypass só às tabelas de identidade
    // do Better Auth). O isolamento de dados de negócio (companies, leads, etc.) continua
    // real: essas rotas passam por authenticateToken, que só concede tenantId real da sessão.
    const authHandler = toNodeHandler(auth);
    // CORREÇÃO: app.all captura todos os métodos HTTP, incluindo CONNECT e TRACE.
    // app.use é mais correto aqui: deixa o Better Auth decidir quais métodos aceita.
    app.use('/api/auth', (req, res) => {
        requestContext.run({ bypassRls: true }, () => authHandler(req, res));
    });

    // ── BullBoard (UI de Monitoramento de Filas) ──────────────────────────
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    createBullBoard({
        queues: [
            new BullMQAdapter(leadsQueue),
            new BullMQAdapter(searchQueue),
            new BullMQAdapter(agentQueue)
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
    // authenticateToken já rodou pra estas 3 (junto com o aiLimiter, ver SEC-008b acima) — só falta
    // requireTenant aqui, chamar de novo seria uma segunda consulta de sessão redundante.
    app.use('/api/intelligence', requireTenant, intelligenceRoutes);
    app.use('/api/prompts', authenticateToken, requireTenant, promptRoutes);
    app.use('/api/analytics', authenticateToken, requireTenant, analyticsRoutes);
    app.use('/api/knowledge', requireTenant, knowledgeRoutes);
    app.use('/api/notifications', authenticateToken, requireTenant, notificationRoutes);
    app.use('/api/automations', authenticateToken, requireTenant, automationRoutes);
    app.use('/api/usage', authenticateToken, requireTenant, usageRoutes);
    app.use('/api/whatsapp', authenticateToken, requireTenant, whatsappRoutes);
    app.use('/api/integrations/birth-voice', authenticateToken, requireTenant, birthVoiceRoutes);
    app.use('/api/integrations/3cx', authenticateToken, requireTenant, threecxRoutes);
    app.use('/api/google', authenticateToken, requireTenant, googleRoutes);
    app.use('/api/bitrix', authenticateToken, requireTenant, bitrixRoutes);
    app.use('/api/team', authenticateToken, requireTenant, teamRoutes);
    app.use('/api/agent', requireTenant, agentRoutes);

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

    app.listen(PORT, '0.0.0.0', () => {
        logger.info({ port: PORT, env: env.NODE_ENV }, `Server running on http://localhost:${PORT}`);
    });

    const leadsWorker = createLeadsWorker();
    const agentWorker = createAgentWorker();
    const enrichmentWorker = createEnrichmentWorker();
    const whatsappSignalWorker = createWhatsAppSignalWorker();
    const bitrixSyncWorker = createBitrixSyncWorker();
    scheduleBitrixSync().catch((err) => logger.error({ err }, 'Falha ao agendar a sincronização automática do Bitrix'));

    const searchWorker = env.ENABLE_SEARCH ? createSearchWorker() : null;
    if (env.ENABLE_SEARCH) {
        initMeiliIndexes().catch(() => logger.warn('Meilisearch offline'));
    }

    enabledOrganizations().then((coldCallOrgs) => {
        const coldCallWorker = coldCallOrgs.length > 0 ? createColdCallWorker() : null;
        if (coldCallWorker) {
            scheduleColdCallCampaigns().catch((err) =>
                logger.error({ err }, 'Falha ao agendar a campanha de prospecção fria'),
            );
        }
    }).catch(() => null);

    swarmSchedulerEnabledOrganizations().then((swarmOrgs) => {
        const swarmSchedulerWorker = swarmOrgs.length > 0 ? createSwarmSchedulerWorker() : null;
        if (swarmSchedulerWorker) {
            scheduleSwarmScheduler().catch((err) =>
                logger.error({ err }, 'Falha ao agendar o enxame autônomo'),
            );
        }
    }).catch(() => null);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`${signal} received: closing gracefully`);
        await leadsWorker.close();
        await agentWorker.close();
        await searchWorker?.close();
        await enrichmentWorker.close();
        await whatsappSignalWorker.close();
        await bitrixSyncWorker.close();
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
