/**
 * Onda 42 (dossiê CPI, DEC-13, opção A) — cobre `SearchExecutionTracker`/`findSearchExecution`
 * (searchExecution.service.ts): geração do Search-ID, acumulação de chamadas de provider + custo,
 * persistência do registro final (sucesso e erro), e isolamento de tenant na leitura.
 *
 * `prisma.prospectingSearchExecution` ainda não existe na Prisma Client gerada (model proposto em
 * `.agents/handoffs/onda-42/06-para-00-model-search-execution.md`, aguardando o dono do
 * schema/migrations aplicar) — o mock abaixo simula exatamente o shape que o model vai ter. Depois
 * da migration aplicada, este teste continua válido sem alteração (só passa a exercitar o delegate
 * real gerado, em vez do cast controlado documentado no topo de searchExecution.service.ts).
 *
 * "Isolamento de tenant" aqui é coberto no nível testável hoje (a query de leitura sempre inclui
 * `organizationId` no `where`, e nunca devolve o registro de outro tenant mesmo que o Search-ID seja
 * conhecido) — um teste de integração real contra Postgres com RLS (mesmo padrão de
 * `tests/integration/prospecting-rls.test.ts`) fica documentado como próximo passo no handoff,
 * porque a tabela real ainda não existe em nenhum banco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        prospectingSearchExecution: {
            create: (...args: unknown[]) => createMock(...args),
            findFirst: (...args: unknown[]) => findFirstMock(...args),
        },
    },
}));

vi.mock('../../../../../src/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SearchExecutionTracker, findSearchExecution } from '../../../../../src/features/prospecting/services/searchExecution.service';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('SearchExecutionTracker — geração do Search-ID', () => {
    it('gera um Search-ID (cuid-like: minúsculo, alfanumérico) já no construtor, antes de qualquer chamada de provider', () => {
        const tracker = new SearchExecutionTracker({ organizationId: 'org-1', criteria: {}, providerMode: 'hybrid' });

        expect(tracker.searchId).toBeTruthy();
        expect(tracker.searchId).toMatch(/^[a-z0-9]+$/);
        expect(tracker.searchId.length).toBeGreaterThanOrEqual(20);
    });

    it('cada execução gera um Search-ID diferente — nunca reaproveita entre buscas', () => {
        const trackerA = new SearchExecutionTracker({ organizationId: 'org-1', criteria: {}, providerMode: 'hybrid' });
        const trackerB = new SearchExecutionTracker({ organizationId: 'org-1', criteria: {}, providerMode: 'hybrid' });

        expect(trackerA.searchId).not.toBe(trackerB.searchId);
    });
});

describe('SearchExecutionTracker — acumulação de chamadas de provider e custo', () => {
    it('atribui ordem crescente (1-based) a cada chamada registrada', () => {
        const tracker = new SearchExecutionTracker({ organizationId: 'org-1', criteria: {}, providerMode: 'hybrid' });

        tracker.recordProviderCall({ provider: 'apollo', resultCount: 5 });
        tracker.recordProviderCall({ provider: 'google_places', resultCount: 3 });
        tracker.recordProviderCall({ provider: 'nominatim', resultCount: 0 });

        expect(tracker.providerCalls.map((c) => c.order)).toEqual([1, 2, 3]);
        expect(tracker.providerCalls.map((c) => c.provider)).toEqual(['apollo', 'google_places', 'nominatim']);
    });

    it('soma custo só para providers faturáveis (apollo/hunter) com status ok — google_places/nominatim/receita_federal/news_search custam 0', () => {
        const tracker = new SearchExecutionTracker({ organizationId: 'org-1', criteria: {}, providerMode: 'hybrid' });

        tracker.recordProviderCall({ provider: 'apollo', resultCount: 10 });
        tracker.recordProviderCall({ provider: 'hunter', resultCount: 2 });
        tracker.recordProviderCall({ provider: 'google_places', resultCount: 4 });
        tracker.recordProviderCall({ provider: 'receita_federal', resultCount: 1 });
        tracker.recordProviderCall({ provider: 'news_search', resultCount: 1 });

        const apolloCall = tracker.providerCalls.find((c) => c.provider === 'apollo')!;
        const hunterCall = tracker.providerCalls.find((c) => c.provider === 'hunter')!;
        const placesCall = tracker.providerCalls.find((c) => c.provider === 'google_places')!;

        expect(apolloCall.costUsd).toBeGreaterThan(0);
        expect(hunterCall.costUsd).toBeGreaterThan(0);
        expect(placesCall.costUsd).toBe(0);
        expect(tracker.providerCalls.find((c) => c.provider === 'receita_federal')!.costUsd).toBe(0);
        expect(tracker.providerCalls.find((c) => c.provider === 'news_search')!.costUsd).toBe(0);
        expect(tracker.totalCostUsd).toBeCloseTo(apolloCall.costUsd + hunterCall.costUsd, 6);
    });

    it('uma chamada Apollo que falhou (status error) não soma custo — não gastou crédito real', () => {
        const tracker = new SearchExecutionTracker({ organizationId: 'org-1', criteria: {}, providerMode: 'hybrid' });

        tracker.recordProviderCall({ provider: 'apollo', resultCount: 0, status: 'error', errorMessage: 'Apollo API respondeu 500' });

        expect(tracker.providerCalls[0].costUsd).toBe(0);
        expect(tracker.providerCalls[0].status).toBe('error');
        expect(tracker.providerCalls[0].errorMessage).toBe('Apollo API respondeu 500');
        expect(tracker.totalCostUsd).toBe(0);
    });
});

describe('SearchExecutionTracker.finish — persistência', () => {
    const criteria = { segmento: 'Transportadora', localizacao: 'RJ', quantidade: 10 };

    it('persiste o registro completo (id, tenant, critério, providers chamados, resultados, custo, status, timestamps) em sucesso', async () => {
        createMock.mockResolvedValue({});
        const tracker = new SearchExecutionTracker({
            organizationId: 'org-1',
            savedSearchId: 'saved-1',
            criteria,
            providerMode: 'hybrid',
        });
        tracker.recordProviderCall({ provider: 'apollo', resultCount: 5 });
        tracker.recordProviderCall({ provider: 'google_places', resultCount: 2 });

        await tracker.finish({ status: 'success', totalResults: 7 });

        expect(createMock).toHaveBeenCalledTimes(1);
        const { data } = createMock.mock.calls[0][0];
        expect(data.id).toBe(tracker.searchId);
        expect(data.organizationId).toBe('org-1');
        expect(data.savedSearchId).toBe('saved-1');
        expect(data.criteria).toEqual(criteria);
        expect(data.providerMode).toBe('hybrid');
        expect(data.providersCalled).toHaveLength(2);
        expect(data.providersCalled[0]).toMatchObject({ provider: 'apollo', order: 1, resultCount: 5 });
        expect(data.totalResults).toBe(7);
        expect(data.costUsd).toBeGreaterThan(0);
        expect(data.status).toBe('success');
        expect(data.errorMessage).toBeNull();
        expect(data.startedAt).toBeInstanceOf(Date);
        expect(data.finishedAt).toBeInstanceOf(Date);
        expect(typeof data.durationMs).toBe('number');
    });

    it('persiste status "error" e a mensagem de erro quando a execução falhou', async () => {
        createMock.mockResolvedValue({});
        const tracker = new SearchExecutionTracker({ organizationId: 'org-1', criteria, providerMode: 'hybrid' });

        await tracker.finish({ status: 'error', totalResults: 0, errorMessage: 'Apollo API respondeu 500' });

        const { data } = createMock.mock.calls[0][0];
        expect(data.status).toBe('error');
        expect(data.errorMessage).toBe('Apollo API respondeu 500');
        expect(data.totalResults).toBe(0);
    });

    it('savedSearchId fica null quando a busca não veio de uma busca salva', async () => {
        createMock.mockResolvedValue({});
        const tracker = new SearchExecutionTracker({ organizationId: 'org-1', criteria, providerMode: 'free' });

        await tracker.finish({ status: 'success', totalResults: 0 });

        expect(createMock.mock.calls[0][0].data.savedSearchId).toBeNull();
    });

    it('não persiste (e não lança) quando organizationId não é conhecido — ex.: chamada de teste sem tenant', async () => {
        const tracker = new SearchExecutionTracker({ criteria, providerMode: 'free' });

        await expect(tracker.finish({ status: 'success', totalResults: 3 })).resolves.toBeUndefined();

        expect(createMock).not.toHaveBeenCalled();
    });

    it('nunca lança quando a persistência falha — rastreabilidade não pode derrubar a resposta ao usuário', async () => {
        createMock.mockRejectedValue(new Error('conexão com o banco perdida'));
        const tracker = new SearchExecutionTracker({ organizationId: 'org-1', criteria, providerMode: 'hybrid' });

        await expect(tracker.finish({ status: 'success', totalResults: 1 })).resolves.toBeUndefined();
    });

    it('é idempotente — chamar finish() duas vezes só persiste uma vez', async () => {
        createMock.mockResolvedValue({});
        const tracker = new SearchExecutionTracker({ organizationId: 'org-1', criteria, providerMode: 'hybrid' });

        await tracker.finish({ status: 'success', totalResults: 1 });
        await tracker.finish({ status: 'success', totalResults: 1 });

        expect(createMock).toHaveBeenCalledTimes(1);
    });
});

describe('findSearchExecution — isolamento de tenant na leitura', () => {
    it('busca sempre filtrando por id E organizationId juntos (nunca só pelo Search-ID)', async () => {
        findFirstMock.mockResolvedValue({ id: 'search-1', organizationId: 'org-A' });

        await findSearchExecution('search-1', 'org-A');

        expect(findFirstMock).toHaveBeenCalledWith({ where: { id: 'search-1', organizationId: 'org-A' } });
    });

    // Simula o comportamento real do banco com RLS (`tenant_isolation_policy`, ver handoff): uma
    // linha só é visível quando organizationId bate com o tenant da sessão — aqui, simulado no
    // próprio mock, que só "encontra" a execução quando o organizationId pedido bate com o dono.
    it('busca de um tenant nunca aparece pra outro — mesmo Search-ID, organizationId errado devolve null', async () => {
        const ownerOrgId = 'org-A';
        findFirstMock.mockImplementation(async ({ where }: { where: { id: string; organizationId: string } }) => {
            if (where.organizationId !== ownerOrgId) return null;
            return { id: where.id, organizationId: ownerOrgId, criteria: {}, totalResults: 3 };
        });

        const asOwner = await findSearchExecution('search-1', 'org-A');
        const asOther = await findSearchExecution('search-1', 'org-B');

        expect(asOwner).not.toBeNull();
        expect(asOwner?.organizationId).toBe('org-A');
        expect(asOther).toBeNull();
    });

    it('devolve null (não lança) quando a consulta falha', async () => {
        findFirstMock.mockRejectedValue(new Error('conexão com o banco perdida'));

        const result = await findSearchExecution('search-1', 'org-A');

        expect(result).toBeNull();
    });
});
