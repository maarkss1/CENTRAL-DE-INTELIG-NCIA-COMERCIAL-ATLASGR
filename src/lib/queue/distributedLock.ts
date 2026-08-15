import { randomUUID } from 'node:crypto';
import { cacheConnection, queuesEnabled } from './redis.js';
import { logger } from '../logger.js';

/**
 * Trava distribuída via Redis (`SET key value NX EX ttl`), extraída de
 * `cold-leads-scanner.service.ts` para ser reaproveitada por qualquer varredura periódica própria
 * do domínio de IA/automações (ex.: `stagnation-scanner.service.ts`) sem duplicar a mesma lógica de
 * `SET NX`/dono-da-trava a cada novo scanner.
 *
 * Por que existe: `node-cron` roda por processo — em qualquer deploy com mais de uma instância do
 * servidor, cada instância dispararia a mesma varredura ao mesmo tempo, multiplicando o custo (de
 * IA, de e-mail, do que for) sem nenhum ganho. Sem Redis disponível (`queuesEnabled=false`, ambiente
 * local de instância única), roda direto, sem travar o boot — a trava é uma proteção de produção
 * multi-instância, não um requisito de correção em dev.
 */
export interface DistributedLock {
    /** Identificador desta execução — usado para não liberar a trava de uma execução mais nova. */
    readonly runId: string;
    /** `false` quando outra instância já detém a trava; a execução deve ser pulada. */
    readonly acquired: boolean;
    /** Libera a trava, mas só se ainda for o dono (evita apagar a trava de uma execução mais nova
     *  depois de um timeout longo desta). Idempotente — seguro chamar mesmo se `acquired` for `false`. */
    release(): Promise<void>;
}

/**
 * Tenta adquirir uma trava distribuída identificada por `key`, com TTL de `ttlSeconds`. O TTL
 * precisa ser menor que o intervalo entre execuções para nunca travar o serviço indefinidamente se
 * uma instância morrer no meio da execução sem liberar a trava.
 */
export async function acquireDistributedLock(key: string, ttlSeconds: number): Promise<DistributedLock> {
    const runId = randomUUID();

    const release = async (): Promise<void> => {
        if (!queuesEnabled) return;
        try {
            const current = await cacheConnection.get(key);
            if (current === runId) await cacheConnection.del(key);
        } catch (err) {
            logger.warn({ err, key, runId }, 'Falha ao liberar a trava distribuída (expira sozinha pelo TTL).');
        }
    };

    if (!queuesEnabled) {
        return { runId, acquired: true, release };
    }

    try {
        const result = await cacheConnection.set(key, runId, 'EX', ttlSeconds, 'NX');
        return { runId, acquired: result === 'OK', release };
    } catch (err) {
        logger.warn({ err, key, runId }, 'Redis indisponível para a trava distribuída; seguindo sem travar.');
        return { runId, acquired: true, release };
    }
}
