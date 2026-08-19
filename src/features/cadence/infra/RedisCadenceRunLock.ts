import { acquireDistributedLock } from '../../../lib/queue/distributedLock.js';
import type { CadenceRunLockPort } from '../application/cadenceService.js';

/**
 * Implementação real de `CadenceRunLockPort` (CYC-008, onda-19) — reusa a mesma trava distribuída
 * via Redis já usada por `cold-leads-scanner.service.ts`/`stagnation-scanner.service.ts`
 * (`SET key value NX EX ttl`, fail-closed se o Redis estiver configurado mas indisponível).
 *
 * TTL folgado o suficiente para cobrir o pior caso de latência de despacho real (rede até o
 * WhatsApp/SMTP) sem liberar a trava no meio de um ciclo em andamento — não precisa ser exato,
 * só maior que qualquer chamada de rede plausível de um único toque.
 */
const LOCK_TTL_SECONDS = 90;

export const redisCadenceRunLock: CadenceRunLockPort = {
    async acquire(runId: string) {
        const lock = await acquireDistributedLock(`cadence-run:${runId}`, LOCK_TTL_SECONDS);
        return { acquired: lock.acquired, release: lock.release };
    },
};
