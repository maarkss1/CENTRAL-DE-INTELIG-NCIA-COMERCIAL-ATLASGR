export const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/organizations/search';
export const APOLLO_ORG_ENRICH_URL = 'https://api.apollo.io/api/v1/organizations/enrich';
export const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search';
export const APOLLO_PEOPLE_MATCH_URL = 'https://api.apollo.io/api/v1/people/match';

// limitamos aos N primeiros candidatos de cada busca para não estourar cota das APIs.
export const MAX_DECISION_MAKER_LOOKUPS = 3;

// O frontend aborta a chamada de /discover em VITE_API_TIMEOUT_MS (padrão 15s — ver src/lib/api.ts).
// A busca automática de decisores roda em paralelo com esse orçamento: se não terminar a tempo,
// devolvemos os candidatos sem decisores (que continuam disponíveis via "Buscar Decisores") em vez
// de travar a resposta inteira até o timeout de 15s da própria Apollo/Hunter por domínio.
export const DECISION_MAKER_PREFETCH_BUDGET_MS = 8_000;

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
    return { connected: true, configured: true, providerMode: 'apollo' };
}
