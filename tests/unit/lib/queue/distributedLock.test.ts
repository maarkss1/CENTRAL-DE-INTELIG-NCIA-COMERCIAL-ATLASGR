import { describe, it, expect, vi, beforeEach } from 'vitest';

let queuesEnabledValue = true;
const cacheGet = vi.fn();
const cacheSet = vi.fn();
const cacheDel = vi.fn();
vi.mock('../../../../src/lib/queue/redis.js', () => ({
    get queuesEnabled() {
        return queuesEnabledValue;
    },
    cacheConnection: {
        get: (...args: unknown[]) => cacheGet(...args),
        set: (...args: unknown[]) => cacheSet(...args),
        del: (...args: unknown[]) => cacheDel(...args),
    },
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn() },
}));

const { acquireDistributedLock } = await import('../../../../src/lib/queue/distributedLock.js');

beforeEach(() => {
    vi.clearAllMocks();
    queuesEnabledValue = true;
});

describe('acquireDistributedLock', () => {
    it('adquire a trava com SET NX EX quando Redis está disponível', async () => {
        cacheSet.mockResolvedValue('OK');

        const lock = await acquireDistributedLock('k:lock', 60);

        expect(lock.acquired).toBe(true);
        expect(cacheSet).toHaveBeenCalledWith('k:lock', lock.runId, 'EX', 60, 'NX');
    });

    it('não adquire quando outra instância já detém a trava', async () => {
        cacheSet.mockResolvedValue(null);

        const lock = await acquireDistributedLock('k:lock', 60);

        expect(lock.acquired).toBe(false);
    });

    it('assume instância única (adquire sempre) quando Redis não está configurado neste ambiente', async () => {
        queuesEnabledValue = false;

        const lock = await acquireDistributedLock('k:lock', 60);

        expect(lock.acquired).toBe(true);
        expect(cacheSet).not.toHaveBeenCalled();
    });

    it('degrada para "adquirida" (não bloqueia o boot) quando o Redis falha ao tentar travar', async () => {
        cacheSet.mockRejectedValue(new Error('ECONNREFUSED'));

        const lock = await acquireDistributedLock('k:lock', 60);

        expect(lock.acquired).toBe(true);
    });

    it('release() só apaga a trava se ainda for o dono (evita apagar a de uma execução mais nova)', async () => {
        cacheSet.mockResolvedValue('OK');
        const lock = await acquireDistributedLock('k:lock', 60);

        cacheGet.mockResolvedValue(lock.runId);
        await lock.release();
        expect(cacheDel).toHaveBeenCalledWith('k:lock');
    });

    it('release() não apaga quando outra execução já assumiu a trava (TTL expirou e outra pegou)', async () => {
        cacheSet.mockResolvedValue('OK');
        const lock = await acquireDistributedLock('k:lock', 60);

        cacheGet.mockResolvedValue('outro-run-id');
        await lock.release();
        expect(cacheDel).not.toHaveBeenCalled();
    });

    it('release() é seguro (no-op) sem Redis configurado', async () => {
        queuesEnabledValue = false;
        const lock = await acquireDistributedLock('k:lock', 60);

        await expect(lock.release()).resolves.toBeUndefined();
        expect(cacheGet).not.toHaveBeenCalled();
    });
});
