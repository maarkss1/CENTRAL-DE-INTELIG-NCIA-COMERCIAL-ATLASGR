import Redis from 'ioredis';
import { logger } from '../logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis-backed queues are opt-in. A REDIS_URL by itself is not enough to activate
// background workers or distributed rate limiting; operators must explicitly set
// ENABLE_QUEUES=true as documented in render.yaml. This keeps an old/stale optional
// Redis URL from participating in the web process boot.
export const queuesEnabled =
    process.env.ENABLE_QUEUES === 'true' && Boolean(process.env.REDIS_URL);

// Connection instance for standard queue operations
export const connection = new Redis(redisUrl, {
    lazyConnect: !queuesEnabled,
    enableOfflineQueue: queuesEnabled,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy(times) {
        if (!queuesEnabled) return null;
        return Math.min(times * 500, 5000);
    },
});

connection.on('error', (err) => {
    if (!queuesEnabled) return;
    if (process.env.NODE_ENV === 'development') {
        logger.warn({ message: err.message }, 'Redis offline or connecting...');
    } else {
        logger.error({ err }, 'Redis connection error');
    }
});

connection.on('connect', () => {
    logger.info('Connected to Redis successfully');
});

// Dedicated connection for express-rate-limit (via rate-limit-redis).
// Must NOT reuse `connection` above: that one sets maxRetriesPerRequest: null
// (required by BullMQ, which needs blocking commands to retry forever). Rate-limit
// checks run on the hot request path, so a transient Redis hiccup must fail fast.
export const rateLimiterConnection = new Redis(redisUrl, {
    lazyConnect: !queuesEnabled,
    enableOfflineQueue: queuesEnabled,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
        if (!queuesEnabled) return null;
        return Math.min(times * 500, 5000);
    },
});

rateLimiterConnection.on('error', (err) => {
    if (!queuesEnabled) return;
    if (process.env.NODE_ENV === 'development') {
        logger.warn({ message: err.message }, 'Rate limiter Redis connection offline or connecting...');
    } else {
        logger.error({ err }, 'Rate limiter Redis connection error');
    }
});

// Conexão fail-fast para caches no caminho da aplicação. Ela é separada da conexão
// bloqueante do BullMQ para que uma indisponibilidade do Redis nunca prenda uma
// requisição de enriquecimento.
export const cacheConnection = new Redis(redisUrl, {
    lazyConnect: !queuesEnabled,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times) {
        if (!queuesEnabled) return null;
        return Math.min(times * 500, 5000);
    },
});

cacheConnection.on('error', (err) => {
    if (!queuesEnabled) return;
    logger.warn({ message: err.message }, 'Enrichment cache Redis unavailable; continuing without cache');
});
