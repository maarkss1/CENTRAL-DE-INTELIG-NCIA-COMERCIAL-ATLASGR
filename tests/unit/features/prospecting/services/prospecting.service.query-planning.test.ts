/**
 * CPI DEC-12 (opção A) — regressão de `discoverCandidates` (prospecting.service.ts) depois de
 * substituir o cascade fixo pelo `QueryPlanner` (domain/queryPlanner.ts): prova, chamando a função
 * pública real (não só o planner isolado — ver domain/__tests__/queryPlanner.test.ts para esse
 * nível), que os providers concretos (`fetchApolloCandidates`, `searchGooglePlacesCandidates`,
 * `searchNominatimCandidates`) continuam recebendo a MESMA cota/condição que recebiam no cascade
 * hardcoded anterior, para os mesmos critérios de entrada. Mesmo padrão de mock de
 * `prospecting.service.dedupe.test.ts` (que já cobre a ordem de absorção/dedupe entre providers —
 * este arquivo foca especificamente na aritmética de cota/inclusão por modo e geografia).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        company: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
        contact: { create: vi.fn() },
        lead: { findFirst: vi.fn(), create: vi.fn() },
    },
    withRlsContext: (fn: (tx: { $queryRaw: ReturnType<typeof vi.fn> }) => unknown) => fn({ $queryRaw: vi.fn() }),
}));

vi.mock('../../../../../src/features/prospecting/services/enrichment.service', () => ({
    enrichCompany: vi.fn(),
}));

vi.mock('../../../../../src/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../../src/features/integrations/bitrix/bitrix.service.js', () => ({
    pushLeadToBitrix: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../src/features/prospecting/services/apollo.service', () => ({
    fetchApolloCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
    searchDecisionMakersAdvanced: vi.fn(),
    enrichOrganizationWithContacts: vi.fn().mockResolvedValue({ contacts: [] }),
}));

vi.mock('../../../../../src/features/prospecting/services/places.service', () => ({
    searchGooglePlacesCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../../src/features/prospecting/services/nominatim.service', () => ({
    searchNominatimCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../../src/features/prospecting/services/cnpj.util', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../../src/features/prospecting/services/cnpj.util')>();
    return { ...actual, discoverCnpjByName: vi.fn().mockResolvedValue(null) };
});

vi.mock('../../../../../src/features/prospecting/services/news.service.js', () => ({
    searchCompanyNews: vi.fn().mockResolvedValue([]),
}));

const mockGetProspectingProviderMode = vi.fn();
vi.mock('../../../../../src/config/prospecting-integrations.js', () => ({
    getProspectingProviderMode: (...args: unknown[]) => mockGetProspectingProviderMode(...args),
}));

import { fetchApolloCandidates } from '../../../../../src/features/prospecting/services/apollo.service';
import { searchGooglePlacesCandidates } from '../../../../../src/features/prospecting/services/places.service';
import { searchNominatimCandidates } from '../../../../../src/features/prospecting/services/nominatim.service';
import { discoverCandidates, type ProspectCriteria } from '../../../../../src/features/prospecting/services/prospecting.service';

const mockFetchApolloCandidates = vi.mocked(fetchApolloCandidates);
const mockSearchGooglePlacesCandidates = vi.mocked(searchGooglePlacesCandidates);
const mockSearchNominatimCandidates = vi.mocked(searchNominatimCandidates);

beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApolloCandidates.mockResolvedValue({ candidates: [] });
    mockSearchGooglePlacesCandidates.mockResolvedValue([]);
    mockSearchNominatimCandidates.mockResolvedValue([]);
});

describe('discoverCandidates — cota/inclusão de cada provider real (paridade com o cascade legado)', () => {
    it('modo hybrid, quantidade=20, sem cidade: Apollo pede 20, Google Places pede 20, Nominatim pede 20 (todos entram)', async () => {
        mockGetProspectingProviderMode.mockReturnValue('hybrid');
        // A leva primária já preenche a cota sozinha (20 candidatos vindos da Apollo) — sem isso o
        // QueryPlanner corretamente decidiria um reforço (planShortfallFallback), o que faria
        // Google Places ser chamado uma 2ª vez e confundiria a asserção de call count deste teste
        // (o reforço tem seu próprio teste dedicado, mais abaixo).
        mockFetchApolloCandidates.mockResolvedValue({
            candidates: Array.from({ length: 20 }, (_, i) => ({
                tradeName: `Empresa Apollo ${i}`,
                legalNameGuess: null,
                cnpjGuess: null,
                segment: 'Transportadora',
                size: 'Não informado',
                location: 'RJ',
                fitScoreEstimate: 70,
                suggestedContact: null,
                rationale: 'Apollo',
            })),
        });
        const criteria: ProspectCriteria = { segmento: 'Transportadora', localizacao: 'Rio de Janeiro e Região', quantidade: 20 };

        await discoverCandidates(criteria);

        expect(mockFetchApolloCandidates).toHaveBeenCalledTimes(1);
        expect(mockFetchApolloCandidates.mock.calls[0][1]).toBe(20);
        expect(mockSearchGooglePlacesCandidates).toHaveBeenCalledTimes(1);
        expect(mockSearchGooglePlacesCandidates.mock.calls[0][1]).toBe(20); // count + exclusions.size(0)
        expect(mockSearchNominatimCandidates).toHaveBeenCalledTimes(1);
        expect(mockSearchNominatimCandidates.mock.calls[0][1]).toBe(20);
    });

    it('modo hybrid, quantidade=20, com cidade+estado: Google Places pede só round(20*0.4)=8, Apollo continua pedindo 20', async () => {
        mockGetProspectingProviderMode.mockReturnValue('hybrid');
        const criteria: ProspectCriteria = {
            segmento: 'Transportadora',
            localizacao: 'Rio de Janeiro e Região',
            cidade: 'Niterói',
            estado: 'RJ',
            quantidade: 20,
        };

        await discoverCandidates(criteria);

        expect(mockFetchApolloCandidates.mock.calls[0][1]).toBe(20);
        expect(mockSearchGooglePlacesCandidates.mock.calls[0][1]).toBe(8);
    });

    it('modo free: Apollo NUNCA é chamado; Google Places/Nominatim são chamados normalmente', async () => {
        mockGetProspectingProviderMode.mockReturnValue('free');
        const criteria: ProspectCriteria = { segmento: 'Transportadora', localizacao: 'Rio de Janeiro e Região', quantidade: 20 };

        await discoverCandidates(criteria);

        expect(mockFetchApolloCandidates).not.toHaveBeenCalled();
        expect(mockSearchGooglePlacesCandidates).toHaveBeenCalledTimes(1);
        expect(mockSearchNominatimCandidates).toHaveBeenCalledTimes(1);
    });

    it('quantidade=10 (<=15): Nominatim não é chamado; Apollo/Google Places pedem 10', async () => {
        mockGetProspectingProviderMode.mockReturnValue('hybrid');
        const criteria: ProspectCriteria = { segmento: 'Transportadora', localizacao: 'Rio de Janeiro e Região', quantidade: 10 };

        await discoverCandidates(criteria);

        expect(mockSearchNominatimCandidates).not.toHaveBeenCalled();
        expect(mockFetchApolloCandidates.mock.calls[0][1]).toBe(10);
        expect(mockSearchGooglePlacesCandidates.mock.calls[0][1]).toBe(10);
    });

    it('reforço (fallback) só roda em modo hybrid quando a leva primária não preenche a cota — chama Google Places de novo com a cota restante', async () => {
        mockGetProspectingProviderMode.mockReturnValue('hybrid');
        mockFetchApolloCandidates.mockResolvedValue({ candidates: [] });
        // 5 candidatos únicos vindos da leva primária de Google Places — faltam 15 para completar a cota de 20.
        mockSearchGooglePlacesCandidates.mockResolvedValueOnce(
            Array.from({ length: 5 }, (_, i) => ({ tradeName: `Empresa ${i}` }))
        );
        const criteria: ProspectCriteria = { segmento: 'Transportadora', localizacao: 'Rio de Janeiro e Região', quantidade: 20 };

        await discoverCandidates(criteria);

        // 1ª chamada = leva primária, 2ª chamada = reforço do QueryPlanner (planShortfallFallback)
        expect(mockSearchGooglePlacesCandidates).toHaveBeenCalledTimes(2);
        const [, secondCallCount] = mockSearchGooglePlacesCandidates.mock.calls[1];
        // remaining = 20 - 5 = 15 (a cota que o QueryPlanner decidiu); `discoverViaGooglePlaces`
        // sempre pede `count + exclusions.size` ao provider real (mesmo comportamento pré-
        // existente, não alterado por esta refatoração — ver discoverViaGooglePlaces em
        // prospecting.service.ts) — e os 5 candidatos já absorvidos da leva primária entraram nas
        // exclusões, então 15 (cota) + 5 (exclusões) = 20.
        expect(secondCallCount).toBe(20);
    });

    it('modo free: nunca reforça (sem chave paga, reforçar com o mesmo provider gratuito não mudaria nada)', async () => {
        mockGetProspectingProviderMode.mockReturnValue('free');
        mockSearchGooglePlacesCandidates.mockResolvedValueOnce([{ tradeName: 'Só uma empresa' }]);
        const criteria: ProspectCriteria = { segmento: 'Transportadora', localizacao: 'Rio de Janeiro e Região', quantidade: 20 };

        await discoverCandidates(criteria);

        expect(mockSearchGooglePlacesCandidates).toHaveBeenCalledTimes(1);
    });
});
