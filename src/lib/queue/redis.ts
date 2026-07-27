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
