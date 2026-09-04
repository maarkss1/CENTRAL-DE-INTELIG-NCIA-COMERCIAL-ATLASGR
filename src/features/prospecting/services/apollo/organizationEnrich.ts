import { getPaidProspectingKey } from '../../../../config/prospecting-integrations.js';
import { fetchWithProviderRetry } from '../../../../lib/enrichment/providerFetch.js';
import { APOLLO_ORG_ENRICH_URL } from './client.js';
import type { ApolloOrganization } from './types.js';
import { checkProviderRateLimit } from '../providerRateLimit.js';
import { recordProviderCallCost } from '../providerCostMetrics.js';
import { assertProspectingBudgetNotExceeded } from '../providerBudget.js';

/**
 * Enriquecimento firmográfico completo de UMA empresa via domínio (Apollo Organization Enrich).
 * Diferente do Organization Search (que retorna um resumo por resultado de lista), este endpoint
 * devolve o perfil completo: keywords, tecnologias detectadas, redes sociais, capital de mercado
 * (se aberta em bolsa), ranking Alexa, descrição curta etc. Disponível mesmo em planos básicos.
 */
export async function enrichOrganizationByDomain(
  domain: string,
): Promise<{ organization: ApolloOrganization | null; error?: string }> {
  const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
  if (!apiKey || !domain) return { organization: null };

  const rateLimit = checkProviderRateLimit('apollo');
  if (!rateLimit.allowed) return { organization: null, error: rateLimit.message };

  // DEC-09: bloqueio real de orçamento por organização — lança de propósito (ver
  // src/features/prospecting/services/providerBudget.ts).
  await assertProspectingBudgetNotExceeded('apollo');

  try {
    const url = `${APOLLO_ORG_ENRICH_URL}?domain=${encodeURIComponent(domain)}`;
    const res = await fetchWithProviderRetry(
      url,
      {
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      },
      {
        timeoutMs: 15_000,
        providerName: 'Apollo-OrganizationEnrich',
        billable: true,
        allowedHosts: ['api.apollo.io'],
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        organization: null,
        error: `Apollo Organization Enrich respondeu ${res.status}: ${text.slice(0, 150)}`,
      };
    }

    recordProviderCallCost('apollo');
    const data = (await res.json()) as { organization?: ApolloOrganization };
    return { organization: data.organization || null };
  } catch (error) {
    return {
      organization: null,
      error: error instanceof Error ? error.message : 'Falha ao enriquecer organização via Apollo',
    };
  }
}
