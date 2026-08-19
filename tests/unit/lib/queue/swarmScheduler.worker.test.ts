import { afterEach, describe, expect, it, vi } from 'vitest';

const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
const queueOn = vi.fn();
const workerOn = vi.fn();

vi.mock('bullmq', () => {
    class MockQueue {
        on(...args: unknown[]) { return queueOn(...args); }
        upsertJobScheduler(...args: unknown[]) { return upsertJobScheduler(...args); }
    }
    class MockWorker {
        on(...args: unknown[]) { return workerOn(...args); }
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

const recordDeadLetterMock = vi.fn();
const isFinalAttemptMock = vi.fn();
vi.mock('../../../../src/lib/queue/deadLetter.js', () => ({
    recordDeadLetter: (...args: unknown[]) => recordDeadLetterMock(...args),
    isFinalAttempt: (...args: unknown[]) => isFinalAttemptMock(...args),
}));

const enabledOrganizations = vi.fn();
vi.mock('../../../../src/features/intelligence/services/swarmScheduler.service.js', () => ({
    enabledOrganizations: (...args: unknown[]) => enabledOrganizations(...args),
    runSwarmScheduler: vi.fn(),
}));

const { scheduleSwarmScheduler, createSwarmSchedulerWorker, SWARM_SCHEDULER_QUEUE_NAME } = await import('../../../../src/lib/queue/swarmScheduler.worker');

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

// RUN-006 (Sprint 02/Onda 14): contrato comum de dead-letter (`recordDeadLetter`/`isFinalAttempt`,
// ver src/lib/queue/deadLetter.ts) adotado no `worker.on('failed', ...)` deste worker.
describe('createSwarmSchedulerWorker — dead-letter na última tentativa', () => {
    function getFailedHandler(): (job: unknown, err: Error) => void {
        createSwarmSchedulerWorker();
        const call = workerOn.mock.calls.find(([event]) => event === 'failed');
        expect(call).toBeDefined();
        return call![1];
    }

    it('registra recordDeadLetter com organizationId e os campos do job quando a falha é a última tentativa', () => {
        isFinalAttemptMock.mockReturnValue(true);
        const failedHandler = getFailedHandler();

        const job = { id: 'job-1', name: 'run-swarm-scheduler', data: { organizationId: 'org-1' }, attemptsMade: 1, opts: { attempts: 1 } };
        const err = new Error('IA gateway fora do ar');
        failedHandler(job, err);

        expect(isFinalAttemptMock).toHaveBeenCalledWith(1, 1);
        expect(recordDeadLetterMock).toHaveBeenCalledWith(expect.objectContaining({
            queue: SWARM_SCHEDULER_QUEUE_NAME,
            jobId: 'job-1',
            jobName: 'run-swarm-scheduler',
            organizationId: 'org-1',
            attemptsMade: 1,
            error: err,
        }));
    });

    it('não registra dead-letter quando ainda restam tentativas', () => {
        isFinalAttemptMock.mockReturnValue(false);
        const failedHandler = getFailedHandler();

        failedHandler({ id: 'job-1', name: 'run-swarm-scheduler', data: { organizationId: 'org-1' }, attemptsMade: 0, opts: { attempts: 1 } }, new Error('falha transitória'));

        expect(recordDeadLetterMock).not.toHaveBeenCalled();
    });
});
