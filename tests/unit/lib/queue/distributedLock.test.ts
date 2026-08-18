import { describe, it, expect, vi, beforeEach } from 'vitest';

let redisConfiguredValue = true;
const cacheGet = vi.fn();
const cacheSet = vi.fn();
const cacheEval = vi.fn();
vi.mock('../../../../src/lib/queue/redis.js', () => ({
    get redisConfigured() {
        return redisConfiguredValue;
    },
    cacheConnection: {
        get: (...args: unknown[]) => cacheGet(...args),
        set: (...args: unknown[]) => cacheSet(...args),
        eval: (...args: unknown[]) => cacheEval(...args),
    },
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn() },
}));

const { acquireDistributedLock } = await import('../../../../src/lib/queue/distributedLock.js');

beforeEach(() => {
    vi.clearAllMocks();
    redisConfiguredValue = true;
});

describe('acquireDistributedLock', () => {
    it('adquire com SET NX EX quando Redis está disponível', async () => {
        cacheSet.mockResolvedValue('OK');
        const lock = await acquireDistributedLock('k:lock', 60);
        expect(lock.acquired).toBe(true);
        expect(lock.reason).toBe('acquired');
        expect(cacheSet).toHaveBeenCalledWith('k:lock', lock.runId, 'EX', 60, 'NX');
    });

    it('não adquire quando outra instância já detém a trava', async () => {
        cacheSet.mockResolvedValue(null);
        const lock = await acquireDistributedLock('k:lock', 60);
        expect(lock.acquired).toBe(false);
        expect(lock.reason).toBe('contended');
    });

    it('assume instância única somente quando Redis não está configurado', async () => {
        redisConfiguredValue = false;
        const lock = await acquireDistributedLock('k:lock', 60);
        expect(lock.acquired).toBe(true);
        expect(lock.reason).toBe('redis-disabled');
        expect(cacheSet).not.toHaveBeenCalled();
    });

    it('falha fechado quando Redis configurado fica indisponível', async () => {
        cacheSet.mockRejectedValue(new Error('ECONNREFUSED'));
        const lock = await acquireDistributedLock('k:lock', 60);
        expect(lock.acquired).toBe(false);
        expect(lock.reason).toBe('redis-unavailable');
    });

    it('release usa compare-and-delete atômico somente se ainda for o dono', async () => {
        cacheSet.mockResolvedValue('OK');
        const lock = await acquireDistributedLock('k:lock', 60);
        cacheGet.mockResolvedValue(lock.runId);
        cacheEval.mockResolvedValue(1);

        await lock.release();

        expect(cacheEval).toHaveBeenCalledWith(
            expect.stringContaining("redis.call('get', KEYS[1])"),
            1,
            'k:lock',
            lock.runId,
        );
    });

    it('release não executa compare-delete quando outra execução já é dona', async () => {
        cacheSet.mockResolvedValue('OK');
        const lock = await acquireDistributedLock('k:lock', 60);
        cacheGet.mockResolvedValue('outro-run-id');

        await lock.release();
        expect(cacheEval).not.toHaveBeenCalled();
    });

    it('release é no-op sem Redis configurado', async () => {
        redisConfiguredValue = false;
        const lock = await acquireDistributedLock('k:lock', 60);
        await expect(lock.release()).resolves.toBeUndefined();
        expect(cacheGet).not.toHaveBeenCalled();
    });
});
