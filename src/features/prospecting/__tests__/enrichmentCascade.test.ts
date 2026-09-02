import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEnrichmentCascade } from '@/features/prospecting/services/enrichmentCascade.service';
import { AppError } from '@/shared/middlewares/errorHandler';
import { prisma } from '@/lib/prisma';
import {
  enrichOrganizationByDomain,
  enrichOrganizationWithContacts,
} from '@/features/prospecting/services/apollo.service';
import {
  findEmailViaHunter,
  findPeopleViaDomainSearch,
} from '@/features/prospecting/services/hunter.service';
import { searchGooglePlaceDetailed } from '@/features/prospecting/services/places.service';

// Onda 2 (05) — critério "provider com erro silencioso": este arquivo era um placeholder que
// nunca chamava `runEnrichmentCascade` de verdade (só afirmava fatos triviais sobre um objeto
// estático). Reescrito para exercitar o orquestrador real: caminho feliz, dedupe, e — o ponto
// central do achado — o caso em que os três providers falham de verdade, que antes desta correção
// era gravado como `status: 'success'` / `dataOrigin: 'confirmado'` tanto no EnrichmentLog quanto
// na resposta da rota, indistinguível de "empresa sem dado novo disponível".

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    contact: {
      create: vi.fn(),
    },
    enrichmentLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/prospecting/services/apollo.service', () => ({
  enrichOrganizationByDomain: vi.fn(),
  enrichOrganizationWithContacts: vi.fn(),
}));

vi.mock('@/features/prospecting/services/hunter.service', () => ({
  findEmailViaHunter: vi.fn(),
  findPeopleViaDomainSearch: vi.fn(),
}));

vi.mock('@/features/prospecting/services/places.service', () => ({
  searchGooglePlaceDetailed: vi.fn(),
}));

vi.mock('@/features/prospecting/services/enrichment/cnpjLookup.js', () => ({
  fetchCnpjData: vi
    .fn()
    .mockResolvedValue({ found: false, cnpj: '', source: 'BrasilAPI-CNPJ', error: 'not_found' }),
}));

// resolveEmailStatus (nova checagem antes de criar Contact — auditoria da plataforma) faz uma
// verificação de MX real (checkEmailDeliverability); mockado para não depender de rede/DNS neste
// teste unitário. extractDomainFromWebsite/guessDomainAndEmails continuam reais (funções puras).
vi.mock('@/features/prospecting/services/enrichment/domainGuess.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/prospecting/services/enrichment/domainGuess.js')
    >();
  return { ...actual, resolveEmailStatus: vi.fn().mockResolvedValue(null) };
});

const baseCompany = {
  id: 'comp-1',
  organizationId: 'org-1',
  tradeName: 'Transportadora Exemplo',
  legalName: 'Transportadora Exemplo LTDA',
  cnpj: null,
  website: 'https://empresa.com.br',
  city: 'São Paulo',
  state: 'SP',
  phones: [] as string[],
  googleRating: null,
  address: null,
  businessHours: null,
  logoUrl: null,
  technologies: [] as string[],
  keywords: [] as string[],
  apolloOrgId: null,
  contacts: [] as Array<{ name: string; email: string | null; phone: string | null }>,
};

describe('runEnrichmentCascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.company.update).mockResolvedValue({} as never);
    vi.mocked(prisma.enrichmentLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.contact.create).mockResolvedValue({} as never);
    // Defaults sãos (sobrescritos por teste quando o cenário exige outra coisa) — sem isso, um
    // teste que esquece de mockar `findPeopleViaDomainSearch`/`findEmailViaHunter` cai num
    // `undefined.contacts`/`undefined.email`, que o próprio código sob teste (corretamente)
    // captura como "erro real do Hunter" em vez de deixar a suíte inteira quebrar.
    vi.mocked(findEmailViaHunter).mockResolvedValue({ email: null } as never);
    vi.mocked(findPeopleViaDomainSearch).mockResolvedValue({ contacts: [] } as never);
  });

  it('lança AppError 404 quando a empresa não existe/não pertence ao tenant', async () => {
    vi.mocked(prisma.company.findFirst).mockResolvedValue(null as never);

    await expect(runEnrichmentCascade('org-1', 'empresa-inexistente')).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 404,
    });
  });

  it('filtra por organizationId + deletedAt:null ao buscar a empresa (tenancy)', async () => {
    vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);
    vi.mocked(enrichOrganizationByDomain).mockResolvedValue({ organization: null } as never);
    vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({ contacts: [] } as never);
    vi.mocked(searchGooglePlaceDetailed).mockResolvedValue({ place: null } as never);

    await runEnrichmentCascade('org-1', 'comp-1');

    expect(prisma.company.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comp-1', organizationId: 'org-1', deletedAt: null },
      }),
    );
  });

  describe('caminho feliz — algum provider retorna dado real', () => {
    it('marca status "enriched", dataOrigin "confirmado" e enrichmentStatus "Enriquecido" quando a Apollo encontra a organização', async () => {
      vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);
      vi.mocked(enrichOrganizationByDomain).mockResolvedValue({
        organization: {
          id: 'apollo-org-1',
          website_url: 'https://empresa.com.br',
          logo_url: null,
          technology_names: [],
          keywords: [],
        },
      } as never);
      vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({ contacts: [] } as never);
      vi.mocked(searchGooglePlaceDetailed).mockResolvedValue({ place: null } as never);

      const result = await runEnrichmentCascade('org-1', 'comp-1');

      expect(result.status).toBe('enriched');
      expect(result.apolloEnriched).toBe(true);
      expect(result.errors).toEqual({});

      const logCall = vi.mocked(prisma.enrichmentLog.create).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(logCall.data).toMatchObject({ status: 'success', dataOrigin: 'confirmado' });

      const companyUpdateCalls = vi.mocked(prisma.company.update).mock.calls;
      const finalUpdate = companyUpdateCalls[companyUpdateCalls.length - 1][0] as {
        data: Record<string, unknown>;
      };
      expect(finalUpdate.data).toMatchObject({ enrichmentStatus: 'Enriquecido' });
    });

    it('deduplica decisores já existentes (por e-mail normalizado) antes de criar Contact novo', async () => {
      vi.mocked(prisma.company.findFirst).mockResolvedValue({
        ...baseCompany,
        contacts: [{ name: 'João Silva', email: 'joao@empresa.com.br', phone: null }],
      } as never);
      vi.mocked(enrichOrganizationByDomain).mockResolvedValue({ organization: null } as never);
      vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({
        contacts: [
          {
            name: 'João Silva',
            title: 'Diretor',
            email: 'joao@empresa.com.br',
            phone: null,
            linkedin_url: null,
          },
          {
            name: 'Maria Souza',
            title: 'Compras',
            email: 'maria@empresa.com.br',
            phone: null,
            linkedin_url: null,
          },
        ],
      } as never);
      vi.mocked(searchGooglePlaceDetailed).mockResolvedValue({ place: null } as never);

      const result = await runEnrichmentCascade('org-1', 'comp-1');

      expect(result.contactsAdded).toBe(1);
      expect(prisma.contact.create).toHaveBeenCalledTimes(1);
      expect(vi.mocked(prisma.contact.create).mock.calls[0][0]).toMatchObject({
        data: expect.objectContaining({ name: 'Maria Souza' }),
      });
    });

    it('preenche emailStatus do Contact novo com o resultado de resolveEmailStatus (achado corrigido: antes ficava sempre null)', async () => {
      const { resolveEmailStatus } = await import(
        '@/features/prospecting/services/enrichment/domainGuess.js'
      );
      vi.mocked(resolveEmailStatus).mockResolvedValue('verified');

      vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);
      vi.mocked(enrichOrganizationByDomain).mockResolvedValue({ organization: null } as never);
      vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({
        contacts: [
          {
            name: 'Maria Souza',
            title: 'Compras',
            email: 'maria@empresa.com.br',
            phone: null,
            linkedin_url: null,
          },
        ],
      } as never);
      vi.mocked(searchGooglePlaceDetailed).mockResolvedValue({ place: null } as never);

      await runEnrichmentCascade('org-1', 'comp-1');

      expect(resolveEmailStatus).toHaveBeenCalledWith('maria@empresa.com.br');
      expect(vi.mocked(prisma.contact.create).mock.calls[0][0]).toMatchObject({
        data: expect.objectContaining({ emailStatus: 'verified' }),
      });
    });
  });

  describe('provider com erro real — não pode virar "sucesso"/"confirmado" silencioso (achado corrigido)', () => {
    it('quando Apollo, Hunter e Google Places falham de verdade (não apenas "não encontrado"), marca status "failed", dataOrigin null e enrichmentStatus "Falhou"', async () => {
      vi.mocked(prisma.company.findFirst).mockResolvedValue({
        ...baseCompany,
        website: 'https://empresa.com.br',
      } as never);
      vi.mocked(enrichOrganizationByDomain).mockResolvedValue({
        organization: null,
        error: 'Apollo Organization Enrich respondeu 500: upstream indisponível',
      } as never);
      vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({
        contacts: [],
        error: 'Apollo People API respondeu 401: chave inválida',
      } as never);
      vi.mocked(findPeopleViaDomainSearch).mockResolvedValue({
        contacts: [],
        error: 'Hunter Domain Search respondeu 500: instável',
      } as never);
      vi.mocked(searchGooglePlaceDetailed).mockResolvedValue({
        place: null,
        error: 'Google Places respondeu 403: chave revogada',
      } as never);

      const result = await runEnrichmentCascade('org-1', 'comp-1');

      expect(result.status).toBe('failed');
      expect(result.apolloEnriched).toBe(false);
      expect(result.hunterEnriched).toBe(false);
      expect(result.googlePlacesEnriched).toBe(false);
      expect(result.errors.apollo).toContain('500');
      expect(result.errors.googlePlaces).toContain('403');

      const logCall = vi.mocked(prisma.enrichmentLog.create).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(logCall.data).toMatchObject({ status: 'failed', dataOrigin: null });
      const rawData = logCall.data.rawData as { errors: Record<string, string> };
      expect(rawData.errors.apollo).toBeDefined();
      expect(rawData.errors.googlePlaces).toBeDefined();

      const companyUpdateCalls = vi.mocked(prisma.company.update).mock.calls;
      const finalUpdate = companyUpdateCalls[companyUpdateCalls.length - 1][0] as {
        data: Record<string, unknown>;
      };
      expect(finalUpdate.data).toMatchObject({ enrichmentStatus: 'Falhou' });
    });

    it('quando todos os providers respondem normalmente mas não há nada novo, marca "no_new_data" (sem erro) e enrichmentStatus permanece "Enriquecido"', async () => {
      vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);
      vi.mocked(enrichOrganizationByDomain).mockResolvedValue({ organization: null } as never);
      vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({ contacts: [] } as never);
      vi.mocked(findPeopleViaDomainSearch).mockResolvedValue({ contacts: [] } as never);
      vi.mocked(searchGooglePlaceDetailed).mockResolvedValue({ place: null } as never);

      const result = await runEnrichmentCascade('org-1', 'comp-1');

      expect(result.status).toBe('no_new_data');
      expect(result.errors).toEqual({});

      const logCall = vi.mocked(prisma.enrichmentLog.create).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(logCall.data).toMatchObject({ status: 'not_found', dataOrigin: null });

      const companyUpdateCalls = vi.mocked(prisma.company.update).mock.calls;
      const finalUpdate = companyUpdateCalls[companyUpdateCalls.length - 1][0] as {
        data: Record<string, unknown>;
      };
      expect(finalUpdate.data).toMatchObject({ enrichmentStatus: 'Enriquecido' });
    });

    it('propaga o erro real do Hunter (findEmailViaHunter) em vez de tratá-lo como "sem e-mail" silencioso', async () => {
      vi.mocked(prisma.company.findFirst).mockResolvedValue({ ...baseCompany } as never);
      vi.mocked(enrichOrganizationByDomain).mockResolvedValue({ organization: null } as never);
      vi.mocked(enrichOrganizationWithContacts).mockResolvedValue({
        contacts: [
          { name: 'João Silva', title: 'Diretor', email: null, phone: null, linkedin_url: null },
        ],
      } as never);
      vi.mocked(findEmailViaHunter).mockResolvedValue({
        email: null,
        error: 'Hunter Email Finder respondeu 401: chave inválida',
      } as never);
      vi.mocked(findPeopleViaDomainSearch).mockResolvedValue({ contacts: [] } as never);
      vi.mocked(searchGooglePlaceDetailed).mockResolvedValue({ place: null } as never);

      const result = await runEnrichmentCascade('org-1', 'comp-1');

      expect(result.errors.hunter).toContain('401');
    });
  });
});
