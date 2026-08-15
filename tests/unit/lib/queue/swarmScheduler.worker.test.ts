import { afterEach, describe, expect, it, vi } from 'vitest';

const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
const queueOn = vi.fn();

vi.mock('bullmq', () => {
    class MockQueue {
        on(...args: unknown[]) { return queueOn(...args); }
        upsertJobScheduler(...args: unknown[]) { return upsertJobScheduler(...args); }
    }
    class MockWorker {
        on() { /* no-op */ }
    }
    return { Queue: MockQueue, Worker: MockWorker };
});

vi.mock('../../../../src/lib/queue/redis.js', () => ({ connection: {} }));

vi.mock('../../../../src/lib/queue/metrics.js', () => ({
    registerQueueForMetrics: vi.fn(),
    recordQueueJobCompleted: vi.fn(),
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const enabledOrganizations = vi.fn();
vi.mock('../../../../src/features/intelligence/services/swarmScheduler.service.js', () => ({
    enabledOrganizations: (...args: unknown[]) => enabledOrganizations(...args),
    runSwarmScheduler: vi.fn(),
}));

const { scheduleSwarmScheduler } = await import('../../../../src/lib/queue/swarmScheduler.worker');

afterEach(() => {
    vi.clearAllMocks();
});

describe('trava 1 do modo full — organização autorizada (scheduleSwarmScheduler)', () => {
    it('não agenda nenhuma organização quando enabledOrganizations() está vazio (flag desligada, ou lista vazia)', async () => {
        enabledOrganizations.mockResolvedValue([]);

        const scheduledCount = await scheduleSwarmScheduler();

        expect(scheduledCount).toBe(0);
        expect(upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('agenda somente as organizações que enabledOrganizations() explicitamente autorizou', async () => {
        enabledOrganizations.mockResolvedValue(['org-1', 'org-2']);

        const scheduledCount = await scheduleSwarmScheduler();

        expect(scheduledCount).toBe(2);
        expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
        expect(upsertJobScheduler).toHaveBeenCalledWith(
            'swarm-scheduler-org-1',
            expect.any(Object),
            expect.objectContaining({ data: { organizationId: 'org-1' } }),
        );
    });
});
