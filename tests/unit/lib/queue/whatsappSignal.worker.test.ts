import { afterEach, describe, expect, it, vi } from 'vitest';

const getJob = vi.fn();
const add = vi.fn().mockResolvedValue(undefined);
const queueOn = vi.fn();

// `class`, não arrow function: `new Queue(...)` precisa de algo invocável como construtor — o
// próprio Vitest recusa (`is not a constructor`) um mock feito com `vi.fn().mockImplementation(() => ...)`.
vi.mock('bullmq', () => {
    class MockQueue {
        getJob(...args: unknown[]) { return getJob(...args); }
        add(...args: unknown[]) { return add(...args); }
        on(...args: unknown[]) { return queueOn(...args); }
    }
    class MockQueueEvents {
        on() { /* no-op */ }
    }
    class MockWorker {
        on() { /* no-op */ }
    }
    return { Queue: MockQueue, QueueEvents: MockQueueEvents, Worker: MockWorker };
});

// `whatsappSignal.worker.ts` importa `analyzeConversation`, que importa `prisma.js` de verdade —
// e `prisma.js` importa `search.queue.ts` (outro usuário de `bullmq`). Mockar `prisma.js` aqui
// corta essa cadeia inteira em vez de precisar simular cada fila transitiva.
vi.mock('../../../../src/lib/prisma.js', () => ({ prisma: {} }));

vi.mock('../../../../src/lib/queue/redis.js', () => ({
    connection: {},
    cacheConnection: {},
    rateLimiterConnection: {},
    // Precisa ser `true`: com `false`, `whatsappSignalQueue` fica `null` e
    // `scheduleConversationAnalysis` retorna antes de chamar getJob/add — os mocks abaixo nunca
    // seriam invocados e os testes ficariam vazios (checando um retorno que nunca aconteceu).
    queuesEnabled: true,
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { scheduleConversationAnalysis } = await import('../../../../src/lib/queue/whatsappSignal.worker');

afterEach(() => {
    vi.clearAllMocks();
});

describe('WhatsApp conversation-signal debounce scheduler', () => {
    it('schedules a delayed job keyed by lead when nothing is pending yet', async () => {
        getJob.mockResolvedValueOnce(undefined);

        await scheduleConversationAnalysis('lead-1', 'org-1');

        expect(add).toHaveBeenCalledWith(
            'analyze-conversation',
            { leadId: 'lead-1', organizationId: 'org-1' },
            expect.objectContaining({ jobId: 'conversation-signal:lead-1', delay: expect.any(Number) }),
        );
    });

    it('resets the debounce by removing a still-pending job before rescheduling', async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        getJob.mockResolvedValueOnce({ getState: vi.fn().mockResolvedValue('delayed'), remove });

        await scheduleConversationAnalysis('lead-1', 'org-1');

        expect(remove).toHaveBeenCalledTimes(1);
        expect(add).toHaveBeenCalledTimes(1);
    });

    it('leaves an already-running analysis alone instead of cancelling it mid-flight', async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        getJob.mockResolvedValueOnce({ getState: vi.fn().mockResolvedValue('active'), remove });

        await scheduleConversationAnalysis('lead-1', 'org-1');

        expect(remove).not.toHaveBeenCalled();
    });

    it('does not throw when the queue is unavailable — the message was already persisted', async () => {
        getJob.mockRejectedValueOnce(new Error('Redis offline'));

        await expect(scheduleConversationAnalysis('lead-1', 'org-1')).resolves.toBeUndefined();
    });
});
