// Barrel da camada de domínio de estratégia de busca (CPI DEC-12, opção A) — SearchIntent →
// QueryPlanner → ProviderCapabilities. Ver o comentário de topo de cada arquivo para o raciocínio
// completo; este arquivo só reexporta a API pública para quem consome de fora de `domain/`.
export type {
    SearchIntent,
    SearchLocationIntent,
    SearchFirmographicIntent,
    ProspectCriteriaLike,
} from './searchIntent.js';
export { buildSearchIntent, MAX_LEADS_PER_SEARCH } from './searchIntent.js';

export type {
    DiscoveryProviderId,
    ProviderId,
    ProviderDataKind,
    ProviderCapabilityProfile,
} from './providerCapabilities.js';
export { PROVIDER_CAPABILITIES, isProviderAvailable } from './providerCapabilities.js';

export type { ProviderPlanStep, QueryPlan } from './queryPlanner.js';
export {
    planCompanyDiscovery,
    planShortfallFallback,
    scoreProvider,
    NOMINATIM_SUPPLEMENT_MIN_QUANTITY,
} from './queryPlanner.js';
