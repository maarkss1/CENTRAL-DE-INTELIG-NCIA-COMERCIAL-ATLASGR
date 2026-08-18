import Redis from 'ioredis';
import { logger } from '../logger.js';
import { recordRedisReconnect } from './metrics.js';

const configuredRedisUrl = process.env.REDIS_URL?.trim();
const redisUrl = configuredRedisUrl || 'redis://localhost:6379';

/** Redis existe como dependência compartilhada mesmo quando consumidores BullMQ estão desligados. */
export const redisConfigured = Boolean(configuredRedisUrl);

/** Consumidores/produtores BullMQ continuam opt-in. */
export const queuesEnabled = process.env.ENABLE_QUEUES === 'true' && redisConfigured;

/**
 * O rate limit distribuído não depende de ENABLE_QUEUES. Em produção, se REDIS_URL existe,
 * todas as réplicas web compartilham o mesmo contador mesmo com workers desligados.
 */
export const rateLimitRedisEnabled = process.env.NODE_ENV === 'production' && redisConfigured;

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

// BullMQ precisa de maxRetriesPerRequest=null para comandos bloqueantes.
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

// Hot path HTTP: fail-fast, sem offline queue e independente de ENABLE_QUEUES.
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

// Cache/status/locks podem usar Redis sem ligar consumidores BullMQ.
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

/** Probe explícito para startup/readiness. */
export async function pingRedis(connectionToPing: Redis = connection): Promise<void> {
    const pong = await connectionToPing.ping();
    if (pong !== 'PONG') throw new Error(`Redis health check returned ${pong}`);
}
