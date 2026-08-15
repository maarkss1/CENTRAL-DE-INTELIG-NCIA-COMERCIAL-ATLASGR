import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichCompany, isEnrichmentFresh } from '@/features/prospecting/services/enrichment.service';
import { AppError } from '@/shared/middlewares/errorHandler';
import { prisma } from '@/lib/prisma';
import { enrichOrganizationWithContacts, enrichOrganizationByDomain } from '@/features/prospecting/services/apollo.service';

// PC-010: mesma classe de bug do PC-005, numa camada mais funda — enrichCompany lançava `Error`
// genérico para "empresa não encontrada", o que o errorHandler global tratava como 500 e mascarava
// a mensagem em produção.
vi.mock('@/lib/prisma', () => ({
    prisma: {
        company: {
            findFirst: vi.fn(),
            update: vi.fn(),
        },
        contact: {
            findMany: vi.fn(),
            createMany: vi.fn(),
        },
        enrichmentLog: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/prospecting/services/cnpj.util', () => ({
    isValidCnpj: vi.fn().mockReturnValue(false),
    discoverCnpjByName: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/features/intelligence/services/IcebreakerService', () => ({
    IcebreakerService: class {
        generateIcebreaker = vi.fn().mockResolvedValue(null);
    },
}));

vi.mock('@/features/prospecting/services/places.service', () => ({
    searchGooglePlace: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/features/prospecting/services/nominatim.service', () => ({
    searchNominatimPlace: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/features/prospecting/services/apollo.service', () => ({
    enrichOrganizationWithContacts: vi.fn().mockResolvedValue({ contacts: [], source: 'apollo' }),
    enrichOrganizationByDomain: vi.fn().mockResolvedValue({ organization: null }),
}));

vi.mock('@/features/prospecting/services/news.service', () => ({
    searchCompanyNews: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/features/prospecting/services/email-verification.service', () => ({
    checkEmailDeliverability: vi.fn().mockResolvedValue({ status: 'verified' }),
}));

vi.mock('@/features/prospecting/services/lookalike-scoring.service', () => ({
    computeLookalikeScore: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/features/prospecting/services/enrichment/cnpjLookup.js', () => ({
    fetchCnpjData: vi.fn(),
}));

vi.mock('@/features/prospecting/services/enrichment/domainGuess.js', () => ({
    guessDomainAndEmails: vi.fn().mockResolvedValue({ domain: '', verified: false, emails: [] }),
    extractDomainFromWebsite: vi.fn().mockReturnValue('empresa.com.br'),
    resolveEmailStatus: vi.fn().mockResolvedValue('guessed'),
    guessWhatsappFromPhone: vi.fn().mockReturnValue(null),
}));

const baseCompany = {
    id: 'comp-1',
    organizationId: 'org-1',
    cnpj: null,
    tradeName: 'Transportadora Exemplo',
    legalName: 'Transportadora Exemplo LTDA',
    website: 'https://empresa.com.br',
    phones: [] as string[],
    emails: [] as string[],
    technologies: [] as string[],
    keywords: [] as string[],
    city: null,
    state: null,
    segment: null,
    situacaoCadastral: null,
    capitalSocial: null,
    employeeCount: null,
    linkedin: null,
    twitter: null,
    facebook: null,
    enrichmentStatus: 'Pendente',
    enrichedAt: null as Date | null,
    lookalikeScore: null,
    lookalikeTopMatches: null,
    status: 'Ativo',
};

describe('enrichCompany', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.company.update).mockImplementation(async ({ data }: never) => ({ ...baseCompany, ...data }) as never);
        vi.mocked(prisma.contact.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.enrichmentLog.create).mockResolvedValue({} as never);
        vi.mocked(enrichOrganizationByDomain).mockResolvedValue({ organization: null } as never);
        vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({ contacts: [], source: 'apollo' } as never);
    });

    it('lança AppError 404 quando a empresa não existe', async () => {
        vi.mocked(prisma.company.findFirst).mockResolvedValue(null as never);

        await expect(enrichCompany('org-1', 'empresa-inexistente')).rejects.toMatchObject({
            constructor: AppError,
            statusCode: 404,
            message: 'Company not found',
        });
    });

    describe('dedupe de decisores (Apollo/Hunter) — LGPD/Onda 7 (05): não recriar contato já existente', () => {
        it('não recria um Contact cujo e-mail já existe para esta empresa', async () => {
            vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);
            vi.mocked(prisma.contact.findMany).mockResolvedValue([
                { email: 'joao@empresa.com.br', phone: null },
            ] as never);
            vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({
                contacts: [
                    { name: 'João Silva', title: 'Diretor', email: 'joao@empresa.com.br', phone: null, linkedin_url: null },
                    { name: 'Maria Souza', title: 'Compras', email: 'maria@empresa.com.br', phone: null, linkedin_url: null },
                ],
                source: 'apollo',
            } as never);

            await enrichCompany('org-1', 'comp-1', {});

            expect(prisma.contact.createMany).toHaveBeenCalledTimes(1);
            const call = vi.mocked(prisma.contact.createMany).mock.calls[0][0] as { data: Array<{ name: string; email: string | null }> };
            expect(call.data).toHaveLength(1);
            expect(call.data[0]).toMatchObject({ name: 'Maria Souza', email: 'maria@empresa.com.br' });
        });

        it('não recria um Contact cujo telefone já existe (e-mails diferentes/ausentes)', async () => {
            vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);
            vi.mocked(prisma.contact.findMany).mockResolvedValue([
                { email: null, phone: '(21) 99999-0000' },
            ] as never);
            vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({
                contacts: [
                    { name: 'João Silva', title: 'Diretor', email: null, phone: '21999990000', linkedin_url: null },
                ],
                source: 'apollo',
            } as never);

            await enrichCompany('org-1', 'comp-1', {});

            expect(prisma.contact.createMany).not.toHaveBeenCalled();
        });

        it('não chama prisma.contact.createMany quando não há decisor novo (todos já existentes)', async () => {
            vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);
            vi.mocked(prisma.contact.findMany).mockResolvedValue([
                { email: 'joao@empresa.com.br', phone: null },
            ] as never);
            vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({
                contacts: [
                    { name: 'João Silva', title: 'Diretor', email: 'joao@empresa.com.br', phone: null, linkedin_url: null },
                ],
                source: 'apollo',
            } as never);

            await enrichCompany('org-1', 'comp-1', {});

            expect(prisma.contact.createMany).not.toHaveBeenCalled();
        });
    });
});

describe('isEnrichmentFresh', () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    it('true quando enriquecido com sucesso e dentro do TTL', () => {
        const now = new Date('2026-01-02T00:00:00Z');
        const enrichedAt = new Date('2026-01-01T12:00:00Z');
        expect(isEnrichmentFresh({ enrichmentStatus: 'Enriquecido', enrichedAt }, now, ONE_DAY_MS)).toBe(true);
    });

    it('false quando o TTL já expirou', () => {
        const now = new Date('2026-01-03T00:00:00Z');
        const enrichedAt = new Date('2026-01-01T00:00:00Z');
        expect(isEnrichmentFresh({ enrichmentStatus: 'Enriquecido', enrichedAt }, now, ONE_DAY_MS)).toBe(false);
    });

    it('false quando a empresa nunca foi enriquecida (enrichedAt nulo)', () => {
        expect(isEnrichmentFresh({ enrichmentStatus: 'Pendente', enrichedAt: null })).toBe(false);
    });

    it('false quando o último enriquecimento falhou, mesmo com enrichedAt setado', () => {
        expect(isEnrichmentFresh({ enrichmentStatus: 'Falhou', enrichedAt: new Date() })).toBe(false);
    });
});

describe('enrichCompany — cache de reenriquecimento (TTL, evita gastar crédito de provider pago à toa)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.company.update).mockImplementation(async ({ data }: never) => ({ ...baseCompany, ...data }) as never);
        vi.mocked(prisma.contact.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.enrichmentLog.create).mockResolvedValue({} as never);
        vi.mocked(enrichOrganizationByDomain).mockResolvedValue({ organization: null } as never);
        vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({ contacts: [], source: 'apollo' } as never);
    });

    it('pula o pipeline pago quando a empresa já foi enriquecida dentro do TTL', async () => {
        const recentlyEnriched = { ...baseCompany, enrichmentStatus: 'Enriquecido', enrichedAt: new Date() };
        vi.mocked(prisma.company.findFirst).mockResolvedValue(recentlyEnriched as never);

        const result = await enrichCompany('org-1', 'comp-1', {});

        expect(prisma.company.update).not.toHaveBeenCalled();
        expect(prisma.enrichmentLog.create).not.toHaveBeenCalled();
        expect(enrichOrganizationWithContacts).not.toHaveBeenCalled();
        expect(result.cached).toBe(true);
        expect(result.fit.score).toBeGreaterThanOrEqual(0);
    });

    it('ignora o cache e roda o enriquecimento completo quando options.force = true', async () => {
        const recentlyEnriched = { ...baseCompany, enrichmentStatus: 'Enriquecido', enrichedAt: new Date() };
        vi.mocked(prisma.company.findFirst).mockResolvedValue(recentlyEnriched as never);

        const result = await enrichCompany('org-1', 'comp-1', { force: true });

        expect(prisma.company.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ enrichmentStatus: 'Enriquecendo' }) })
        );
        expect('cached' in result).toBe(false);
    });

    it('roda o enriquecimento completo normalmente quando a empresa nunca foi enriquecida', async () => {
        vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);

        const result = await enrichCompany('org-1', 'comp-1', {});

        expect(prisma.company.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ enrichmentStatus: 'Enriquecendo' }) })
        );
        expect('cached' in result).toBe(false);
    });
});
