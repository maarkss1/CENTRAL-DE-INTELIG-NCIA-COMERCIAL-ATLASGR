// ARCH-009 (auditoria de dívida técnica): 623 linhas / complexidade proxy 195 — segunda maior do
// repo. Diferente de studio.service.ts (boilerplate legítimo), aqui a complexidade era real:
// busca de organizações (com todo o mapeamento de ICP/região/keyword), enriquecimento de
// organização por domínio e três variações de busca de pessoas/decisores estavam todas no mesmo
// arquivo, cada uma com sua própria lógica de filtro e fallback pra Hunter.io. Decomposto por
// responsabilidade (não por "kind" simples como no studio):
// - apollo/types.ts: interfaces compartilhadas (ApolloOrganization, ApolloContact, etc.)
// - apollo/client.ts: URLs, constantes, checkApolloConnection, parsePlanRestriction
// - apollo/organizationSearch.ts: fetchApolloCandidates + mapeamento de ICP/região/keyword
// - apollo/organizationEnrich.ts: enrichOrganizationByDomain
// - apollo/people.ts: busca/enriquecimento de decisores (Apollo People Search/Match + fallback Hunter.io)
// Este arquivo agora só reexporta a API pública, preservando os imports existentes em
// enrichment.service.ts, prospecting.service.ts, prospecting.routes.ts, DecisionMakerSearch.tsx
// e ApolloAdapter.ts sem exigir nenhuma mudança neles.

export type {
    DecisionMakerCriteria,
    ApolloOrganization,
    ApolloSearchResponse,
    ApolloContact,
    ApolloPersonRaw,
} from './apollo/types.js';

export type { ApolloConnectionStatus } from './apollo/client.js';
export { checkApolloConnection } from './apollo/client.js';

export { fetchApolloCandidates } from './apollo/organizationSearch.js';
export { enrichOrganizationByDomain } from './apollo/organizationEnrich.js';
export {
    enrichPersonByName,
    enrichCandidatesWithDecisionMakers,
    enrichOrganizationWithContacts,
    searchDecisionMakersAdvanced,
} from './apollo/people.js';
