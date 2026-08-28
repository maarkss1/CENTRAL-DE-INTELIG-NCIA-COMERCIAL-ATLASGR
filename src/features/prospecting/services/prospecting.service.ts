// ARCH-009 (auditoria de dívida técnica, correção de 2026-08-28): 729 linhas / maior serviço do
// repositório na correção da "ANALISE-DIVIDA-TECNICA-ROBUSTA.md" original. Mesmo padrão já usado
// para bitrix.service.ts, apollo.service.ts, studio.service.ts e gateway.ts — decomposto por
// responsabilidade em prospecting/:
// - prospecting/types.ts: interfaces compartilhadas (ProspectCriteria, ProspectCandidate,
//   DecisionMaker, DiscoverResult, RejectCandidateInput, PromoteInput).
// - prospecting/discovery.ts: orquestração de descoberta (Apollo/Google Places/Nominatim via
//   QueryPlanner) — discoverCandidates, discoverViaGooglePlaces, fetchKnownExclusions.
// - prospecting/qualityEnrichment.ts: enrichCandidatesWithQualityData (CNPJ + decisores + notícias
//   pós-descoberta).
// - prospecting/decisionMakers.ts: discoverDecisionMakers (busca de decisor por domínio).
// - prospecting/rejection.ts: rejectCandidate ("Não é esse perfil").
// - prospecting/promote.ts: promoteToCrm (Company+Contact+Lead a partir de um candidato).
// Este arquivo agora só reexporta a API pública, preservando os imports existentes em
// prospecting.routes.ts, prospecting-tools.routes.ts, ProspectingHub.tsx e demais componentes de
// prospecting-hub/. `apollo/organizationSearch.ts`, `apollo/people.ts` e `apollo/types.ts`
// importavam ProspectCriteria/ProspectCandidate/DecisionMaker/buildLocationLabel de volta deste
// arquivo antes da decomposição — um ciclo real já catalogado em
// .dependency-cruiser-known-violations.json. Corrigido nesta mesma mudança (não só reposicionado):
// esses tipos e `buildLocationLabel` foram movidos para `domain/prospectTypes.ts`, que não depende
// de volta de `services/` — `apollo/*` importa de lá diretamente agora. Ver o comentário em
// `domain/prospectTypes.ts` para o racional completo.

export type {
  ProspectCriteria,
  DecisionMaker,
  ProspectCandidate,
  DiscoverResult,
  RejectCandidateInput,
  PromoteInput,
  DecisionMakerCriteria,
} from './prospecting/types.js';

export {
  buildLocationLabel,
  discoverViaGooglePlaces,
  fetchKnownExclusions,
  discoverCandidates,
} from './prospecting/discovery.js';

export { enrichCandidatesWithQualityData } from './prospecting/qualityEnrichment.js';
export { discoverDecisionMakers } from './prospecting/decisionMakers.js';
export { rejectCandidate } from './prospecting/rejection.js';
export { promoteToCrm } from './prospecting/promote.js';
