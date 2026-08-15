/**
 * Deduplicação e isolamento de tenant exigidos pela missão da Onda 2 do Agente 05:
 * - `discoverCandidates` não pode devolver a mesma empresa duas vezes quando ela aparece em mais
 *   de um provider (Apollo + Google Places, aqui com nomes em capitalização diferente).
 * - `promoteToCrm`/`findExistingCompany` não pode criar uma segunda Company para uma empresa já
 *   cadastrada (por nome), nem um segundo Lead aberto para a mesma Company.
 * - A busca de dedupe por CNPJ é escopada por `organizationId` — nunca deve considerar uma
 *   empresa de outra organização como "já existente" (isolamento de tenant AtlasGR/TotalTrac).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// findExistingCompany roda SQL cru (regexp_replace de CNPJ) fora do que a extensão
// $allOperations de prisma.ts intercepta — por isso passa por withRlsContext (ver
// src/lib/prisma.ts) em vez de prisma.$queryRaw direto. O mock simula a transação: `fn` recebe
// um client (`tx`) com o próprio $queryRaw mockado, no mesmo padrão já usado em
// tests/unit/lib/ai/vectorStore.test.ts.
const { queryRawMock, withRlsContextMock } = vi.hoisted(() => {
    const queryRawMock = vi.fn();
    const withRlsContextMock = vi.fn((fn: (tx: { $queryRaw: typeof queryRawMock }) => unknown) => fn({ $queryRaw: queryRawMock }));
    return { queryRawMock, withRlsContextMock };
});

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        company: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
        contact: { create: vi.fn() },
        lead: { findFirst: vi.fn(), create: vi.fn() },
    },
    withRlsContext: (fn: (tx: unknown) => unknown) => withRlsContextMock(fn as never),
}));

vi.mock('../../../../../src/features/prospecting/services/enrichment.service', () => ({
    enrichCompany: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../src/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../../src/features/integrations/bitrix/bitrix.service.js', () => ({
    pushLeadToBitrix: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../src/features/prospecting/services/apollo.service', () => ({
    fetchApolloCandidates: vi.fn(),
    searchDecisionMakersAdvanced: vi.fn(),
}));

vi.mock('../../../../../src/features/prospecting/services/places.service', () => ({
    searchGooglePlacesCandidates: vi.fn(),
}));

vi.mock('../../../../../src/features/prospecting/services/nominatim.service', () => ({
    searchNominatimCandidates: vi.fn(),
}));

vi.mock('../../../../../src/config/prospecting-integrations.js', () => ({
    getProspectingProviderMode: vi.fn(),
}));

import { prisma } from '../../../../../src/lib/prisma.js';
import { fetchApolloCandidates } from '../../../../../src/features/prospecting/services/apollo.service';
import { searchGooglePlacesCandidates } from '../../../../../src/features/prospecting/services/places.service';
import { searchNominatimCandidates } from '../../../../../src/features/prospecting/services/nominatim.service';
import { getProspectingProviderMode } from '../../../../../src/config/prospecting-integrations.js';
import { discoverCandidates, promoteToCrm, type ProspectCriteria, type PromoteInput } from '../../../../../src/features/prospecting/services/prospecting.service';

const companyMock = prisma.company as unknown as {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
};
const leadMock = prisma.lead as unknown as { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
const mockFetchApolloCandidates = vi.mocked(fetchApolloCandidates);
const mockSearchGooglePlacesCandidates = vi.mocked(searchGooglePlacesCandidates);
const mockSearchNominatimCandidates = vi.mocked(searchNominatimCandidates);
const mockGetProspectingProviderMode = vi.mocked(getProspectingProviderMode);

beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
});

describe('discoverCandidates — dedupe entre providers', () => {
    const criteria: ProspectCriteria = { segmento: 'Transportadora', localizacao: 'Rio de Janeiro e Região', quantidade: 5 };

    it('não duplica a mesma empresa quando Apollo e Google Places devolvem o mesmo nome (case-insensitive)', async () => {
        mockGetProspectingProviderMode.mockReturnValue('hybrid');
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
        mockSearchGooglePlacesCandidates.mockResolvedValue([
            { tradeName: 'TRANSPORTADORA EXEMPLO' }, // mesmo nome, capitalização diferente — deve ser filtrado
            { tradeName: 'Transportadora Nova' }, // empresa realmente nova — deve entrar
        ]);
        mockSearchNominatimCandidates.mockResolvedValue([]);

        const result = await discoverCandidates(criteria);

        const names = result.candidates.map((c) => c.tradeName.toLowerCase());
        expect(names.filter((n) => n === 'transportadora exemplo')).toHaveLength(1);
        expect(names).toContain('transportadora nova');
        expect(result.candidates).toHaveLength(2);
    });
});

describe('findExistingCompany (via promoteToCrm) — dedupe por nome e por CNPJ', () => {
    const baseInput: PromoteInput = {
        tradeName: 'Transportadora Exemplo',
        source: 'Descoberta',
        organizationId: 'org-1',
    };

    it('reaproveita a Company existente em vez de criar uma nova quando o nome já bate', async () => {
        companyMock.findFirst.mockResolvedValue({ id: 'comp-existente', cnpj: null });
        leadMock.findFirst.mockResolvedValue(null); // não há lead aberto — cria um novo lead para a company reaproveitada
        leadMock.create.mockResolvedValue({
            id: 'lead-novo',
            status: 'Novo_Lead',
            companyId: 'comp-existente',
            company: { id: 'comp-existente', status: 'Ativo' },
            contact: null,
        });

        const result = await promoteToCrm(baseInput);

        expect(companyMock.create).not.toHaveBeenCalled();
        expect(result.lead.companyId).toBe('comp-existente');
    });

    it('não cria um segundo Lead aberto para a mesma Company — devolve alreadyExists', async () => {
        companyMock.findFirst.mockResolvedValue({ id: 'comp-existente', cnpj: null });
        leadMock.findFirst.mockResolvedValue({
            id: 'lead-aberto',
            status: 'Novo_Lead',
            company: { id: 'comp-existente', status: 'Ativo' },
            contact: null,
            timeline: [],
        });

        const result = await promoteToCrm(baseInput);

        expect(leadMock.create).not.toHaveBeenCalled();
        expect(result.alreadyExists).toBe(true);
    });

    it('busca dedupe por CNPJ é escopada pelo organizationId do chamador (isolamento de tenant)', async () => {
        queryRawMock.mockResolvedValue([]); // nenhuma empresa com este CNPJ NESTE tenant
        companyMock.findFirst.mockResolvedValue(null);
        companyMock.create.mockResolvedValue({ id: 'comp-nova', cnpj: '11222333000181' });
        leadMock.create.mockResolvedValue({
            id: 'lead-1',
            status: 'Novo_Lead',
            company: { id: 'comp-nova', status: 'Ativo' },
            contact: null,
        });

        await promoteToCrm({ ...baseInput, cnpj: '11.222.333/0001-81', organizationId: 'org-A' });

        // A busca de dedupe roda dentro de withRlsContext (não em prisma.$queryRaw direto) — sem
        // isso, a policy de RLS de "Company" (FORCE ROW LEVEL SECURITY) devolveria zero linhas
        // sempre em produção, mesmo com o WHERE de organizationId correto.
        expect(withRlsContextMock).toHaveBeenCalledTimes(1);
        expect(queryRawMock).toHaveBeenCalledTimes(1);
        const callArgs = queryRawMock.mock.calls[0];
        // O template tag `prisma.$queryRaw` recebe o array de strings + valores interpolados —
        // o organizationId do chamador precisa estar entre os valores (não hardcoded, não ausente).
        expect(callArgs).toContain('org-A');
        // Uma Company não encontrada dentro do tenant certo não é reaproveitada — cria uma nova
        // em vez de vazar/reaproveitar um registro de outra organização.
        expect(companyMock.create).toHaveBeenCalledTimes(1);
    });
});
