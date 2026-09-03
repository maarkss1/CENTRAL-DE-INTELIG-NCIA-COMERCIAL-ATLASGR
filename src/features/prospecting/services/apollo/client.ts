import { getPaidProspectingKey } from '../../../../config/prospecting-integrations.js';
import { fetchWithTimeout } from '../../../../lib/http.js';

export const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/organizations/search';
export const APOLLO_ORG_ENRICH_URL = 'https://api.apollo.io/api/v1/organizations/enrich';
export const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search';
export const APOLLO_PEOPLE_MATCH_URL = 'https://api.apollo.io/api/v1/people/match';
// Endpoint oficial de health-check da Apollo: valida a API key sem consumir créditos do plano.
export const APOLLO_AUTH_HEALTH_URL = 'https://api.apollo.io/v1/auth/health';

// Teto de segurança para a busca automática de decisores por descoberta — sem isso, uma
// `quantidade` grande (até 100) dispararia até 100 lookups concorrentes de Apollo People
// Search/Hunter, estourando cota e latência. Até este teto, TODOS os candidatos com domínio
// conhecido recebem decisor pré-buscado (nome, cargo, e-mail, telefone, LinkedIn) — antes disso o
// limite fixo em 3 deixava a maioria dos candidatos de qualquer busca sem esses dados por padrão.
export const MAX_DECISION_MAKER_LOOKUPS = 20;

// O frontend aborta a chamada de /discover em VITE_API_TIMEOUT_MS (padrão 15s — ver src/lib/api.ts).
// A busca automática de decisores roda em paralelo com esse orçamento: se não terminar a tempo,
// devolvemos os candidatos sem decisores (que continuam disponíveis via "Buscar Decisores") em vez
// de travar a resposta inteira até o timeout de 15s da própria Apollo/Hunter por domínio. Os
// lookups rodam em paralelo (Promise.all), então o tempo total é dominado pelo mais lento entre
// eles, não pela soma — por isso o teto acima em vez do orçamento de tempo é o que limita o custo.
export const DECISION_MAKER_PREFETCH_BUDGET_MS = 10_000;

/**
 * Chaves de plano que a Apollo devolve quando a API key não tem escopo para um endpoint
 * (ex: People Search costuma exigir um plano pago, diferente de Organization Search/Enrich
 * e People Match que funcionam em planos mais básicos). Detectar isso explicitamente permite
 * cair para o Hunter.io Domain Search em vez de simplesmente mostrar "nenhum resultado".
 */
export const APOLLO_PLAN_RESTRICTED_CODE = 'API_INACCESSIBLE';

/** Detecta o erro específico de plano/escopo insuficiente que a Apollo devolve para People Search. */
export function parsePlanRestriction(status: number, rawBody: string): boolean {
  if (status !== 403) return false;
  try {
    const parsed = JSON.parse(rawBody);
    return parsed?.error_code === APOLLO_PLAN_RESTRICTED_CODE;
  } catch {
    return rawBody.includes(APOLLO_PLAN_RESTRICTED_CODE);
  }
}

export interface ApolloConnectionStatus {
  connected: boolean;
  configured: boolean;
  providerMode: 'apollo' | 'hunter' | 'none';
  message?: string;
}

export async function checkApolloConnection(): Promise<ApolloConnectionStatus> {
  const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
  if (!apiKey) {
    return {
      connected: false,
      configured: false,
      providerMode: 'hunter',
      message:
        'APOLLO_API_KEY não configurada ou PROSPECTING_PROVIDER_MODE != hybrid — usando Hunter.io como fallback.',
    };
  }

  try {
    const res = await fetchWithTimeout(
      APOLLO_AUTH_HEALTH_URL,
      {
        headers: { 'X-Api-Key': apiKey },
      },
      8_000,
      ['api.apollo.io'],
    );

    if (res.ok) {
      return { connected: true, configured: true, providerMode: 'apollo' };
    }

    const text = await res.text().catch(() => '');
    return {
      connected: false,
      configured: true,
      providerMode: 'hunter',
      message: `Apollo respondeu ${res.status} ao validar a API key: ${text.slice(0, 150)}`,
    };
  } catch (error) {
    return {
      connected: false,
      configured: true,
      providerMode: 'hunter',
      message: error instanceof Error ? error.message : 'Falha desconhecida ao contatar a Apollo.',
    };
  }
}
