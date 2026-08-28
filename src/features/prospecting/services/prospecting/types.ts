// Ver ARCH-009-like em prospecting.service.ts (barrel) para o racional completo da decomposição.
// Este arquivo concentra os tipos usados por discovery.ts, qualityEnrichment.ts, rejection.ts,
// decisionMakers.ts e promote.ts. `ProspectCriteria`/`DecisionMaker`/`ProspectCandidate`/
// `DiscoverResult` vivem em `domain/prospectTypes.ts` (não aqui) — ver o comentário lá para o
// porquê (quebrar o import circular real com `services/apollo/*`).

import type { DecisionMaker } from '../../domain/prospectTypes.js';

export type {
  ProspectCriteria,
  DecisionMaker,
  ProspectCandidate,
  DiscoverResult,
} from '../../domain/prospectTypes.js';
export { buildLocationLabel } from '../../domain/prospectTypes.js';
export type { DecisionMakerCriteria } from '../apollo.service.js';

export interface RejectCandidateInput {
  tradeName: string;
  website?: string | null;
  reason?: string | null;
  organizationId: string;
}

export interface PromoteInput {
  tradeName: string;
  legalName?: string | null;
  cnpj?: string | null;
  segment?: string | null;
  size?: string | null;
  city?: string | null;
  state?: string | null;
  location?: string | null;
  source: string;
  /** Onda 40 (auditoria CPI — "funil quebra no primeiro elo, busca→lead"): id da SavedSearch cujo
   * candidato está sendo promovido, quando aplicável — nunca inferido, só passado quando o
   * chamador realmente sabe a origem. */
  savedSearchId?: string | null;
  contact?: { name: string; role?: string } | null;
  autoEnrich?: boolean;
  organizationId: string;
  // Dados extras vindos da Apollo (quando o candidato veio da Descoberta) — preenchem a Company já na criação.
  linkedin?: string | null;
  phone?: string | null;
  /** Domínio/site já conhecido (Apollo primary_domain ou Google Places) — evita heurística de adivinhação no enriquecimento. */
  website?: string | null;
  /** Decisores já buscados na tela de descoberta — evita gastar créditos Apollo/Hunter de novo no promote. */
  decisionMakers?: DecisionMaker[];
}
