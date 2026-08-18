import { randomUUID } from 'node:crypto';
import { cacheConnection, redisConfigured } from './redis.js';
import { logger } from '../logger.js';

export type DistributedLockReason = 'acquired' | 'contended' | 'redis-unavailable' | 'redis-disabled';

export interface DistributedLock {
    readonly runId: string;
    readonly acquired: boolean;
    readonly reason: DistributedLockReason;
    release(): Promise<void>;
}

/**
 * Trava distribuída via Redis (SET key value NX EX ttl).
 *
 * Política de segurança:
 * - sem REDIS_URL configurado: assume processo local único e permite a execução;
 * - com Redis configurado: qualquer erro ao confirmar a trava é fail-closed. Sem lock confirmado,
 *   a ação duplicável NÃO executa.
 */
export async function acquireDistributedLock(key: string, ttlSeconds: number): Promise<DistributedLock> {
    const runId = randomUUID();

    const release = async (): Promise<void> => {
        if (!redisConfigured) return;
        try {
            const current = await cacheConnection.get(key);
            if (current !== runId) return;
            // Compare-and-delete atômico: não apaga uma trava que mudou de dono entre GET e DEL.
            await cacheConnection.eval(
                "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
                1,
                key,
                runId,
            );
        } catch (err) {
            logger.warn({ err, key, runId }, 'Falha ao liberar a trava distribuída; TTL fará a limpeza.');
        }
    };

    if (!redisConfigured) {
        return { runId, acquired: true, reason: 'redis-disabled', release };
    }

    try {
        const result = await cacheConnection.set(key, runId, 'EX', ttlSeconds, 'NX');
        return {
            runId,
            acquired: result === 'OK',
            reason: result === 'OK' ? 'acquired' : 'contended',
            release,
        };
    } catch (err) {
        logger.error({ err, key, runId }, 'Redis indisponível para distributed lock; execução bloqueada por fail-closed.');
        return { runId, acquired: false, reason: 'redis-unavailable', release };
    }
}
