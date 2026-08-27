/**
 * Onda 42 (dossiê CPI, DEC-13, opção A) — cobre a instrumentação real do Search-ID dentro de
 * `discoverCandidates` (prospecting.service.ts): o Search-ID é devolvido no resultado, a execução é
 * persistida com o critério/providers/resultados/custo corretos, e duas execuções de tenants
 * diferentes nunca se misturam na mesma persistência.
 *
 * Mesmo padrão de mocking de `tests/unit/features/prospecting/services/prospecting.service.dedupe.test.ts`
 * (mocka os providers externos e o Prisma client) — este arquivo foca só no que muda com o
 * Search-ID, não reduplica a cobertura de dedupe entre providers já existente lá.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSearchExecutionMock = vi.fn();

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        company: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
        contact: { create: vi.fn() },
        lead: { findFirst: vi.fn(), create: vi.fn() },
        prospectRejection: { findMany: vi.fn().mockResolvedValue([]) },
        prospectingSearchExecution: { create: (...args: unknown[]) => createSearchExecutionMock(...args) },
    },
    withRlsContext: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('../../../../../src/features/prospecting/services/enrichment.service', () => ({
    enrichCompany: vi.fn(),
}));

vi.mock('../../../../../src/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../../src/features/prospecting/services/apollo.service', () => ({
    fetchApolloCandidates: vi.fn(),
    searchDecisionMakersAdvanced: vi.fn(),
    enrichOrganizationWithContacts: vi.fn().mockResolvedValue({ contacts: [] }),
}));

vi.mock('../../../../../src/features/prospecting/services/places.service', () => ({
    searchGooglePlacesCandidates: vi.fn(),
}));

vi.mock('../../../../../src/features/prospecting/services/nominatim.service', () => ({
    searchNominatimCandidates: vi.fn(),
}));

vi.mock('../../../../../src/features/prospecting/services/cnpj.util', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../../src/features/prospecting/services/cnpj.util')>();
    return { ...actual, discoverCnpjByName: vi.fn().mockResolvedValue(null) };
});

vi.mock('../../../../../src/features/prospecting/services/news.service.js', () => ({
    searchCompanyNews: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../../src/config/prospecting-integrations.js', () => ({
    getProspectingProviderMode: vi.fn(),
}));

import { fetchApolloCandidates } from '../../../../../src/features/prospecting/services/apollo.service';
import { searchGooglePlacesCandidates } from '../../../../../src/features/prospecting/services/places.service';
import { searchNominatimCandidates } from '../../../../../src/features/prospecting/services/nominatim.service';
import { getProspectingProviderMode } from '../../../../../src/config/prospecting-integrations.js';
import { discoverCandidates, type ProspectCriteria } from '../../../../../src/features/prospecting/services/prospecting.service';

const mockFetchApolloCandidates = vi.mocked(fetchApolloCandidates);
const mockSearchGooglePlacesCandidates = vi.mocked(searchGooglePlacesCandidates);
const mockSearchNominatimCandidates = vi.mocked(searchNominatimCandidates);
const mockGetProspectingProviderMode = vi.mocked(getProspectingProviderMode);

const criteria: ProspectCriteria = { segmento: 'Transportadora', localizacao: 'Rio de Janeiro', quantidade: 5 };

beforeEach(() => {
    vi.clearAllMocks();
    createSearchExecutionMock.mockResolvedValue({});
    mockGetProspectingProviderMode.mockReturnValue('hybrid');
    mockSearchNominatimCandidates.mockResolvedValue([]);
});

describe('discoverCandidates — Search-ID', () => {
    it('devolve um searchId em toda execução, mesmo sem organizationId (nada pra persistir, mas o id existe)', async () => {
        mockFetchApolloCandidates.mockResolvedValue({ candidates: [] });
        mockSearchGooglePlacesCandidates.mockResolvedValue([]);

        const result = await discoverCandidates(criteria);

        expect(result.searchId).toBeTruthy();
        expect(typeof result.searchId).toBe('string');
        expect(createSearchExecutionMock).not.toHaveBeenCalled(); // sem organizationId, não há tenant pra escopar a escrita
    });

    it('duas execuções seguidas geram Search-IDs diferentes', async () => {
        mockFetchApolloCandidates.mockResolvedValue({ candidates: [] });
        mockSearchGooglePlacesCandidates.mockResolvedValue([]);

        const first = await discoverCandidates(criteria);
        const second = await discoverCandidates(criteria);

        expect(first.searchId).not.toBe(second.searchId);
    });

    it('persiste critério, resultados e custo corretos quando organizationId é informado', async () => {
        mockFetchApolloCandidates.mockResolvedValue({
            candidates: [
                {
                    tradeName: 'Transportadora Exemplo',
                    legalNameGuess: null,
                    cnpjGuess: null,
                    segment: 'Transportadora',
                    size: 'Não informado',
                    location: 'RJ',
                    fitScoreEstimate: 70,
                    suggestedContact: null,
                    rationale: 'Apollo',
                },
            ],
        });
        mockSearchGooglePlacesCandidates.mockResolvedValue([{ tradeName: 'Transportadora Nova' }]);

        const result = await discoverCandidates(criteria, 'org-1');

        expect(createSearchExecutionMock).toHaveBeenCalledTimes(1);
        const { data } = createSearchExecutionMock.mock.calls[0][0];

        expect(data.id).toBe(result.searchId);
        expect(data.organizationId).toBe('org-1');
        expect(data.savedSearchId).toBeNull();
        expect(data.criteria).toEqual(criteria);
        expect(data.providerMode).toBe('hybrid');
        expect(data.totalResults).toBe(result.candidates.length);
        expect(data.totalResults).toBe(2);

        // Providers realmente chamados nesta execução: Apollo (org search, hybrid) e Google Places —
        // Nominatim não roda porque total (5) não passa do limiar de 15 (ver runNominatim em
        // discoverCandidates).
        const providers = data.providersCalled.map((c: { provider: string }) => c.provider);
        expect(providers).toContain('apollo');
        expect(providers).toContain('google_places');
        expect(providers).not.toContain('nominatim');

        const apolloCall = data.providersCalled.find((c: { provider: string }) => c.provider === 'apollo');
        expect(apolloCall.resultCount).toBe(1);
        expect(apolloCall.status).toBe('ok');
        expect(data.costUsd).toBeGreaterThan(0); // Apollo é faturável — custo estimado > 0
        expect(data.status).toBe('success');
    });

    it('registra savedSearchId quando a execução veio de uma busca salva', async () => {
        mockFetchApolloCandidates.mockResolvedValue({ candidates: [] });
        mockSearchGooglePlacesCandidates.mockResolvedValue([]);

        await discoverCandidates(criteria, 'org-1', 'saved-search-1');

        expect(createSearchExecutionMock.mock.calls[0][0].data.savedSearchId).toBe('saved-search-1');
    });

    it('registra status "partial" quando um provider falha mas a busca ainda devolve resultados', async () => {
        mockFetchApolloCandidates.mockRejectedValue(new Error('Apollo indisponível'));
        mockSearchGooglePlacesCandidates.mockResolvedValue([{ tradeName: 'Transportadora Nova' }]);

        const result = await discoverCandidates(criteria, 'org-1');

        expect(result.candidates.length).toBeGreaterThan(0);
        expect(result.apolloError).toBeTruthy();
        const { data } = createSearchExecutionMock.mock.calls[0][0];
        expect(data.status).toBe('partial');
        expect(data.errorMessage).toBe('Apollo indisponível');

        const apolloCall = data.providersCalled.find((c: { provider: string }) => c.provider === 'apollo');
        expect(apolloCall.status).toBe('error');
        expect(apolloCall.costUsd).toBe(0); // chamada que falhou não gastou crédito real
    });

    it('isolamento de tenant: execuções de organizações diferentes persistem cada uma com o organizationId correto, nunca misturado', async () => {
        mockFetchApolloCandidates.mockResolvedValue({ candidates: [] });
        mockSearchGooglePlacesCandidates.mockResolvedValue([]);

        await discoverCandidates(criteria, 'org-A');
        await discoverCandidates(criteria, 'org-B');

        expect(createSearchExecutionMock).toHaveBeenCalledTimes(2);
        const orgIds = createSearchExecutionMock.mock.calls.map((call) => call[0].data.organizationId);
        expect(orgIds).toEqual(['org-A', 'org-B']);

        const searchIds = createSearchExecutionMock.mock.calls.map((call) => call[0].data.id);
        expect(new Set(searchIds).size).toBe(2); // Search-IDs distintos, um registro por execução/tenant
    });
});
