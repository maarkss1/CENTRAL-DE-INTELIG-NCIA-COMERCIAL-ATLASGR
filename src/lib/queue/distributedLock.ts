import { randomUUID } from 'node:crypto';
import { cacheConnection, redisConfigured } from './redis.js';
import { logger } from '../logger.js';

export type DistributedLockReason =
  | 'acquired'
  | 'contended'
  | 'redis-unavailable'
  | 'redis-disabled';

export interface DistributedLock {
  readonly runId: string;
  readonly acquired: boolean;
  readonly reason: DistributedLockReason;
  /**
   * Renova o TTL da trava (heartbeat) — só estende se `runId` ainda for o dono confirmado
   * (compare-and-expire atômico via Lua, mesmo princípio do compare-and-delete de `release`).
   * Devolve `false` quando a trava não é mais nossa (outra réplica já assumiu após o TTL
   * expirar, ou o Redis está inacessível) — nesse caso o chamador deve tratar como perda de
   * posse (fail-closed) e encerrar qualquer recurso exclusivo que dependia da trava, nunca
   * assumir posse silenciosamente.
   */
  renew(ttlSeconds: number): Promise<boolean>;
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
export async function acquireDistributedLock(
  key: string,
  ttlSeconds: number,
): Promise<DistributedLock> {
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

  // Sem Redis configurado, assumimos instância única — a trava é sempre "nossa", então renovar
  // também é sempre um no-op bem-sucedido (não há TTL real a estender).
  const renewSingleInstance = async (): Promise<boolean> => true;

  if (!redisConfigured) {
    return { runId, acquired: true, reason: 'redis-disabled', renew: renewSingleInstance, release };
  }

  const renew = async (ttlSeconds: number): Promise<boolean> => {
    try {
      // Compare-and-expire atômico: só estende o TTL se `runId` ainda for o valor gravado na
      // chave. Se outra execução já sobrescreveu a chave (nossa trava expirou e outra réplica
      // assumiu), devolve 0 sem tocar na trava alheia.
      const result = await cacheConnection.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end",
        1,
        key,
        runId,
        ttlSeconds,
      );
      return result === 1;
    } catch (err) {
      logger.warn(
        { err, key, runId },
        'Falha ao renovar a trava distribuída; tratando como perda de posse (fail-closed).',
      );
      return false;
    }
  };

  try {
    const result = await cacheConnection.set(key, runId, 'EX', ttlSeconds, 'NX');
    return {
      runId,
      acquired: result === 'OK',
      reason: result === 'OK' ? 'acquired' : 'contended',
      renew,
      release,
    };
  } catch (err) {
    logger.error(
      { err, key, runId },
      'Redis indisponível para distributed lock; execução bloqueada por fail-closed.',
    );
    return { runId, acquired: false, reason: 'redis-unavailable', renew, release };
  }
}
