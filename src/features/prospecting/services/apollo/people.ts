// Ver domain/prospectTypes.ts para o porquê deste import vir de domain/, não de
// ../prospecting.service (quebra um ciclo real com services/apollo/*, ARCH-009 2026-08-28).
import type { ProspectCandidate, DecisionMaker } from '../../domain/prospectTypes.js';
import { findEmailViaHunter, findPeopleViaDomainSearch } from '../hunter.service';
import { getPaidProspectingKey } from '../../../../config/prospecting-integrations.js';
import { fetchWithProviderRetry } from '../../../../lib/enrichment/providerFetch.js';
import {
  APOLLO_PEOPLE_SEARCH_URL,
  APOLLO_PEOPLE_MATCH_URL,
  MAX_DECISION_MAKER_LOOKUPS,
  parsePlanRestriction,
} from './client.js';
import type {
  ApolloOrganization,
  ApolloContact,
  ApolloPersonRaw,
  DecisionMakerCriteria,
} from './types.js';
import { checkProviderRateLimit } from '../providerRateLimit.js';
import { withProviderCache, buildProviderCacheKey } from '../providerCache.js';
import { recordProviderCallCost } from '../providerCostMetrics.js';
import { assertProspectingBudgetNotExceeded } from '../providerBudget.js';

/**
 * Enriquecimento de UMA pessoa específica já identificada (nome + empresa/domínio) via
 * Apollo People Match. Diferente do People Search (que "descobre" pessoas por cargo/senioridade
 * e costuma exigir plano pago), o Match é um lookup direto — funciona em planos mais básicos —
 * e é a via preferida quando já sabemos o nome de um decisor (ex: sócio vindo da Receita Federal).
 */
export async function enrichPersonByName(
  fullName: string,
  domain?: string | null,
  organizationName?: string | null,
): Promise<{ contact: ApolloContact | null; error?: string }> {
  const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
  if (!apiKey || !fullName.trim()) return { contact: null };

  // Cache por (nome, domínio, empresa) — checado ANTES do rate limit: um acerto de cache não
  // deve consumir a vaga do token bucket, só uma chamada de rede real deve.
  const cacheKey = buildProviderCacheKey('apollo', 'people-match', {
    fullName,
    domain: domain || null,
    organizationName: organizationName || null,
  });
  return withProviderCache(
    cacheKey,
    () => enrichPersonByNameUncached(fullName, domain, organizationName, apiKey),
    { shouldCache: (result) => !result.error },
  );
}

async function enrichPersonByNameUncached(
  fullName: string,
  domain: string | null | undefined,
  organizationName: string | null | undefined,
  apiKey: string,
): Promise<{ contact: ApolloContact | null; error?: string }> {
  const rateLimit = checkProviderRateLimit('apollo');
  if (!rateLimit.allowed) return { contact: null, error: rateLimit.message };

  // DEC-09: bloqueio real de orçamento por organização — lança de propósito (ver
  // src/features/prospecting/services/providerBudget.ts).
  await assertProspectingBudgetNotExceeded('apollo');

  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(' ');

  try {
    const res = await fetchWithProviderRetry(
      APOLLO_PEOPLE_MATCH_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName || undefined,
          domain: domain || undefined,
          organization_name: organizationName || undefined,
          reveal_personal_emails: true,
        }),
      },
      {
        timeoutMs: 15_000,
        providerName: 'Apollo-PeopleMatch',
        billable: true,
        allowedHosts: ['api.apollo.io'],
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        contact: null,
        error: `Apollo People Match respondeu ${res.status}: ${text.slice(0, 150)}`,
      };
    }

    recordProviderCallCost('apollo');
    const data = await res.json();
    const p = data?.person;
    if (!p) return { contact: null };

    return {
      contact: {
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || fullName,
        title: p.title || null,
        email: p.email || null,
        phone: p.phone_numbers?.[0]?.raw_number || p.sanitized_phone || null,
        linkedin_url: p.linkedin_url || null,
      },
    };
  } catch (error) {
    return {
      contact: null,
      error: error instanceof Error ? error.message : 'Falha ao consultar Apollo People Match',
    };
  }
}

/** Preenche candidate.decisionMakers para os primeiros MAX_DECISION_MAKER_LOOKUPS candidatos com domínio conhecido. */
export async function enrichCandidatesWithDecisionMakers(
  candidates: ProspectCandidate[],
  organizations: ApolloOrganization[],
) {
  const withDomain = organizations
    .map((org, idx) => ({ org, idx }))
    .filter(({ org }) => !!org.primary_domain)
    .slice(0, MAX_DECISION_MAKER_LOOKUPS);

  await Promise.all(
    withDomain.map(async ({ org, idx }) => {
      const domain = org.primary_domain!;
      const { contacts } = await enrichOrganizationWithContacts(domain, 3);
      if (contacts.length === 0) {
        // Array vazio (em vez de undefined) sinaliza pro frontend "buscamos e não achamos
        // ninguém" — diferente de "nunca tentamos" (candidato sem domínio conhecido).
        candidates[idx].decisionMakers = [];
        return;
      }

      const decisionMakers: DecisionMaker[] = await Promise.all(
        contacts.map(async (c): Promise<DecisionMaker> => {
          let email = c.email;
          let emailSource: DecisionMaker['emailSource'] = email ? 'apollo' : undefined;
          if (!email) {
            const hunterResult = await findEmailViaHunter(domain, c.name);
            if (hunterResult.email) {
              email = hunterResult.email;
              emailSource = 'hunter';
            }
          }
          return {
            name: c.name,
            title: c.title,
            email,
            emailSource,
            phone: c.phone || null,
            linkedinUrl: c.linkedin_url,
          };
        }),
      );

      candidates[idx].decisionMakers = decisionMakers;
    }),
  );
}

/**
 * Busca executivos/decisores reais para um dado domínio de empresa via Apollo People Search.
 * Muitas chaves Apollo (planos gratuitos/básicos) não têm escopo para este endpoint — quando
 * isso acontece (403 API_INACCESSIBLE), caímos automaticamente para o Hunter.io Domain Search,
 * que descobre pessoas reais a partir de e-mails encontrados publicamente na web.
 */
export async function enrichOrganizationWithContacts(
  domain: string,
  limit: number = 3,
): Promise<{ contacts: ApolloContact[]; error?: string; source?: 'apollo' | 'hunter' }> {
  const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
  if (!apiKey || !domain) return { contacts: [] };

  // Mesmo domínio+limite buscado duas vezes no mesmo TTL (ex: vendedor reabre a tela de
  // decisores, ou a Descoberta pré-busca o mesmo domínio que a promoção do lead busca de novo)
  // não deve bater a Apollo/Hunter de novo — ver providerCache.ts.
  const cacheKey = buildProviderCacheKey('apollo', 'people-search-by-domain', { domain, limit });
  return withProviderCache(
    cacheKey,
    () => enrichOrganizationWithContactsUncached(domain, limit, apiKey),
    { shouldCache: (result) => !result.error },
  );
}

async function enrichOrganizationWithContactsUncached(
  domain: string,
  limit: number,
  apiKey: string,
): Promise<{ contacts: ApolloContact[]; error?: string; source?: 'apollo' | 'hunter' }> {
  const rateLimit = checkProviderRateLimit('apollo');
  if (!rateLimit.allowed) return { contacts: [], error: rateLimit.message };

  // DEC-09: bloqueio real de orçamento por organização — lança de propósito (ver
  // src/features/prospecting/services/providerBudget.ts).
  await assertProspectingBudgetNotExceeded('apollo');

  try {
    const res = await fetchWithProviderRetry(
      APOLLO_PEOPLE_SEARCH_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({
          q_organization_domains: domain,
          // Buscaremos executivos-chave (Decisores/Gestores) sem restringir a área
          person_seniorities: ['c_suite', 'vp', 'director', 'manager'],
          per_page: limit,
          page: 1,
        }),
      },
      {
        timeoutMs: 15_000,
        providerName: 'Apollo-PeopleSearch',
        billable: true,
        allowedHosts: ['api.apollo.io'],
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (parsePlanRestriction(res.status, text)) {
        const hunterPeople = await findPeopleViaDomainSearch(domain, limit);
        return {
          contacts: hunterPeople.contacts,
          source: 'hunter',
          error:
            hunterPeople.contacts.length === 0
              ? 'Seu plano Apollo não inclui People Search e o Hunter.io não encontrou pessoas neste domínio.'
              : undefined,
        };
      }
      return {
        contacts: [],
        error: `Apollo People API respondeu ${res.status}: ${text.slice(0, 100)}`,
      };
    }

    recordProviderCallCost('apollo');
    const data = await res.json();
    const people: ApolloPersonRaw[] = data.people || data.contacts || [];

    const contacts: ApolloContact[] = people.map((p) => ({
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sem Nome',
      title: p.title || null,
      email: p.email || p.email_url || null,
      phone: p.phone_numbers?.[0]?.raw_number || p.sanitized_phone || null,
      linkedin_url: p.linkedin_url || null,
    }));

    return { contacts, source: 'apollo' };
  } catch (error) {
    return {
      contacts: [],
      error: error instanceof Error ? error.message : 'Falha ao consultar Apollo People API',
    };
  }
}

/**
 * Busca avançada de executivos/decisores para um dado domínio de empresa via Apollo People Search.
 * Também cai para o Hunter.io Domain Search quando a chave Apollo não tem escopo de People Search
 * (403 API_INACCESSIBLE) — ver enrichOrganizationWithContacts para o mesmo padrão.
 */
export async function searchDecisionMakersAdvanced(
  domain: string,
  criteria: DecisionMakerCriteria,
  limit: number = 10,
): Promise<{ contacts: DecisionMaker[]; error?: string; source?: 'apollo' | 'hunter' }> {
  const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
  if (!apiKey || !domain) return { contacts: [] };

  // Mesmo domínio+critérios buscado de novo no mesmo TTL (o operador clicou "Buscar Decisores"
  // outra vez para o mesmo domínio, sem mudar os filtros) não deve bater o provider de novo.
  const cacheKey = buildProviderCacheKey('apollo', 'people-search-advanced', {
    domain,
    limit,
    criteria: criteria as unknown as Record<string, unknown>,
  });
  return withProviderCache(
    cacheKey,
    () => searchDecisionMakersAdvancedUncached(domain, criteria, limit, apiKey),
    { shouldCache: (result) => !result.error },
  );
}

async function searchDecisionMakersAdvancedUncached(
  domain: string,
  criteria: DecisionMakerCriteria,
  limit: number,
  apiKey: string,
): Promise<{ contacts: DecisionMaker[]; error?: string; source?: 'apollo' | 'hunter' }> {
  const rateLimit = checkProviderRateLimit('apollo');
  if (!rateLimit.allowed) return { contacts: [], error: rateLimit.message };

  // DEC-09: bloqueio real de orçamento por organização — lança de propósito (ver
  // src/features/prospecting/services/providerBudget.ts).
  await assertProspectingBudgetNotExceeded('apollo');

  try {
    const body: Record<string, unknown> = {
      q_organization_domains: domain,
      per_page: limit,
      page: 1,
    };

    if (criteria.cargos) {
      body.person_titles = criteria.cargos
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    }
    if (criteria.senioridades && criteria.senioridades.length > 0) {
      body.person_seniorities = criteria.senioridades;
    }
    if (criteria.departamentos && criteria.departamentos.length > 0) {
      body.person_departments = criteria.departamentos;
    }
    if (criteria.cidade || criteria.estado) {
      body.person_locations = [[criteria.cidade, criteria.estado].filter(Boolean).join(', ')];
    }
    if (criteria.palavrasChavePerfil) {
      body.q_keywords = criteria.palavrasChavePerfil;
    }
    if (criteria.apenasEmailVerificado) {
      body.contact_email_status = ['verified'];
    }

    const res = await fetchWithProviderRetry(
      APOLLO_PEOPLE_SEARCH_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: 15_000,
        providerName: 'Apollo-PeopleSearchAdvanced',
        billable: true,
        allowedHosts: ['api.apollo.io'],
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (parsePlanRestriction(res.status, text)) {
        const hunterPeople = await findPeopleViaDomainSearch(domain, limit);
        let contacts = hunterPeople.contacts.map(
          (c): DecisionMaker => ({
            name: c.name,
            title: c.title,
            email: c.email,
            emailSource: c.email ? 'hunter' : undefined,
            phone: c.phone,
            linkedinUrl: c.linkedin_url,
          }),
        );
        if (criteria.apenasEmailVerificado) {
          contacts = contacts.filter((c) => !!c.email);
        }
        return {
          contacts,
          source: 'hunter',
          error:
            contacts.length === 0
              ? 'Seu plano Apollo não inclui People Search e o Hunter.io não encontrou pessoas neste domínio.'
              : undefined,
        };
      }
      return {
        contacts: [],
        error: `Apollo People API respondeu ${res.status}: ${text.slice(0, 100)}`,
      };
    }

    recordProviderCallCost('apollo');
    const data = await res.json();
    const people: ApolloPersonRaw[] = data.people || data.contacts || [];

    const contacts: DecisionMaker[] = await Promise.all(
      people.map(async (p): Promise<DecisionMaker> => {
        let email = p.email || p.email_url || null;
        let emailSource: DecisionMaker['emailSource'] = email ? 'apollo' : undefined;

        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sem Nome';

        if (!email) {
          const hunterResult = await findEmailViaHunter(domain, name);
          if (hunterResult.email) {
            email = hunterResult.email;
            emailSource = 'hunter';
          }
        }

        return {
          name,
          title: p.title || null,
          email,
          emailSource,
          phone: p.phone_numbers?.[0]?.raw_number || p.sanitized_phone || null,
          linkedinUrl: p.linkedin_url || null,
        };
      }),
    );

    return { contacts, source: 'apollo' };
  } catch (error) {
    return {
      contacts: [],
      error: error instanceof Error ? error.message : 'Falha ao consultar Apollo People API',
    };
  }
}
