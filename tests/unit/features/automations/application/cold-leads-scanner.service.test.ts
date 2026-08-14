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
const cacheGet = vi.fn();
const cacheSet = vi.fn();
const cacheDel = vi.fn();
vi.mock('../../../../../src/lib/queue/redis.js', () => ({
    get queuesEnabled() {
        return queuesEnabledValue;
    },
    cacheConnection: {
        get: (...args: unknown[]) => cacheGet(...args),
        set: (...args: unknown[]) => cacheSet(...args),
        del: (...args: unknown[]) => cacheDel(...args),
    },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// requestContext real (AsyncLocalStorage) — usamos a implementação de verdade para capturar,
// dentro do worker de busca de leads, qual tenantId estava setado no momento da chamada a
// prisma.lead.findMany.
const { requestContext } = await import('../../../../../src/lib/async-context.js');
const { runColdLeadsScan } = await import(
    '../../../../../src/features/automations/application/cold-leads-scanner.service.js'
);

beforeEach(() => {
    vi.clearAllMocks();
    queuesEnabledValue = false; // sem Redis: a trava distribuída é pulada, execução direta.
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
