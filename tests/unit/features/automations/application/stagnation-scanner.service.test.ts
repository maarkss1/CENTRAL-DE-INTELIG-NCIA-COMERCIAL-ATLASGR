import { describe, it, expect, vi, beforeEach } from 'vitest';

// Gatilho de estagnação (Onda 7): reavalia periodicamente automações com trigger "Lead mudou de
// status" cujas `conditions` incluem `daysSinceLastInteraction: { gte: N }`, disparando o mesmo
// `automationEngine.handle` de um evento em tempo real. Cobre: escopo de tenant, seleção correta
// de leads, idempotência (não reavisar duas vezes pela mesma sequência de estagnação) e o caso de
// trava distribuída já ocupada por outra instância.

vi.mock('node-cron', () => ({
    default: { schedule: vi.fn() },
}));

// Captura os handlers registrados em `worker.on(...)` para exercer `createStagnationScannerWorker`
// sem precisar de um Redis/BullMQ real — mesmo padrão de mock (`class`, não arrow function) usado
// em coldCall.worker.test.ts/swarmScheduler.worker.test.ts.
const workerOn = vi.fn();
vi.mock('bullmq', () => {
    class MockQueue {
        on() { /* no-op */ }
        upsertJobScheduler() { return Promise.resolve(); }
    }
    class MockWorker {
        on(...args: unknown[]) { return workerOn(...args); }
    }
    return { Queue: MockQueue, Worker: MockWorker };
});

const recordDeadLetterMock = vi.fn();
const isFinalAttemptMock = vi.fn();
vi.mock('../../../../../src/lib/queue/deadLetter.js', () => ({
    recordDeadLetter: (...args: unknown[]) => recordDeadLetterMock(...args),
    isFinalAttempt: (...args: unknown[]) => isFinalAttemptMock(...args),
}));

const organizationFindMany = vi.fn();
const automationFindMany = vi.fn();
const leadFindMany = vi.fn();
const auditLogFindFirst = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        organization: { findMany: (...args: unknown[]) => organizationFindMany(...args) },
        automation: { findMany: (...args: unknown[]) => automationFindMany(...args) },
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
        auditLog: { findFirst: (...args: unknown[]) => auditLogFindFirst(...args) },
    },
}));

const handleMock = vi.fn();
vi.mock('../../../../../src/features/automations/automation.engine.js', () => ({
    automationEngine: { handle: (...args: unknown[]) => handleMock(...args) },
}));

let lockAcquired = true;
const releaseMock = vi.fn();
const acquireDistributedLockMock = vi.fn(async () => ({ runId: 'run-1', acquired: lockAcquired, release: releaseMock }));
vi.mock('../../../../../src/lib/queue/distributedLock.js', () => ({
    acquireDistributedLock: (...args: unknown[]) => acquireDistributedLockMock(...args),
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { requestContext } = await import('../../../../../src/lib/async-context.js');
const { runStagnationScan, createStagnationScannerWorker, STAGNATION_SCANNER_QUEUE_NAME } = await import(
    '../../../../../src/features/automations/application/stagnation-scanner.service.js'
);

beforeEach(() => {
    vi.clearAllMocks();
    lockAcquired = true;
    organizationFindMany.mockResolvedValue([]);
    automationFindMany.mockResolvedValue([]);
    leadFindMany.mockResolvedValue([]);
    auditLogFindFirst.mockResolvedValue(null);
    handleMock.mockResolvedValue(1);
});

describe('runStagnationScan', () => {
    it('pula a execução inteira quando outra instância já detém a trava distribuída', async () => {
        lockAcquired = false;

        const result = await runStagnationScan();

        expect(result).toEqual(expect.objectContaining({ automationsEvaluated: 0, leadsScanned: 0, fired: 0 }));
        expect(organizationFindMany).not.toHaveBeenCalled();
    });

    it('ignora automações sem operador daysSinceLastInteraction (não são regra de estagnação)', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-1' }]);
        automationFindMany.mockResolvedValue([
            { id: 'auto-1', name: 'Avisar proposta', conditions: { status: 'Proposta Enviada' } }, // igualdade simples, não estagnação
            { id: 'auto-2', name: 'Sem condição', conditions: null },
        ]);

        const result = await runStagnationScan();

        expect(result.automationsEvaluated).toBe(0);
        expect(leadFindMany).not.toHaveBeenCalled();
    });

    it('busca os leads candidatos com o tenantId setado no requestContext', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-1' }]);
        automationFindMany.mockResolvedValue([
            { id: 'auto-1', name: 'Proposta sem resposta', conditions: { status: 'Proposta Enviada', daysSinceLastInteraction: { gte: 3 } } },
        ]);

        let tenantIdDuranteBusca: string | undefined;
        leadFindMany.mockImplementation(async () => {
            tenantIdDuranteBusca = requestContext.getStore()?.tenantId;
            return [];
        });

        await runStagnationScan();

        expect(tenantIdDuranteBusca).toBe('org-1');
    });

    it('filtra por status quando a condição especifica um, e mapeia para o enum interno do Prisma', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-1' }]);
        automationFindMany.mockResolvedValue([
            { id: 'auto-1', name: 'Proposta sem resposta', conditions: { status: 'Proposta Enviada', daysSinceLastInteraction: { gte: 3 } } },
        ]);
        leadFindMany.mockResolvedValue([]);

        await runStagnationScan();

        const call = leadFindMany.mock.calls[0][0];
        expect(call.where.status).toBe('Proposta_Enviada');
    });

    it('dispara automationEngine.handle para um lead estagnado, com daysSinceLastInteraction calculado', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-1' }]);
        automationFindMany.mockResolvedValue([
            { id: 'auto-1', name: 'Negócio parado', conditions: { daysSinceLastInteraction: { gte: 5 } } },
        ]);
        const lastInteraction = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        leadFindMany.mockResolvedValue([
            { id: 'lead-1', status: 'Proposta_Enviada', owner: 'Marcelo', temperature: 'Morno', score: 60, lastInteraction, createdAt: lastInteraction },
        ]);
        auditLogFindFirst.mockResolvedValue(null);

        const result = await runStagnationScan();

        expect(handleMock).toHaveBeenCalledTimes(1);
        const event = handleMock.mock.calls[0][0];
        expect(event).toEqual(expect.objectContaining({
            organizationId: 'org-1',
            trigger: 'Lead mudou de status',
            entity: 'Lead',
            entityId: 'lead-1',
        }));
        expect(event.data.daysSinceLastInteraction).toBeGreaterThanOrEqual(7);
        expect(event.data.streakKey).toBe(lastInteraction.toISOString());
        expect(result.fired).toBe(1);
    });

    it('não dispara de novo para a mesma sequência de estagnação já notificada (idempotência)', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-1' }]);
        automationFindMany.mockResolvedValue([
            { id: 'auto-1', name: 'Negócio parado', conditions: { daysSinceLastInteraction: { gte: 5 } } },
        ]);
        const lastInteraction = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        leadFindMany.mockResolvedValue([
            { id: 'lead-1', status: 'Proposta_Enviada', owner: 'Marcelo', temperature: 'Morno', score: 60, lastInteraction, createdAt: lastInteraction },
        ]);
        auditLogFindFirst.mockResolvedValue({ id: 'audit-existing' });

        const result = await runStagnationScan();

        expect(handleMock).not.toHaveBeenCalled();
        expect(result.fired).toBe(0);
    });

    it('uma falha ao reavaliar uma automação não impede as demais automações/organizações', async () => {
        organizationFindMany.mockResolvedValue([{ id: 'org-1' }]);
        automationFindMany.mockResolvedValue([
            { id: 'auto-1', name: 'Quebra', conditions: { daysSinceLastInteraction: { gte: 1 } } },
            { id: 'auto-2', name: 'Funciona', conditions: { daysSinceLastInteraction: { gte: 1 } } },
        ]);
        leadFindMany
            .mockRejectedValueOnce(new Error('banco fora do ar'))
            .mockResolvedValueOnce([]);

        const result = await runStagnationScan();

        expect(result.failures).toBe(1);
        expect(result.automationsEvaluated).toBe(2);
    });

    it('libera a trava distribuída mesmo quando a varredura falha', async () => {
        organizationFindMany.mockRejectedValue(new Error('organização fora do ar'));

        await runStagnationScan();

        expect(releaseMock).toHaveBeenCalledTimes(1);
    });
});

// RUN-006 (Sprint 02/Onda 14): contrato comum de dead-letter (`recordDeadLetter`/`isFinalAttempt`,
// ver src/lib/queue/deadLetter.ts) adotado no `worker.on('failed', ...)` deste worker.
describe('createStagnationScannerWorker — dead-letter na última tentativa', () => {
    function getFailedHandler(): (job: unknown, err: Error) => void {
        createStagnationScannerWorker();
        const call = workerOn.mock.calls.find(([event]) => event === 'failed');
        expect(call).toBeDefined();
        return call![1];
    }

    it('registra recordDeadLetter com os campos do job quando a falha é a última tentativa', () => {
        isFinalAttemptMock.mockReturnValue(true);
        const failedHandler = getFailedHandler();

        const job = { id: 'job-1', name: 'daily-stagnation-scan', attemptsMade: 3, opts: { attempts: 3 } };
        const err = new Error('banco fora do ar');
        failedHandler(job, err);

        expect(isFinalAttemptMock).toHaveBeenCalledWith(3, 3);
        expect(recordDeadLetterMock).toHaveBeenCalledWith(expect.objectContaining({
            queue: STAGNATION_SCANNER_QUEUE_NAME,
            jobId: 'job-1',
            jobName: 'daily-stagnation-scan',
            attemptsMade: 3,
            error: err,
        }));
    });

    it('não registra dead-letter quando ainda restam tentativas', () => {
        isFinalAttemptMock.mockReturnValue(false);
        const failedHandler = getFailedHandler();

        failedHandler({ id: 'job-1', name: 'daily-stagnation-scan', attemptsMade: 1, opts: { attempts: 3 } }, new Error('falha transitória'));

        expect(recordDeadLetterMock).not.toHaveBeenCalled();
    });
});
