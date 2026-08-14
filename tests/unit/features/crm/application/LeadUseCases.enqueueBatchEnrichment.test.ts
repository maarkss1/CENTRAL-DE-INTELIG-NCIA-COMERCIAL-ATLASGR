import { describe, it, expect, vi, beforeEach } from 'vitest';

// enqueueBatchEnrichment enfileira o enriquecimento em lote de leads com empresa pendente.
// Antes desta correção, quando as filas estavam desabilitadas (queuesEnabled=false,
// enrichmentQueue=null — ver src/lib/queue/enrichment.queue.ts), `enrichmentQueue?.addBulk` era um
// no-op silencioso e a função MESMO ASSIM marcava as empresas como "Enriquecendo" e reportava
// `{ enqueued: N }`, uma falsa promessa de que os leads seriam enriquecidos. Este teste cobre o
// comportamento honesto: sem filas, nada é marcado, nenhum job é criado, e o retorno expõe
// `enfileirado: false` + `motivo` para o cliente da API distinguir os dois casos.

const leadFindMany = vi.fn();
const companyUpdateMany = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
        company: { updateMany: (...args: unknown[]) => companyUpdateMany(...args) },
    },
}));

const addBulk = vi.fn();
let enrichmentQueueValue: { addBulk: typeof addBulk } | null = { addBulk };
vi.mock('../../../../../src/lib/queue/enrichment.queue.js', () => ({
    get enrichmentQueue() {
        return enrichmentQueueValue;
    },
}));

let queuesEnabledValue = true;
vi.mock('../../../../../src/lib/queue/redis.js', () => ({
    get queuesEnabled() {
        return queuesEnabledValue;
    },
}));

const { LeadUseCases } = await import('../../../../../src/features/crm/application/LeadUseCases.js');

// Stub mínimo: enqueueBatchEnrichment não usa o repositório diretamente.
const repositoryStub = {} as ConstructorParameters<typeof LeadUseCases>[0];
const useCases = new LeadUseCases(repositoryStub);

const ORG = 'org-enrich-1';
const pendingLeads = [
    { id: 'lead-1', companyId: 'company-1', company: { cnpj: '11111111000191', segment: 'Transportadora' } },
    { id: 'lead-2', companyId: 'company-2', company: { cnpj: null, segment: null } },
];

beforeEach(() => {
    vi.clearAllMocks();
    queuesEnabledValue = true;
    enrichmentQueueValue = { addBulk };
    leadFindMany.mockResolvedValue(pendingLeads);
    companyUpdateMany.mockResolvedValue({ count: 2 });
    addBulk.mockResolvedValue(undefined);
});

describe('LeadUseCases.enqueueBatchEnrichment', () => {
    it('sem leads pendentes: não toca fila nem empresas, reporta enqueued=0', async () => {
        leadFindMany.mockResolvedValue([]);

        const result = await useCases.enqueueBatchEnrichment(ORG);

        expect(result).toEqual({ enqueued: 0, enfileirado: true });
        expect(addBulk).not.toHaveBeenCalled();
        expect(companyUpdateMany).not.toHaveBeenCalled();
    });

    it('com filas habilitadas: enfileira os jobs e marca as empresas como Enriquecendo', async () => {
        const result = await useCases.enqueueBatchEnrichment(ORG);

        expect(result).toEqual({ enqueued: 2, enfileirado: true });
        expect(addBulk).toHaveBeenCalledTimes(1);
        expect(companyUpdateMany).toHaveBeenCalledWith({
            where: { id: { in: ['company-1', 'company-2'] } },
            data: { enrichmentStatus: 'Enriquecendo' },
        });
    });

    it('com filas desabilitadas: não enfileira nada, não marca empresas, e reporta o motivo honesto', async () => {
        queuesEnabledValue = false;
        enrichmentQueueValue = null;

        const result = await useCases.enqueueBatchEnrichment(ORG);

        expect(result).toEqual({
            enqueued: 0,
            enfileirado: false,
            motivo: 'filas desabilitadas',
            leadsPendentes: 2,
        });
        expect(addBulk).not.toHaveBeenCalled();
        expect(companyUpdateMany).not.toHaveBeenCalled();
    });
});
