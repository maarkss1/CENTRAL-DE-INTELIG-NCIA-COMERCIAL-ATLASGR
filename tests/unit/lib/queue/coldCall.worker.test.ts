import { afterEach, describe, expect, it, vi } from 'vitest';

const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
const getJobSchedulers = vi.fn().mockResolvedValue([]);
const removeJobScheduler = vi.fn().mockResolvedValue(undefined);
const queueOn = vi.fn();

// `class`, não arrow function: `new Queue(...)` precisa de algo invocável como construtor.
vi.mock('bullmq', () => {
    class MockQueue {
        upsertJobScheduler(...args: unknown[]) { return upsertJobScheduler(...args); }
        getJobSchedulers(...args: unknown[]) { return getJobSchedulers(...args); }
        removeJobScheduler(...args: unknown[]) { return removeJobScheduler(...args); }
        on(...args: unknown[]) { return queueOn(...args); }
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
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const enabledOrganizations = vi.fn();
vi.mock('../../../../src/features/integrations/birth-voice/coldCall.service.js', () => ({
    runColdCallCampaign: vi.fn(),
    enabledOrganizations: (...args: unknown[]) => enabledOrganizations(...args),
}));

const { scheduleColdCallCampaigns } = await import('../../../../src/lib/queue/coldCall.worker');
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
