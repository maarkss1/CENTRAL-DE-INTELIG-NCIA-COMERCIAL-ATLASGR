import { initTracing } from './src/lib/tracing.js';
initTracing();

// Registrado logo no boot: sem Redis configurado, comandos internos do BullMQ rejeitam com
// "Connection is closed." fora de qualquer await nosso, e a rejeicao nao tratada derrubava o
// processo poucos segundos depois de o servidor subir (deploy falhando com status 1).
import { registerProcessGuards } from './src/lib/process-guards.js';
registerProcessGuards();

import { env } from './src/config/env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { rateLimiterConnection, queuesEnabled, connection, cacheConnection } from './src/lib/queue/redis.js';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './src/lib/auth.js';
import { intelligenceRoutes } from './src/features/intelligence/routes/intelligence.routes.js';
import { promptRoutes } from './src/features/intelligence/routes/prompt.routes.js';
import { authenticateToken, type AuthRequest } from './src/shared/middlewares/authenticateToken.js';
import { requestContext } from './src/lib/async-context.js';
import { requireTenant } from './src/shared/middlewares/authorization.js';
import { requireRole } from './src/shared/middlewares/requireRole.js';
import { COMMERCIAL_INTELLIGENCE_ROLES } from './src/lib/auth/authorization.js';
import { prisma } from './src/lib/prisma.js';
import { shutdownLangfuse } from './src/lib/langfuse.js';
import { companyRoutes } from './src/features/companies/routes/company.routes.js';
import { contactRoutes } from './src/features/contacts/routes/contact.routes.js';
import { leadRoutes } from './src/features/crm/routes/lead.routes.js';
import { crm360Routes } from './src/features/crm360/routes/crm360.routes.js';
import { activityRoutes } from './src/features/activities/routes/activity.routes.js';
import { mesaTratamentoRoutes } from './src/features/mesa-tratamento/routes/mesaTratamento.routes.js';
import { prospectingRoutes } from './src/features/prospecting/routes/prospecting.routes.js';
import { prospectingToolsRoutes } from './src/features/prospecting/routes/prospecting-tools.routes.js';
import { noteRoutes } from './src/features/notes/routes/note.routes.js';
import { analyticsRoutes } from './src/features/analytics/routes/analytics.routes.js';
import { commercialIntelligenceRoutes } from './src/features/commercial-intelligence/routes/commercialIntelligence.routes.js';
import { whatsappRoutes } from './src/features/integrations/whatsapp/whatsapp.routes.js';
import { birthVoiceRoutes } from './src/features/integrations/birth-voice/birthVoice.routes.js';
import { birthVoiceWebhookRoutes } from './src/features/integrations/birth-voice/birthVoice.webhook.js';
import { voiceResultWebhookRoutes } from './src/features/integrations/birth-voice/voiceResult.webhook.js';
import { googleRoutes } from './src/features/integrations/google/google.routes.js';
import { bitrixRoutes } from './src/features/integrations/bitrix/bitrix.routes.js';
import { bitrixWebhookRoutes } from './src/features/integrations/bitrix/bitrix.webhook.js';
import { teamRoutes } from './src/features/team/routes/team.routes.js';
import { authExtraRoutes } from './src/features/auth/routes/auth-extra.routes.js';
import { agentRoutes } from './src/features/intelligence/routes/agent.routes.js';
import { knowledgeRoutes } from './src/features/knowledge/knowledge.routes.js';
import { notificationRoutes } from './src/features/notifications/notification.routes.js';
import { automationRoutes } from './src/features/automations/routes/automation.routes.js';
import { usageRoutes } from './src/features/billing/usage.routes.js';
import { cadenceRoutes } from './src/features/cadence/cadence.routes.js';
import { marketIntelligenceRoutes } from './src/features/market-intelligence/server/marketIntelligence.routes.js';
import { sseService } from './src/features/notifications/sse.service.js';
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
import { createFollowUpWorker, scheduleFollowUpJobs } from './src/features/crm/jobs/followUp.worker.js';
import { createExecutiveSummaryWorker, scheduleExecutiveSummaryJob } from './src/features/crm/jobs/dailyExecutiveSummary.worker.js';
import { createDeduplicationWorker, scheduleDeduplicationJob } from './src/features/crm/jobs/deduplication.worker.js';
import { createWinLossAnalysisWorker, scheduleWinLossAnalysisJob } from './src/features/intelligence/services/winLossAnalysis.worker.js';
import { createWeeklyPdfReportWorker, scheduleWeeklyPdfReportJob } from './src/features/crm/jobs/weeklyPdfReport.worker.js';
import { createAutoAnonymizeWorker, scheduleAutoAnonymizeJob } from './src/features/crm/jobs/autoAnonymizeDisqualified.worker.js';
import { lgpdRouter } from './src/features/lgpd/lgpd.routes.js';
import { featureFlagsRouter } from './src/features/feature-flags/featureFlags.routes.js';
import { featureFlagsService } from './src/features/feature-flags/featureFlags.service.js';
import { bugReportRouter } from './src/features/bug-reports/bugReport.routes.js';
import { threecxRoutes, threecxWebhookRouter } from './src/features/integrations/threecx/threecx.routes.js';
import { createColdLeadsScannerWorker, scheduleColdLeadsScannerJob } from './src/features/automations/application/cold-leads-scanner.service.js';
import { createStagnationScannerWorker, scheduleStagnationScannerJob } from './src/features/automations/application/stagnation-scanner.service.js';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'fs';

const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3005', 'http://localhost:3000', 'http://localhost:5173'];

// Sem isto, esquecer de definir ALLOWED_ORIGINS em produção fazia o servidor subir "com sucesso"
// mas só aceitando as origens de localhost do fallback acima — todo tráfego do frontend real de
// produção era rejeitado por CORS, uma falha silenciosa e difícil de diagnosticar (o deploy parece
// saudável nos logs). Falhar rápido aqui torna o erro óbvio no boot em vez de um mistério em runtime.
if (env.NODE_ENV === 'production' && !env.ALLOWED_ORIGINS) {
    console.error('FATAL ERROR: ALLOWED_ORIGINS não está definida em produção. Encerrando.');
    process.exit(1);
}

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
            // CORREÇÃO: `origin.endsWith('.railway.app')` liberava CORS com credentials:true (cookies
            // de sessão) pra QUALQUER subdomínio railway.app, não só o desta aplicação — qualquer
            // outro app hospedado no Railway podia fazer requisições autenticadas contra esta API.
            // O domínio real de produção (ex: seu-app.up.railway.app) deve estar listado explicitamente
            // em ALLOWED_ORIGINS, igual a qualquer outra origem.
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
        // Sem queuesEnabled (nenhum Redis configurado), a conexão já esgotou as retries e fica
        // permanentemente "closed" — usar RedisStore nesse estado faz TODA requisição rejeitar
        // com throw em vez de aplicar o limite, derrubando a rota inteira (inclusive health
        // checks) com 500. Cai pro store em memória do próprio express-rate-limit, igual ao que
        // já acontece fora de produção — limite por processo em vez de compartilhado entre
        // instâncias, mas funcional, que é estritamente melhor do que a API inteira fora do ar.
        store: env.NODE_ENV === 'production' && queuesEnabled ? new RedisStore({
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
        // Ver comentário do apiLimiter acima sobre o `&& queuesEnabled`.
        store: env.NODE_ENV === 'production' && queuesEnabled ? new RedisStore({
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
        max: env.AUTH_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        // get-session e o callback OAuth (GET) são checagens/redirecionamentos disparados
        // automaticamente pelo better-auth a cada carregamento de página — não são o vetor
        // de força bruta que este limiter existe para conter. Só POST (sign-in/sign-up/social)
        // consome a cota.
        skip: (req) => req.method === 'GET',
        // Ver comentário do apiLimiter acima sobre o `&& queuesEnabled`.
        store: env.NODE_ENV === 'production' && queuesEnabled ? new RedisStore({
            sendCommand: sendRateLimitCommand,
        }) : undefined,
        message: { success: false, error: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.' }
    });
    app.use('/api/auth', authLimiter);

    // Rate Limiting dedicado do módulo "Reportar Problema" — por organização (mesmo raciocínio
    // do aiLimiter/SEC-008b), bem mais apertado que o apiLimiter genérico: ninguém legítimo
    // reporta dezenas de bugs em 15 minutos, e cada relato grava uma linha JSONB no banco.
    const bugReportLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: env.BUG_REPORT_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => (req as AuthRequest).user?.organizationId || ipKeyGenerator(req.ip || 'unknown'),
        // Ver comentário do apiLimiter acima sobre o `&& queuesEnabled`.
        store: env.NODE_ENV === 'production' && queuesEnabled ? new RedisStore({
            sendCommand: sendRateLimitCommand,
        }) : undefined,
        message: { success: false, error: 'Muitos relatos de problema enviados. Tente novamente em 15 minutos.' }
    });
    app.use('/api/bug-reports', authenticateToken, bugReportLimiter);

    // Montado ANTES do express.json(): a autenticidade deste webhook é provada por uma assinatura
    // HMAC calculada sobre os bytes crus do corpo, que o parser global consumiria. Quem chama é o
    // Birth Voices Hub, não um usuário logado, por isso não passa por authenticateToken.
    app.use('/api/integrations/birth-voice', birthVoiceWebhookRoutes);
    app.use('/api/integrations/3cx/webhook', threecxWebhookRouter);

    // Webhook de resultado de chamadas de voz da Bland AI. O handler vive em
    // voiceResult.webhook.ts: o inline anterior tinha segredo com fallback hardcoded, busca de
    // lead cross-tenant sem RLS, nenhuma idempotência e req.body undefined (montado antes do
    // express.json() global sem parser próprio) — ver o comentário no topo daquele arquivo.
    app.use('/api/webhooks/voice-result', voiceResultWebhookRoutes);
    // Webhook de ENTRADA do Bitrix24 ("исходящий вебхук"): autenticidade provada por um segredo
    // por conexão (auth.application_token) comparado dentro da própria rota, não por header HMAC
    // — é o modelo de autenticação real que o Bitrix24 usa pra esse tipo de webhook (ver
    // bitrix.webhook.ts). Parser próprio (urlencoded, não json) porque o Bitrix envia form-encoded.
    app.use('/api/integrations/bitrix', bitrixWebhookRoutes);

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
            const openApiYaml = readFileSync(path.join(process.cwd(), 'docs', 'openapi.yaml'), 'utf-8');
            const openApiDocument = parseYaml(openApiYaml);
            // Spec bruta, registrada antes da Swagger UI abaixo para não ser interceptada pelo
            // middleware estático dela — é o que scanners como o ZAP (docker-compose.opensource.yml,
            // security:zap) precisam buscar; a UI em si serve HTML, não o YAML.
            app.get('/api-docs/openapi.yaml', (_req, res) => {
                res.type('application/yaml').send(openApiYaml);
            });
            app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
        } catch (err) {
            logger.warn({ err }, 'Falha ao carregar docs/openapi.yaml — /api-docs não foi montado');
        }
    }

    // ── Health Checks ──────────────────────────────────────────────────────
    const handleLiveness = (_req: any, res: any) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    };

    const handleReadiness = async (_req: any, res: any) => {
        try {
            await prisma.$queryRaw`SELECT 1`;
            if (queuesEnabled) {
                await connection.ping();
            }
            res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
        } catch (error) {
            logger.error({ err: error }, 'Readiness probe failed');
            res.status(503).json({ status: 'error', message: 'Database or Redis unavailable' });
        }
    };

    app.get('/health/live', handleLiveness);
    app.get('/healthz', handleLiveness);
    app.get('/health/ready', handleReadiness);
    app.get('/readyz', handleReadiness);

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
    if (queuesEnabled && leadsQueue && searchQueue && agentQueue) {
        createBullBoard({
            queues: [
                new BullMQAdapter(leadsQueue),
                new BullMQAdapter(searchQueue),
                new BullMQAdapter(agentQueue)
            ],
            serverAdapter,
        });
    }
    // Painel administrativo de filas: além de autenticação, exige papel ADMIN — os jobs exibidos
    // aqui carregam dados de TODAS as organizações (filas são globais, não por tenant), então
    // qualquer usuário comum autenticado poder abrir isso era exposição cross-tenant. Restringir a
    // ADMIN reduz a superfície ao papel mais alto existente; o risco residual (ADMIN de uma
    // organização enxergar jobs de outra) fica documentado no relatório de segurança.
    app.use('/admin/queues', authenticateToken, requireTenant, requireRole(['ADMIN']), serverAdapter.getRouter());

    // ── Rotas protegidas ───────────────────────────────────────────────────
    app.use(observabilityMiddleware);

    app.use('/api/companies', authenticateToken, requireTenant, companyRoutes);
    app.use('/api/contacts', authenticateToken, requireTenant, contactRoutes);
    app.use('/api/leads', authenticateToken, requireTenant, leadRoutes);
    app.use('/api/crm', authenticateToken, requireTenant, crm360Routes);
    app.use('/api/leads/:leadId/notes', authenticateToken, requireTenant, noteRoutes);
    app.use('/api/activities', authenticateToken, requireTenant, activityRoutes);
    app.use('/api/mesa-tratamento', authenticateToken, requireTenant, mesaTratamentoRoutes);
    app.use('/api/prospecting', authenticateToken, requireTenant, prospectingRoutes);
    app.use('/api/prospecting/tools', authenticateToken, requireTenant, prospectingToolsRoutes);
    // authenticateToken já rodou pra estas 3 (junto com o aiLimiter, ver SEC-008b acima) — só falta
    // requireTenant aqui, chamar de novo seria uma segunda consulta de sessão redundante.
    app.use('/api/intelligence', requireTenant, intelligenceRoutes);
    app.use('/api/prompts', authenticateToken, requireTenant, promptRoutes);
    app.use('/api/analytics', authenticateToken, requireTenant, analyticsRoutes);
    // Comercial Inteligente — módulo executivo restrito (ver AGENTS.md/CLAUDE.md e
    // src/lib/auth/authorization.ts). `requireRole` aqui é defesa em profundidade: o router em
    // commercialIntelligence.routes.ts já se protege sozinho (router.use(requireRole(...))), mas
    // o mount explícito garante que NENHUM caminho de acesso a este módulo (direto por URL,
    // include futuro em outro arquivo, etc.) escapa da checagem de papel no servidor.
    app.use('/api/commercial-intelligence', authenticateToken, requireTenant, requireRole([...COMMERCIAL_INTELLIGENCE_ROLES]), commercialIntelligenceRoutes);
    app.use('/api/knowledge', requireTenant, knowledgeRoutes);
    app.use('/api/lgpd', authenticateToken, requireTenant, lgpdRouter);
    app.use('/api/feature-flags', authenticateToken, requireTenant, featureFlagsRouter);
    // authenticateToken + bugReportLimiter já rodaram pra esta rota (ver acima, junto aos demais
    // rate limiters) — só falta requireTenant aqui, mesmo padrão de /api/intelligence.
    app.use('/api/bug-reports', requireTenant, bugReportRouter);
    app.use('/api/notifications', authenticateToken, requireTenant, notificationRoutes);
    
    app.get('/api/notifications/stream', authenticateToken, requireTenant, (req, res) => {
        const { organizationId } = (req as AuthRequest).user;
        sseService.addClient(req, res, organizationId);
    });

    app.use('/api/automations', authenticateToken, requireTenant, automationRoutes);
    app.use('/api/usage', authenticateToken, requireTenant, usageRoutes);
    app.use('/api/whatsapp', authenticateToken, requireTenant, whatsappRoutes);
    app.use('/api/integrations/birth-voice', authenticateToken, requireTenant, birthVoiceRoutes);
    app.use('/api/integrations/3cx', authenticateToken, requireTenant, threecxRoutes);
    app.use('/api/google', authenticateToken, requireTenant, googleRoutes);
    app.use('/api/bitrix', authenticateToken, requireTenant, bitrixRoutes);
    app.use('/api/team', authenticateToken, requireTenant, teamRoutes);
    app.use('/api/auth-extra', authenticateToken, requireTenant, authExtraRoutes);
    app.use('/api/agent', requireTenant, agentRoutes);
    app.use('/api/cadence', authenticateToken, requireTenant, cadenceRoutes);
    app.use('/api/market-intelligence', authenticateToken, requireTenant, marketIntelligenceRoutes);

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

    // Sincroniza o catálogo de feature flags (FEATURE_FLAG_REGISTRY) com a tabela FeatureFlag —
    // idempotente, roda a cada boot. Não bloqueia a subida do servidor por um erro aqui (ex.:
    // banco temporariamente indisponível): loga e segue, mesmo raciocínio de outros jobs de
    // agendamento abaixo (scheduleColdCallCampaigns/scheduleSwarmScheduler). `bypassRls: true` é
    // necessário aqui: roda antes de qualquer request HTTP existir, sem tenant conhecido — ver
    // FeatureFlag em BYPASS_RLS_ALLOWED_MODELS (src/lib/prisma.ts) para o porquê de ser seguro.
    requestContext.run({ bypassRls: true }, () =>
        featureFlagsService.syncRegistry().catch((err) =>
            logger.error({ err }, 'Falha ao sincronizar catálogo de feature flags no boot')
        )
    );

    const server = app.listen(PORT, '0.0.0.0', () => {
        logger.info({ port: PORT, env: env.NODE_ENV }, `Server running on http://localhost:${PORT}`);
    });

    // Gated por ENABLE_EMBEDDED_WORKERS: um BullMQ Worker (diferente de uma Queue) conecta no Redis
    // avidamente ao ser criado — sem Redis disponível, isso derruba o processo.
    // Agora isolado: apenas criados no server.ts se explícito. Senão, eles rodam no worker.ts.
    const embeddedWorkersEnabled = queuesEnabled && env.ENABLE_EMBEDDED_WORKERS;

    const leadsWorker = embeddedWorkersEnabled ? createLeadsWorker() : null;
    const agentWorker = embeddedWorkersEnabled ? createAgentWorker() : null;
    const enrichmentWorker = embeddedWorkersEnabled ? createEnrichmentWorker() : null;
    const whatsappSignalWorker = embeddedWorkersEnabled ? createWhatsAppSignalWorker() : null;
    const bitrixSyncWorker = embeddedWorkersEnabled ? createBitrixSyncWorker() : null;
    const followUpWorker = embeddedWorkersEnabled ? createFollowUpWorker() : null;
    const execSummaryWorker = embeddedWorkersEnabled ? createExecutiveSummaryWorker() : null;
    const deduplicationWorker = embeddedWorkersEnabled ? createDeduplicationWorker() : null;
    const winLossWorker = embeddedWorkersEnabled ? createWinLossAnalysisWorker() : null;
    const pdfWorker = embeddedWorkersEnabled ? createWeeklyPdfReportWorker() : null;
    const autoAnonymizeWorker = embeddedWorkersEnabled ? createAutoAnonymizeWorker() : null;
    const coldLeadsScannerWorker = embeddedWorkersEnabled ? createColdLeadsScannerWorker() : null;
    const stagnationScannerWorker = embeddedWorkersEnabled ? createStagnationScannerWorker() : null;

    // Sem Redis, `.add()` chega a enfileirar o comando e falha ao dar baixa nas retries —
    // o próprio `.catch()` abaixo não é suficiente pra cobrir esse caminho interno do BullMQ,
    // que já causou uma promise rejection não tratada (derrubando o processo) mesmo com ele.
    if (embeddedWorkersEnabled) {
        scheduleBitrixSync().catch((err) => logger.error({ err }, 'Falha ao agendar a sincronização automática do Bitrix'));
        scheduleFollowUpJobs().catch((err) => logger.error({ err }, 'Falha ao agendar jobs de follow-up'));
        scheduleExecutiveSummaryJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de summary executivo'));
        scheduleDeduplicationJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de deduplicacao'));
        scheduleWinLossAnalysisJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de win/loss analysis'));
        scheduleWeeklyPdfReportJob().catch((err) => logger.error({ err }, 'Falha ao agendar job do pdf semanal'));
        scheduleAutoAnonymizeJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de anonimização automática'));
        scheduleColdLeadsScannerJob().catch((err) => logger.error({ err }, 'Falha ao agendar job do cold leads scanner'));
        scheduleStagnationScannerJob().catch((err) => logger.error({ err }, 'Falha ao agendar job do stagnation scanner'));
    }

    const searchWorker = embeddedWorkersEnabled && env.ENABLE_SEARCH ? createSearchWorker() : null;
    if (queuesEnabled && env.ENABLE_SEARCH) {
        initMeiliIndexes().catch(() => logger.warn('Meilisearch offline'));
    }

    // Hoisted pro escopo da função (não dentro do `.then()`) de propósito: precisam continuar
    // acessíveis em `shutdown()` abaixo. Antes estavam declarados como `const` dentro do próprio
    // `.then()`, saindo de escopo — SIGTERM/SIGINT fechavam todos os outros workers mas nunca estes
    // dois, arriscando job duplicado (ex: discar duas vezes pro mesmo lead) depois de um restart.
    let coldCallWorker: ReturnType<typeof createColdCallWorker> | null = null;
    let swarmSchedulerWorker: ReturnType<typeof createSwarmSchedulerWorker> | null = null;

    enabledOrganizations().then((coldCallOrgs) => {
        coldCallWorker = embeddedWorkersEnabled && coldCallOrgs.length > 0 ? createColdCallWorker() : null;
        if (coldCallWorker) {
            scheduleColdCallCampaigns().catch((err) =>
                logger.error({ err }, 'Falha ao agendar a campanha de prospecção fria'),
            );
        }
    }).catch(() => null);

    swarmSchedulerEnabledOrganizations().then((swarmOrgs) => {
        swarmSchedulerWorker = embeddedWorkersEnabled && swarmOrgs.length > 0 ? createSwarmSchedulerWorker() : null;
        if (swarmSchedulerWorker) {
            scheduleSwarmScheduler().catch((err) =>
                logger.error({ err }, 'Falha ao agendar o enxame autônomo'),
            );
        }
    }).catch(() => null);



    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`${signal} received: closing gracefully`);
        
        await new Promise<void>((resolve) => {
            server.close((err) => {
                if (err) {
                    logger.error({ err }, 'Erro ao fechar o servidor HTTP');
                } else {
                    logger.info('Servidor HTTP fechado com sucesso');
                }
                resolve();
            });
        });

        await leadsWorker?.close();
        await agentWorker?.close();
        await searchWorker?.close();
        await enrichmentWorker?.close();
        await whatsappSignalWorker?.close();
        await bitrixSyncWorker?.close();
        await followUpWorker?.close();
        await execSummaryWorker?.close();
        await deduplicationWorker?.close();
        await winLossWorker?.close();
        await pdfWorker?.close();
        await autoAnonymizeWorker?.close();
        await coldCallWorker?.close();
        await swarmSchedulerWorker?.close();
        await coldLeadsScannerWorker?.close();
        await stagnationScannerWorker?.close();
        
        await shutdownLangfuse();
        await prisma.$disconnect();

        await Promise.allSettled([
            connection.quit().catch(() => connection.disconnect()),
            rateLimiterConnection.quit().catch(() => rateLimiterConnection.disconnect()),
            cacheConnection.quit().catch(() => cacheConnection.disconnect()),
        ]);
        
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
