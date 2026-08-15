import { afterEach, describe, expect, it, vi } from 'vitest';

// QUEUE-002: `createLeadsWorker` rodava sem nenhum `requestContext.run({ tenantId })` — um job de
// BullMQ nunca herda o AsyncLocalStorage da requisição HTTP que o enfileirou. Com "Lead" sob FORCE
// ROW LEVEL SECURITY, a extensão RLS de src/lib/prisma.ts roda toda query sem `app.current_tenant_id`
// setado quando não há tenant no contexto — a policy filtra TODA linha, silenciosamente. Na prática,
// `prisma.lead.update` no fim do worker sempre lançava "Record to update not found" (0 linhas
// visíveis): toda qualificação de lead por IA em background falhava, sem o usuário nunca ficar
// sabendo (a rota que enfileira já devolveu 202 antes do job rodar). Este teste prova o contexto de
// tenant correto e a dead-letter (QUEUE-001) na falha final.

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;
let capturedFailedHandler: ((job: unknown, err: Error) => void) | null = null;

vi.mock('bullmq', () => {
    class MockWorker {
        constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
            capturedProcessor = processor;
        }
        on(event: string, handler: (...args: unknown[]) => void) {
            if (event === 'failed') capturedFailedHandler = handler as never;
        }
    }
    class MockQueue {
        on() { /* no-op */ }
    }
    class MockQueueEvents {
        on() { /* no-op */ }
    }
    return { Queue: MockQueue, Worker: MockWorker, QueueEvents: MockQueueEvents };
});

vi.mock('../../../../src/lib/queue/redis.js', () => ({
    connection: {},
    queuesEnabled: false, // sem Redis: leadsQueue/leadsQueueEvents ficam null, mas o Worker mockado ainda é criado por createLeadsWorker() explicitamente
}));

vi.mock('../../../../src/lib/queue/metrics.js', () => ({
    registerQueueForMetrics: vi.fn(),
    recordQueueJobCompleted: vi.fn(),
}));

const leadUpdateMock = vi.fn();
const auditLogCreateMock = vi.fn();
vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { update: (...args: unknown[]) => leadUpdateMock(...args) },
        auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    },
}));

const qualifyLeadMock = vi.fn();
vi.mock('../../../../src/features/intelligence/services/ai.service.js', () => ({
    aiService: { qualifyLead: (...args: unknown[]) => qualifyLeadMock(...args) },
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { requestContext } = await import('../../../../src/lib/async-context.js');
const { createLeadsWorker } = await import('../../../../src/lib/queue/index.js');

function fakeJob(data: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
    return { id: 'job-1', name: 'qualify-lead', data, attemptsMade: 1, opts: { attempts: 3 }, ...overrides };
}

afterEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
});

describe('createLeadsWorker — processador de qualify-lead', () => {
    it('roda a qualificação dentro do requestContext com o tenantId do job', async () => {
        createLeadsWorker();
        qualifyLeadMock.mockResolvedValue({ qualificationScore: 80, summary: 'ótimo fit', status: 'ok' });

        let tenantIdDuranteUpdate: string | undefined;
        leadUpdateMock.mockImplementation(async () => {
            tenantIdDuranteUpdate = requestContext.getStore()?.tenantId;
            return {};
        });

        await capturedProcessor!(fakeJob({ leadId: 'lead-1', companyInfo: '', organizationId: 'org-1' }));

        expect(tenantIdDuranteUpdate).toBe('org-1');
        expect(leadUpdateMock).toHaveBeenCalledTimes(1);
        expect(leadUpdateMock.mock.calls[0][0].where).toEqual({ id: 'lead-1' });
    });

    it('deriva a temperatura a partir do score real retornado pela qualificação', async () => {
        createLeadsWorker();
        qualifyLeadMock.mockResolvedValue({ qualificationScore: 90, summary: 'quente', status: 'ok' });
        leadUpdateMock.mockResolvedValue({});

        await capturedProcessor!(fakeJob({ leadId: 'lead-1', organizationId: 'org-1' }));

        expect(leadUpdateMock.mock.calls[0][0].data.score).toBe(90);
        expect(leadUpdateMock.mock.calls[0][0].data.temperature).toBe('Quente');
    });

    it('rejeita o job sem organizationId em vez de rodar sem contexto de tenant', async () => {
        createLeadsWorker();

        await expect(capturedProcessor!(fakeJob({ leadId: 'lead-1' }))).rejects.toThrow(/organizationId/);
        expect(qualifyLeadMock).not.toHaveBeenCalled();
        expect(leadUpdateMock).not.toHaveBeenCalled();
    });

    it('rejeita o job sem leadId', async () => {
        createLeadsWorker();

        await expect(capturedProcessor!(fakeJob({ organizationId: 'org-1' }))).rejects.toThrow(/leadId/);
    });

    it('propaga o erro real quando a atualização do lead falha (nunca finge sucesso)', async () => {
        createLeadsWorker();
        qualifyLeadMock.mockResolvedValue({ qualificationScore: 50, summary: 'x', status: 'ok' });
        leadUpdateMock.mockRejectedValue(new Error('Record to update not found.'));

        await expect(capturedProcessor!(fakeJob({ leadId: 'lead-1', organizationId: 'org-1' })))
            .rejects.toThrow('Record to update not found.');
    });
});

describe('createLeadsWorker — dead-letter (QUEUE-001)', () => {
    it('registra a dead-letter só na falha FINAL (tentativas esgotadas)', async () => {
        createLeadsWorker();

        capturedFailedHandler!(
            fakeJob({ leadId: 'lead-1', organizationId: 'org-1' }, { attemptsMade: 3 }),
            new Error('provedor de IA fora do ar'),
        );
        await vi.waitFor(() => expect(auditLogCreateMock).toHaveBeenCalledTimes(1));

        const call = auditLogCreateMock.mock.calls[0][0].data;
        expect(call.action).toBe('QUEUE_DEAD_LETTER');
        expect(call.tenantId).toBe('org-1');
        const details = JSON.parse(call.details);
        expect(details.queue).toBe('leads-enrichment');
        expect(details.attemptsMade).toBe(3);
        expect(details.error).toContain('provedor de IA fora do ar');
    });

    it('NÃO registra dead-letter numa falha intermediária (ainda há retry pela frente)', async () => {
        createLeadsWorker();

        capturedFailedHandler!(
            fakeJob({ leadId: 'lead-1', organizationId: 'org-1' }, { attemptsMade: 1 }),
            new Error('timeout passageiro'),
        );
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(auditLogCreateMock).not.toHaveBeenCalled();
    });
});
