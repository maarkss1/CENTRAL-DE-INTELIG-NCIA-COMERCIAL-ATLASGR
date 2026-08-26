import type { Express } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { rateLimiterConnection, queuesEnabled } from '../lib/queue/redis.js';
import { authenticateToken, type AuthRequest } from '../shared/middlewares/authenticateToken.js';

const sendRateLimitCommand = (...args: string[]): Promise<RedisReply> =>
    rateLimiterConnection.call(args[0], ...args.slice(1)) as Promise<RedisReply>;

// Sem queuesEnabled (nenhum Redis configurado), a conexão já esgotou as retries e fica
// permanentemente "closed" — usar RedisStore nesse estado faz TODA requisição rejeitar
// com throw em vez de aplicar o limite, derrubando a rota inteira (inclusive health
// checks) com 500. Cai pro store em memória do próprio express-rate-limit, igual ao que
// já acontece fora de produção — limite por processo em vez de compartilhado entre
// instâncias, mas funcional, que é estritamente melhor do que a API inteira fora do ar.
function redisStoreOrMemory() {
    return env.NODE_ENV === 'production' && queuesEnabled
        ? new RedisStore({ sendCommand: sendRateLimitCommand })
        : undefined;
}

/**
 * Monta os limitadores de requisição por rota. Precisa rodar antes dos webhooks e do parser
 * JSON global (mesma posição do server.ts original) e depois dos middlewares de segurança de
 * borda (helmet/cors/compression), já que alguns limiters dependem de `req.ip`/trust proxy.
 */
export function applyRateLimiters(app: Express): void {
    // Rate Limiting — API_RATE_LIMIT_MAX req/15min por IP nas rotas /api
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: env.API_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        store: redisStoreOrMemory(),
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
        store: redisStoreOrMemory(),
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
        store: redisStoreOrMemory(),
        message: { success: false, message: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.' }
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
        store: redisStoreOrMemory(),
        message: { success: false, error: 'Muitos relatos de problema enviados. Tente novamente em 15 minutos.' }
    });
    app.use('/api/bug-reports', authenticateToken, bugReportLimiter);
}
