import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ACH-05-04 (auditoria 2026-09-11, agente 05): `enrichOrganizationWithContacts` e
// `searchDecisionMakersAdvanced` (Apollo People Search) e `enrichCandidatesWithDecisionMakers`
// nunca tiveram teste dedicado — só `enrichPersonByName` (People Match) tinha cobertura, no arquivo
// `tests/unit/features/prospecting/services/apollo/people.test.ts` (ACH-05-03). Mesmo padrão de
// `organizationEnrich.test.ts`/`organizationSearch.test.ts`: mocka `fetchWithProviderRetry`
// diretamente (o retry/backoff em si já é testado em `lib/enrichment/providerFetch.ts`) e cobre
// como cada função reage à RESPOSTA FINAL — sucesso, 429/5xx/4xx definitivos, e o fallback real
// para Hunter.io quando a Apollo devolve o erro de plano/escopo insuficiente (403
// API_INACCESSIBLE).

const getPaidProspectingKeyMock = vi.fn();
vi.mock('@/config/prospecting-integrations.js', () => ({
  getPaidProspectingKey: (...args: unknown[]) => getPaidProspectingKeyMock(...args),
}));

const fetchWithProviderRetryMock = vi.fn();
vi.mock('@/lib/enrichment/providerFetch.js', () => ({
  fetchWithProviderRetry: (...args: unknown[]) => fetchWithProviderRetryMock(...args),
}));

const findEmailViaHunterMock = vi.fn();
const findPeopleViaDomainSearchMock = vi.fn();
vi.mock('@/features/prospecting/services/hunter.service', () => ({
  findEmailViaHunter: (...args: unknown[]) => findEmailViaHunterMock(...args),
  findPeopleViaDomainSearch: (...args: unknown[]) => findPeopleViaDomainSearchMock(...args),
}));

import {
  enrichOrganizationWithContacts,
  searchDecisionMakersAdvanced,
  enrichCandidatesWithDecisionMakers,
} from '@/features/prospecting/services/apollo/people';
import { resetProviderRateLimitersForTests } from '@/features/prospecting/services/providerRateLimit';
import { resetProviderCacheForTests } from '@/features/prospecting/services/providerCache';
import type { ApolloOrganization } from '@/features/prospecting/services/apollo/types';
import type { ProspectCandidate } from '@/features/prospecting/domain/prospectTypes';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function apiInaccessibleResponse(): Response {
  return jsonResponse(403, { error_code: 'API_INACCESSIBLE' });
}

beforeEach(async () => {
  getPaidProspectingKeyMock.mockReset().mockReturnValue('fake-apollo-key');
  fetchWithProviderRetryMock.mockReset();
  findEmailViaHunterMock.mockReset().mockResolvedValue({ email: null });
  findPeopleViaDomainSearchMock.mockReset().mockResolvedValue({ contacts: [] });
  resetProviderRateLimitersForTests();
  await resetProviderCacheForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('enrichOrganizationWithContacts (Apollo People Search)', () => {
  it('sem API key configurada, não chama a rede e devolve lista vazia', async () => {
    getPaidProspectingKeyMock.mockReturnValue(undefined);

    const result = await enrichOrganizationWithContacts('empresa.com.br');

    expect(result).toEqual({ contacts: [] });
    expect(fetchWithProviderRetryMock).not.toHaveBeenCalled();
  });

  it('sucesso (200): mapeia pessoas reais para ApolloContact', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(
      jsonResponse(200, {
        people: [
          {
            first_name: 'Ana',
            last_name: 'Souza',
            title: 'CFO',
            email: 'ana@empresa.com.br',
            linkedin_url: 'https://linkedin.com/in/ana',
          },
        ],
      }),
    );

    const result = await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(result.error).toBeUndefined();
    expect(result.source).toBe('apollo');
    expect(result.contacts).toEqual([
      {
        name: 'Ana Souza',
        title: 'CFO',
        email: 'ana@empresa.com.br',
        phone: null,
        linkedin_url: 'https://linkedin.com/in/ana',
      },
    ]);
  });

  it('403 API_INACCESSIBLE (plano sem People Search) cai para o Hunter.io Domain Search', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(apiInaccessibleResponse());
    findPeopleViaDomainSearchMock.mockResolvedValue({
      contacts: [
        {
          name: 'Bruno Lima',
          title: 'Diretor',
          email: 'bruno@empresa.com.br',
          phone: null,
          linkedin_url: null,
        },
      ],
    });

    const result = await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(result.source).toBe('hunter');
    expect(result.error).toBeUndefined();
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].name).toBe('Bruno Lima');
    expect(findPeopleViaDomainSearchMock).toHaveBeenCalledWith('empresa.com.br', 3);
  });

  it('403 API_INACCESSIBLE e Hunter também não encontra ninguém devolve erro descritivo, não exceção', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(apiInaccessibleResponse());
    findPeopleViaDomainSearchMock.mockResolvedValue({ contacts: [] });

    const result = await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(result.source).toBe('hunter');
    expect(result.contacts).toEqual([]);
    expect(result.error).toContain('Hunter.io não encontrou');
  });

  it('403 sem o código de plano restrito não cai para o Hunter — é um erro definitivo normal', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(jsonResponse(403, { error: 'forbidden' }));

    const result = await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(result.contacts).toEqual([]);
    expect(result.error).toContain('403');
    expect(findPeopleViaDomainSearchMock).not.toHaveBeenCalled();
  });

  it('429 final (depois do retry interno esgotar) vira erro descritivo, contacts vazio', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(jsonResponse(429, 'Too Many Requests'));

    const result = await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(result.contacts).toEqual([]);
    expect(result.error).toContain('429');
  });

  it('5xx (upstream indisponível) vira erro descritivo, contacts vazio', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(jsonResponse(500, 'Internal Server Error'));

    const result = await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(result.contacts).toEqual([]);
    expect(result.error).toContain('500');
  });

  it('4xx definitivo (ex: 400 domínio inválido) vira erro descritivo, contacts vazio', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(jsonResponse(400, 'Bad Request'));

    const result = await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(result.contacts).toEqual([]);
    expect(result.error).toContain('400');
  });

  it('erro de rede/timeout é capturado e vira erro, nunca propaga', async () => {
    fetchWithProviderRetryMock.mockRejectedValue(new Error('Timeout de rede'));

    const result = await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(result.contacts).toEqual([]);
    expect(result.error).toBe('Timeout de rede');
  });

  it('mesma busca (domínio + limite) repetida usa o cache — não bate o provider de novo', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(
      jsonResponse(200, { people: [{ first_name: 'Ana', last_name: 'Souza' }] }),
    );

    await enrichOrganizationWithContacts('empresa.com.br', 3);
    await enrichOrganizationWithContacts('empresa.com.br', 3);

    expect(fetchWithProviderRetryMock).toHaveBeenCalledTimes(1);
  });
});

describe('searchDecisionMakersAdvanced (Apollo People Search avançado)', () => {
  it('sem API key configurada, não chama a rede e devolve lista vazia', async () => {
    getPaidProspectingKeyMock.mockReturnValue(undefined);

    const result = await searchDecisionMakersAdvanced('empresa.com.br', {});

    expect(result).toEqual({ contacts: [] });
    expect(fetchWithProviderRetryMock).not.toHaveBeenCalled();
  });

  it('sucesso (200): mapeia pessoas para DecisionMaker, buscando e-mail no Hunter quando a Apollo não traz', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(
      jsonResponse(200, {
        people: [{ first_name: 'Carla', last_name: 'Dias', title: 'Diretora Comercial' }],
      }),
    );
    findEmailViaHunterMock.mockResolvedValue({ email: 'carla@empresa.com.br' });

    const result = await searchDecisionMakersAdvanced('empresa.com.br', { cargos: 'Diretor' }, 5);

    expect(result.source).toBe('apollo');
    expect(result.contacts).toEqual([
      {
        name: 'Carla Dias',
        title: 'Diretora Comercial',
        email: 'carla@empresa.com.br',
        emailSource: 'hunter',
        phone: null,
        linkedinUrl: null,
      },
    ]);
  });

  it('403 API_INACCESSIBLE cai para o Hunter.io e filtra por e-mail verificado quando pedido', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(apiInaccessibleResponse());
    findPeopleViaDomainSearchMock.mockResolvedValue({
      contacts: [
        {
          name: 'Com E-mail',
          title: 'CEO',
          email: 'ceo@empresa.com.br',
          phone: null,
          linkedin_url: null,
        },
        { name: 'Sem E-mail', title: 'CTO', email: null, phone: null, linkedin_url: null },
      ],
    });

    const result = await searchDecisionMakersAdvanced(
      'empresa.com.br',
      { apenasEmailVerificado: true },
      10,
    );

    expect(result.source).toBe('hunter');
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].name).toBe('Com E-mail');
  });

  it('429 final vira erro descritivo, contacts vazio', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(jsonResponse(429, 'Too Many Requests'));

    const result = await searchDecisionMakersAdvanced('empresa.com.br', {}, 10);

    expect(result.contacts).toEqual([]);
    expect(result.error).toContain('429');
  });

  it('5xx vira erro descritivo, contacts vazio', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(jsonResponse(500, 'Internal Server Error'));

    const result = await searchDecisionMakersAdvanced('empresa.com.br', {}, 10);

    expect(result.contacts).toEqual([]);
    expect(result.error).toContain('500');
  });

  it('4xx definitivo vira erro descritivo, contacts vazio', async () => {
    fetchWithProviderRetryMock.mockResolvedValue(jsonResponse(422, 'Unprocessable Entity'));

    const result = await searchDecisionMakersAdvanced('empresa.com.br', {}, 10);

    expect(result.contacts).toEqual([]);
    expect(result.error).toContain('422');
  });

  it('erro de rede/timeout é capturado e vira erro, nunca propaga', async () => {
    fetchWithProviderRetryMock.mockRejectedValue(new Error('Timeout de rede'));

    const result = await searchDecisionMakersAdvanced('empresa.com.br', {}, 10);

    expect(result.contacts).toEqual([]);
    expect(result.error).toBe('Timeout de rede');
  });
});

describe('enrichCandidatesWithDecisionMakers', () => {
  function buildCandidate(): ProspectCandidate {
    return {
      tradeName: 'Empresa Exemplo',
      legalNameGuess: null,
      cnpjGuess: null,
      segment: 'Transportadora',
      source: 'apollo',
      segmentObserved: false,
      size: 'Não informado',
      location: '',
      fitScoreEstimate: 70,
      suggestedContact: null,
      rationale: '',
      linkedinUrl: null,
      phone: null,
      foundedYear: null,
      annualRevenue: null,
      website: null,
    } as ProspectCandidate;
  }

  it('preenche decisionMakers para candidatos com domínio conhecido, usando Hunter quando a Apollo não traz e-mail', async () => {
    const candidates = [buildCandidate()];
    const organizations: ApolloOrganization[] = [{ primary_domain: 'empresa.com.br' }];

    fetchWithProviderRetryMock.mockResolvedValue(
      jsonResponse(200, {
        people: [{ first_name: 'Davi', last_name: 'Nunes', title: 'Gerente' }],
      }),
    );
    findEmailViaHunterMock.mockResolvedValue({ email: 'davi@empresa.com.br' });

    await enrichCandidatesWithDecisionMakers(candidates, organizations);

    expect(candidates[0].decisionMakers).toHaveLength(1);
    expect(candidates[0].decisionMakers?.[0]).toMatchObject({
      name: 'Davi Nunes',
      email: 'davi@empresa.com.br',
      emailSource: 'hunter',
    });
  });

  it('candidato sem domínio conhecido não recebe decisionMakers (nunca undefined vira array vazio à toa)', async () => {
    const candidates = [buildCandidate()];
    const organizations: ApolloOrganization[] = [{}]; // sem primary_domain

    await enrichCandidatesWithDecisionMakers(candidates, organizations);

    expect(candidates[0].decisionMakers).toBeUndefined();
    expect(fetchWithProviderRetryMock).not.toHaveBeenCalled();
  });

  it('quando nenhum contato é encontrado, marca decisionMakers como array vazio (buscou e não achou, != nunca buscou)', async () => {
    const candidates = [buildCandidate()];
    const organizations: ApolloOrganization[] = [{ primary_domain: 'empresa.com.br' }];

    fetchWithProviderRetryMock.mockResolvedValue(jsonResponse(200, { people: [] }));

    await enrichCandidatesWithDecisionMakers(candidates, organizations);

    expect(candidates[0].decisionMakers).toEqual([]);
  });
});
