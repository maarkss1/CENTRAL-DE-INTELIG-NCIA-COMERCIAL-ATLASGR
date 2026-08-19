import { describe, it, expect, vi, beforeEach } from 'vitest';

// runColdLeadsScan varre leads frios de cada organização habilitada e busca insights de RAG.
// Antes desta correção, `prisma.lead.findMany` rodava FORA do `requestContext.run({ tenantId })`
// que envolvia o resto do processamento por organização — sem `app.current_tenant_id` setado na
// extensão RLS de src/lib/prisma.ts, a policy de RLS (FORCE ROW LEVEL SECURITY) devolveria zero
// linhas sempre (ou vazaria entre tenants, dependendo do papel de banco), mesmo com o filtro
// explícito de `organizationId` no WHERE. Este teste garante que a busca de leads acontece DENTRO
// do contexto de tenant correto — mesmo padrão já usado em runBitrixSyncTick (syncRules.ts).

vi.mock('node-cron', () => ({
    default: { schedule: vi.fn() },
}));

// Captura os handlers registrados em `worker.on(...)` para exercer `createColdLeadsScannerWorker`
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

const leadFindMany = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
    },
}));

const searchChunks = vi.fn();
vi.mock('../../../../../src/features/intelligence/services/vector-search.service.js', () => ({
    VectorSearchService: { searchChunks: (...args: unknown[]) => searchChunks(...args) },
}));

const enabledOrganizations = vi.fn();
vi.mock('../../../../../src/features/intelligence/services/swarmScheduler.service.js', () => ({
    enabledOrganizations: () => enabledOrganizations(),
}));

let queuesEnabledValue = false;
let redisConfiguredValue = false;
const cacheGet = vi.fn();
const cacheSet = vi.fn();
const cacheDel = vi.fn();
const cacheEval = vi.fn();
vi.mock('../../../../../src/lib/queue/redis.js', () => ({
    connection: {},
    get queuesEnabled() {
        return queuesEnabledValue;
    },
    get redisConfigured() {
        return redisConfiguredValue;
    },
    cacheConnection: {
        get: (...args: unknown[]) => cacheGet(...args),
        set: (...args: unknown[]) => cacheSet(...args),
        del: (...args: unknown[]) => cacheDel(...args),
        eval: (...args: unknown[]) => cacheEval(...args),
    },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { requestContext } = await import('../../../../../src/lib/async-context.js');
const { runColdLeadsScan, createColdLeadsScannerWorker, COLD_LEADS_SCANNER_QUEUE_NAME } = await import(
    '../../../../../src/features/automations/application/cold-leads-scanner.service.js'
);

beforeEach(() => {
    vi.clearAllMocks();
    queuesEnabledValue = false;
    redisConfiguredValue = false; // ambiente unitário sem Redis configurado: execução local permitida.
    searchChunks.mockResolvedValue([]);
});

describe('runColdLeadsScan — contexto de RLS por organização', () => {
    it('busca os leads frios com o tenantId já setado no requestContext', async () => {
        enabledOrganizations.mockResolvedValue(['org-1']);

        let tenantIdDuranteFindMany: string | undefined;
        leadFindMany.mockImplementation(async () => {
            tenantIdDuranteFindMany = requestContext.getStore()?.tenantId;
            return [];
        });

        await runColdLeadsScan();

        expect(leadFindMany).toHaveBeenCalledTimes(1);
        expect(tenantIdDuranteFindMany).toBe('org-1');
    });

    it('processa cada organização habilitada isoladamente e soma o total varrido', async () => {
        enabledOrganizations.mockResolvedValue(['org-1', 'org-2']);
        leadFindMany
            .mockResolvedValueOnce([{ id: 'lead-1', company: { segment: 'X', size: 'Y', tradeName: 'Z' } }])
            .mockResolvedValueOnce([{ id: 'lead-2', company: null }, { id: 'lead-3', company: null }]);

        const result = await runColdLeadsScan();

        expect(result.organizations).toBe(2);
        expect(result.scanned).toBe(3);
        expect(searchChunks).toHaveBeenCalledTimes(3);
    });

    it('sem organizações habilitadas: não busca lead nenhum', async () => {
        enabledOrganizations.mockResolvedValue([]);

        const result = await runColdLeadsScan();

        expect(result).toEqual(expect.objectContaining({ organizations: 0, scanned: 0, failures: 0 }));
        expect(leadFindMany).not.toHaveBeenCalled();
    });
});

// RUN-006 (Sprint 02/Onda 14): contrato comum de dead-letter (`recordDeadLetter`/`isFinalAttempt`,
// ver src/lib/queue/deadLetter.ts) adotado no `worker.on('failed', ...)` deste worker.
describe('createColdLeadsScannerWorker — dead-letter na última tentativa', () => {
    function getFailedHandler(): (job: unknown, err: Error) => void {
        createColdLeadsScannerWorker();
        const call = workerOn.mock.calls.find(([event]) => event === 'failed');
        expect(call).toBeDefined();
        return call![1];
    }

    it('registra recordDeadLetter com os campos do job quando a falha é a última tentativa', () => {
        isFinalAttemptMock.mockReturnValue(true);
        const failedHandler = getFailedHandler();

        const job = { id: 'job-1', name: 'daily-cold-leads-scan', attemptsMade: 3, opts: { attempts: 3 } };
        const err = new Error('provedor de embeddings fora do ar');
        failedHandler(job, err);

        expect(isFinalAttemptMock).toHaveBeenCalledWith(3, 3);
        expect(recordDeadLetterMock).toHaveBeenCalledWith(expect.objectContaining({
            queue: COLD_LEADS_SCANNER_QUEUE_NAME,
            jobId: 'job-1',
            jobName: 'daily-cold-leads-scan',
            attemptsMade: 3,
            error: err,
        }));
    });

    it('não registra dead-letter quando ainda restam tentativas', () => {
        isFinalAttemptMock.mockReturnValue(false);
        const failedHandler = getFailedHandler();

        failedHandler({ id: 'job-1', name: 'daily-cold-leads-scan', attemptsMade: 1, opts: { attempts: 3 } }, new Error('falha transitória'));

        expect(recordDeadLetterMock).not.toHaveBeenCalled();
    });
});
