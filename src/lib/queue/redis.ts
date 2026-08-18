import Redis from 'ioredis';
import { logger } from '../logger.js';
import { recordRedisReconnect } from './metrics.js';

const configuredRedisUrl = process.env.REDIS_URL?.trim();
const redisUrl = configuredRedisUrl || 'redis://localhost:6379';
const isProduction = process.env.NODE_ENV === 'production';
const entrypoint = process.argv[1] || '';
export const isDedicatedWorkerProcess = /(?:^|[/\\])worker\.(?:ts|js|cjs|mjs)$/.test(entrypoint);

export const redisConfigured = Boolean(configuredRedisUrl);

// Em produção, o web precisa poder PRODUZIR jobs e usar o rate limit distribuído mesmo quando a
// antiga flag ENABLE_QUEUES=false está mantida no Blueprint para impedir consumers embutidos.
// O worker dedicado, por outro lado, continua exigindo ENABLE_QUEUES=true explicitamente.
export const queuesEnabled = redisConfigured && (
    process.env.ENABLE_QUEUES === 'true' || (isProduction && !isDedicatedWorkerProcess)
);

export const rateLimitRedisEnabled = isProduction && redisConfigured && !isDedicatedWorkerProcess;

if (isProduction && process.env.ENABLE_EMBEDDED_WORKERS === 'true') {
    logger.fatal('ENABLE_EMBEDDED_WORKERS=true não é permitido em produção; use worker.ts dedicado.');
    if (process.env.NODE_ENV !== 'test') process.exit(1);
}

function retryDelay(times: number): number {
    return Math.min(Math.max(times, 1) * 500, 5_000);
}

function observeConnection(redis: Redis, role: 'bullmq' | 'rate-limit' | 'cache', enabled: () => boolean): void {
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
        if (process.env.NODE_ENV === 'development') {
            logger.warn({ redisRole: role, message: err.message }, 'Redis offline or connecting...');
        } else {
            logger.error({ redisRole: role, err }, 'Redis connection error');
        }
    });
}

export const connection = new Redis(redisUrl, {
    lazyConnect: !queuesEnabled,
    enableOfflineQueue: queuesEnabled,
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    retryStrategy(times) {
        if (!queuesEnabled) return null;
        return retryDelay(times);
    },
});
observeConnection(connection, 'bullmq', () => queuesEnabled);

export const rateLimiterConnection = new Redis(redisUrl, {
    lazyConnect: !rateLimitRedisEnabled,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    commandTimeout: 2_000,
    retryStrategy(times) {
        if (!rateLimitRedisEnabled) return null;
        return retryDelay(times);
    },
});
observeConnection(rateLimiterConnection, 'rate-limit', () => rateLimitRedisEnabled);

export const cacheConnection = new Redis(redisUrl, {
    lazyConnect: !redisConfigured,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 3_000,
    retryStrategy(times) {
        if (!redisConfigured) return null;
        return retryDelay(times);
    },
});
observeConnection(cacheConnection, 'cache', () => redisConfigured);

export async function pingRedis(connectionToPing: Redis = connection): Promise<void> {
    const pong = await connectionToPing.ping();
    if (pong !== 'PONG') throw new Error(`Redis health check returned ${pong}`);
}
