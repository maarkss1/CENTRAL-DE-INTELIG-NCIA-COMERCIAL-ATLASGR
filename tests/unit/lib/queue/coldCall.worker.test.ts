import { afterEach, describe, expect, it, vi } from 'vitest';

const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
const getJobSchedulers = vi.fn().mockResolvedValue([]);
const removeJobScheduler = vi.fn().mockResolvedValue(undefined);
const queueOn = vi.fn();
const workerOn = vi.fn();

// `class`, não arrow function: `new Queue(...)` precisa de algo invocável como construtor.
vi.mock('bullmq', () => {
    class MockQueue {
        upsertJobScheduler(...args: unknown[]) { return upsertJobScheduler(...args); }
        getJobSchedulers(...args: unknown[]) { return getJobSchedulers(...args); }
        removeJobScheduler(...args: unknown[]) { return removeJobScheduler(...args); }
        on(...args: unknown[]) { return queueOn(...args); }
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
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const recordDeadLetterMock = vi.fn();
const isFinalAttemptMock = vi.fn();
vi.mock('../../../../src/lib/queue/deadLetter.js', () => ({
    recordDeadLetter: (...args: unknown[]) => recordDeadLetterMock(...args),
    isFinalAttempt: (...args: unknown[]) => isFinalAttemptMock(...args),
}));

const enabledOrganizations = vi.fn();
vi.mock('../../../../src/features/integrations/birth-voice/coldCall.service.js', () => ({
    runColdCallCampaign: vi.fn(),
    enabledOrganizations: (...args: unknown[]) => enabledOrganizations(...args),
}));

const { scheduleColdCallCampaigns, createColdCallWorker, COLD_CALL_QUEUE_NAME } = await import('../../../../src/lib/queue/coldCall.worker');
const { logger } = await import('../../../../src/lib/logger.js');

afterEach(() => {
    vi.clearAllMocks();
});

describe('scheduleColdCallCampaigns', () => {
    it('agenda a campanha só para organizações autorizadas', async () => {
        enabledOrganizations.mockResolvedValue(['org-1', 'org-2']);
        getJobSchedulers.mockResolvedValue([]);

        const count = await scheduleColdCallCampaigns();

        expect(count).toBe(2);
        expect(upsertJobScheduler).toHaveBeenCalledWith(
            'cold-call-org-1',
            expect.objectContaining({ every: expect.any(Number) }),
            expect.objectContaining({ data: { organizationId: 'org-1' } }),
        );
        expect(upsertJobScheduler).toHaveBeenCalledWith(
            'cold-call-org-2',
            expect.anything(),
            expect.objectContaining({ data: { organizationId: 'org-2' } }),
        );
    });

    it('não agenda nada quando nenhuma organização está autorizada', async () => {
        enabledOrganizations.mockResolvedValue([]);
        getJobSchedulers.mockResolvedValue([]);

        const count = await scheduleColdCallCampaigns();

        expect(count).toBe(0);
        expect(upsertJobScheduler).not.toHaveBeenCalled();
    });

    // A revogação de uma organização (env mudou, redeploy) não pode deixar a campanha rodando
    // sozinha: o agendamento recorrente antigo precisa ser removido, não só deixado de renovar.
    it('remove o agendamento recorrente de uma organização que perdeu a autorização', async () => {
        enabledOrganizations.mockResolvedValue(['org-1']);
        getJobSchedulers.mockResolvedValue([
            { id: 'cold-call-org-1' },
            { id: 'cold-call-org-revogada' },
        ]);

        await scheduleColdCallCampaigns();

        expect(removeJobScheduler).toHaveBeenCalledWith('cold-call-org-revogada');
        expect(removeJobScheduler).not.toHaveBeenCalledWith('cold-call-org-1');
        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: 'org-revogada' }),
            expect.any(String),
        );
    });

    it('ignora agendadores de outras filas ao decidir o que remover', async () => {
        enabledOrganizations.mockResolvedValue([]);
        getJobSchedulers.mockResolvedValue([{ id: 'outra-fila-qualquer' }]);

        await scheduleColdCallCampaigns();

        expect(removeJobScheduler).not.toHaveBeenCalled();
    });
});

// RUN-006 (Sprint 02/Onda 14): contrato comum de dead-letter (`recordDeadLetter`/`isFinalAttempt`,
// ver src/lib/queue/deadLetter.ts) adotado no `worker.on('failed', ...)` deste worker.
describe('createColdCallWorker — dead-letter na última tentativa', () => {
    function getFailedHandler(): (job: unknown, err: Error) => void {
        createColdCallWorker();
        const call = workerOn.mock.calls.find(([event]) => event === 'failed');
        expect(call).toBeDefined();
        return call![1];
    }

    it('registra recordDeadLetter com organizationId e os campos do job quando a falha é a última tentativa', () => {
        isFinalAttemptMock.mockReturnValue(true);
        const failedHandler = getFailedHandler();

        const job = { id: 'job-1', name: 'run-campaign', data: { organizationId: 'org-1' }, attemptsMade: 1, opts: { attempts: 1 } };
        const err = new Error('Birth Voice fora do ar');
        failedHandler(job, err);

        expect(isFinalAttemptMock).toHaveBeenCalledWith(1, 1);
        expect(recordDeadLetterMock).toHaveBeenCalledWith(expect.objectContaining({
            queue: COLD_CALL_QUEUE_NAME,
            jobId: 'job-1',
            jobName: 'run-campaign',
            organizationId: 'org-1',
            attemptsMade: 1,
            error: err,
        }));
    });

    it('não registra dead-letter quando ainda restam tentativas', () => {
        isFinalAttemptMock.mockReturnValue(false);
        const failedHandler = getFailedHandler();

        failedHandler({ id: 'job-1', name: 'run-campaign', data: { organizationId: 'org-1' }, attemptsMade: 0, opts: { attempts: 1 } }, new Error('falha transitória'));

        expect(recordDeadLetterMock).not.toHaveBeenCalled();
    });
});
