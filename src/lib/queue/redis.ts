import Redis from 'ioredis';
import { logger } from '../logger.js';
import { recordRedisReconnect, registerRedisConnectionForMetrics } from './metrics.js';

const configuredRedisUrl = process.env.REDIS_URL?.trim();
const redisUrl = configuredRedisUrl || 'redis://localhost:6379';
const isProduction = process.env.NODE_ENV === 'production';
const entrypoint = process.argv[1] || '';
export const isDedicatedWorkerProcess = /(?:^|[/\\])worker\.(?:ts|js|cjs|mjs)$/.test(entrypoint);

export const redisConfigured = Boolean(configuredRedisUrl);

// Em produção, o web precisa poder PRODUZIR jobs e usar o rate limit distribuído mesmo quando a
// antiga flag ENABLE_QUEUES=false está mantida no Blueprint para impedir consumers embutidos.
// O worker dedicado, por outro lado, continua exigindo ENABLE_QUEUES=true explicitamente.
export const queuesEnabled =
  redisConfigured &&
  (process.env.ENABLE_QUEUES === 'true' || (isProduction && !isDedicatedWorkerProcess));

export const rateLimitRedisEnabled = isProduction && redisConfigured && !isDedicatedWorkerProcess;

if (isProduction && process.env.ENABLE_EMBEDDED_WORKERS === 'true') {
  logger.fatal('ENABLE_EMBEDDED_WORKERS=true não é permitido em produção; use worker.ts dedicado.');
  if (process.env.NODE_ENV !== 'test') process.exit(1);
}

function retryDelay(times: number): number {
  return Math.min(Math.max(times, 1) * 500, 5_000);
}

// NOAUTH/WRONGPASS não são falhas transitórias (rede instável, Redis reiniciando) — são erro de
// credencial, e retry nunca vai resolver sozinho. Sem essa distinção, um REDIS_URL mal configurado
// fica reconectando para sempre a cada 500ms-5s, e ao longo de horas isso já produziu dezenas de GB
// de log (incidente de 2026-08-29). Uma vez detectado, paramos de tentar e avisamos uma única vez.
function isAuthError(err: Error): boolean {
  return /NOAUTH|WRONGPASS|invalid (username-)?password/i.test(err.message);
}

function makeAuthGuard(enabled: () => boolean) {
  let authFailed = false;
  return {
    retryStrategy(times: number): number | null {
      if (!enabled() || authFailed) return null;
      return retryDelay(times);
    },
    onError(err: Error): 'auth-first' | 'auth-repeat' | 'other' {
      if (!isAuthError(err)) return 'other';
      const first = !authFailed;
      authFailed = true;
      return first ? 'auth-first' : 'auth-repeat';
    },
  };
}

function observeConnection(
  redis: Redis,
  role: 'bullmq' | 'rate-limit' | 'cache',
  enabled: () => boolean,
  onError: (err: Error) => 'auth-first' | 'auth-repeat' | 'other',
): void {
  redis.on('connect', () => {
    if (enabled()) logger.info({ redisRole: role }, 'Connected to Redis successfully');
  });
  redis.on('reconnecting', (delay: number) => {
    if (!enabled()) return;
    recordRedisReconnect(role);
    logger.warn({ redisRole: role, delayMs: delay }, 'Redis reconnect scheduled');
  });
  redis.on('error', (err) => {
    if (!enabled()) return;
    const status = onError(err);
    if (status === 'auth-repeat') return;
    if (status === 'auth-first') {
      logger.error(
        { redisRole: role, message: err.message },
        'Redis rejeitou a autenticação; desistindo de reconectar. Corrija REDIS_URL (usuário/senha) e reinicie o processo.',
      );
      return;
    }
    if (process.env.NODE_ENV === 'development') {
      logger.warn({ redisRole: role, message: err.message }, 'Redis offline or connecting...');
    } else {
      logger.error({ redisRole: role, err }, 'Redis connection error');
    }
  });
}

const bullmqAuthGuard = makeAuthGuard(() => queuesEnabled);
export const connection = new Redis(redisUrl, {
  lazyConnect: !queuesEnabled,
  enableOfflineQueue: queuesEnabled,
  maxRetriesPerRequest: null,
  connectTimeout: 10_000,
  retryStrategy: bullmqAuthGuard.retryStrategy,
});
observeConnection(connection, 'bullmq', () => queuesEnabled, bullmqAuthGuard.onError);
registerRedisConnectionForMetrics('bullmq', connection, () => queuesEnabled);

const rateLimitAuthGuard = makeAuthGuard(() => rateLimitRedisEnabled);
export const rateLimiterConnection = new Redis(redisUrl, {
  lazyConnect: !rateLimitRedisEnabled,
  // rate-limit-redis carrega os scripts Lua no construtor do middleware, poucos milissegundos
  // antes de o evento `connect` poder ocorrer num cold-start. Sem offline queue, essa primeira
  // carga falha com "Stream isn't writeable" apesar de a conexão ficar pronta logo em seguida.
  // A fila é segura aqui porque commandTimeout/maxRetries continuam limitando indisponibilidade;
  // ela serve apenas para atravessar a janela de conexão inicial, não para esconder outage longa.
  enableOfflineQueue: rateLimitRedisEnabled,
  maxRetriesPerRequest: 1,
  connectTimeout: 3_000,
  commandTimeout: 2_000,
  retryStrategy: rateLimitAuthGuard.retryStrategy,
});
observeConnection(
  rateLimiterConnection,
  'rate-limit',
  () => rateLimitRedisEnabled,
  rateLimitAuthGuard.onError,
);
registerRedisConnectionForMetrics('rate-limit', rateLimiterConnection, () => rateLimitRedisEnabled);

const cacheAuthGuard = makeAuthGuard(() => redisConfigured);
export const cacheConnection = new Redis(redisUrl, {
  lazyConnect: !redisConfigured,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 5_000,
  commandTimeout: 3_000,
  retryStrategy: cacheAuthGuard.retryStrategy,
});
observeConnection(cacheConnection, 'cache', () => redisConfigured, cacheAuthGuard.onError);
registerRedisConnectionForMetrics('cache', cacheConnection, () => redisConfigured);

export async function pingRedis(connectionToPing: Redis = connection): Promise<void> {
  const pong = await connectionToPing.ping();
  if (pong !== 'PONG') throw new Error(`Redis health check returned ${pong}`);
}
