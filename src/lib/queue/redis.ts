import Redis from 'ioredis';
import { logger } from '../logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const queuesEnabled =
    process.env.ENABLE_QUEUES === 'true' || Boolean(process.env.REDIS_URL);

// Connection instance for standard queue operations
export const connection = new Redis(redisUrl, {
    lazyConnect: !queuesEnabled,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy(times) {
        if (times > 3 && !process.env.REDIS_URL) {
            return null; // Stop retrying if Redis is not explicitly configured
        }
        return Math.min(times * 500, 5000);
    },
});

connection.on('error', (err) => {
    if (!queuesEnabled) return;
    // Log as debug/warn in dev mode if Redis is offline
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
// checks run on the hot request path, so a transient Redis hiccup (e.g. NOSCRIPT
// right after a fresh container start) must fail fast instead of retrying the
// EVALSHA command indefinitely — which is exactly what happened when this shared
// the BullMQ connection: a single request produced ~500 EVALSHA calls in a couple
// of seconds and blew through the rate limit before real traffic ever arrived.
export const rateLimiterConnection = new Redis(redisUrl, {
    lazyConnect: !queuesEnabled,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
        if (times > 3 && !process.env.REDIS_URL) {
            return null;
        }
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
