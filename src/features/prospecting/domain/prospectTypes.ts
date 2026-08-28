/**
 * Tipos centrais do domínio de prospecção (`ProspectCriteria`, `ProspectCandidate`,
 * `DecisionMaker`, `DiscoverResult`) e `buildLocationLabel`, movidos para cá na decomposição do
 * antigo `services/prospecting.service.ts` (ARCH-009, correção de 2026-08-28).
 *
 * Vivem em `domain/`, não em `services/prospecting/types.ts`, de propósito: tanto
 * `services/prospecting/*` quanto `services/apollo/*` precisam desses tipos (Apollo é uma fonte de
 * candidatos/decisores, não só um detalhe interno de prospecting), e as duas pastas de serviço já
 * se importam mutuamente (`prospecting/discovery.ts` chama `apollo.service.ts`). Antes desta
 * mudança, `apollo/types.ts`, `apollo/organizationSearch.ts` e `apollo/people.ts` importavam esses
 * tipos de volta de `services/prospecting.service.ts` — um import circular real entre os dois
 * barrels de serviço (confirmado por `npx depcruise`, regra `no-circular`; ver também o comentário
 * em `domain/searchIntent.ts::ProspectCriteriaLike`, que documentava o mesmo ciclo e por isso evita
 * importar `ProspectCriteria` até hoje). Colocar os tipos num módulo de domínio sem dependência de
 * volta para `services/` quebra o ciclo pela raiz, em vez de só reposicioná-lo.
 */

export interface ProspectCriteria {
  /** Detalhes adicionais do ICP além dos campos estruturados abaixo (texto livre, nuance qualitativa). */
  icp?: string;
  /** Cargos-alvo do decisor (ex: "Diretor de Logística", "CEO") — um por linha, adicionados dinamicamente na UI. */
  decisorCargos?: string[];
  segmento: string;
  localizacao: string;
  quantidade: number;
  /** Estado (UF por extenso, ex: "Rio de Janeiro") — refina a busca além da região ampla do playbook. Opcional. */
  estado?: string;
  /** Cidade específica — refina ainda mais dentro do estado. Opcional. */
  cidade?: string;
  /** Faixa de funcionários no formato Apollo "min,max" (ex: "11,50"). Opcional. */
  porte?: string;
  /** Faturamento anual estimado em USD — dado da Apollo é normalizado em USD. Opcional. */
  faturamentoMin?: number;
  faturamentoMax?: number;
  /** Faturamento mensal estimado em USD — convertido para faixa anual (×12) antes de ir pra Apollo, que só reconhece faturamento anual. Opcional. */
  faturamentoMensalMin?: number;
  faturamentoMensalMax?: number;
  /** Volume de operação/carga (texto livre — ex: "50 cargas/mês", "frota de 30+ veículos"). Sem taxonomia fixa na Apollo; entra como palavra-chave adicional na busca. Opcional. */
  volume?: string;
  /** Palavras-chave adicionais (além do segmento), separadas por vírgula. Opcional. */
  palavrasChave?: string;
  /** Nome da empresa/local para Google Maps, Apollo e fallback OpenStreetMap. Opcional. */
  nomeEmpresa?: string;
  /** Ano mínimo de fundação. Opcional. */
  anoFundacaoMin?: number;
  /** Ano máximo de fundação. Opcional. */
  anoFundacaoMax?: number;
  /** Tecnologias utilizadas (UIDs confirmados, separados por vírgula — ver TECNOLOGIA_OPTIONS). Opcional. */
  tecnologias?: string;
  /** Tecnologias a EXCLUIR (mesmo formato de `tecnologias`). Opcional. */
  tecnologiasExcluir?: string;
  /** Cidades/estados a excluir da busca, separados por vírgula (ex: "São Paulo, Minas Gerais"). Opcional. */
  localizacaoExcluir?: string;
  /** Filtra só empresas de capital aberto (B3/bolsa). Opcional. */
  apenasCapitalAberto?: boolean;
  /** Página do ranking da Apollo (1-based, padrão 1). Usada pelo botão "Buscar mais resultados"
   * do frontend para trazer a próxima fatia do mesmo ranking em vez de repetir sempre o topo. */
  pagina?: number;
  /** Nomes a serem excluidos da busca para evitar duplicidade no append. */
  excludeNames?: string[];
}

export interface DecisionMaker {
  name: string;
  title: string | null;
  email: string | null;
  emailSource?: 'apollo' | 'hunter';
  phone: string | null;
  linkedinUrl: string | null;
}

export interface ProspectCandidate {
  tradeName: string;
  legalNameGuess: string | null;
  cnpjGuess: string | null;
  segment: string;
  size: string;
  location: string;
  fitScoreEstimate: number;
  suggestedContact: { name: string; role: string } | null;
  rationale: string;
  // Dados extras retornados pela Apollo — deixam o candidato mais rico em informação antes mesmo de promover.
  linkedinUrl?: string | null;
  phone?: string | null;
  /** Domínio/site real já conhecido (Apollo primary_domain ou Google Places websiteUri) — evita
   * que o enriquecimento precise "adivinhar" um domínio a partir do nome da empresa depois. */
  website?: string | null;
  foundedYear?: number | null;
  annualRevenue?: number | null;
  technologies?: string[];
  emails?: string[];
  apolloContacts?: DecisionMaker[];
  /** Decisores encontrados via Apollo People Search (+ Hunter.io como fallback de e-mail) já na descoberta. */
  decisionMakers?: DecisionMaker[];
  /** Quebra-gelo / fato relevante / notícia recente da empresa obtida via busca na internet para abordagem inicial */
  icebreakerHook?: string | null;
  webInsights?: Array<{ title: string; url: string; domain: string }>;
}

export interface DiscoverResult {
  candidates: ProspectCandidate[];
  sources: Array<{ title: string; uri: string }>;
  apolloError?: string;
  providerMode: 'free' | 'hybrid';
  /** Onda 42 (dossiê CPI, DEC-13, opção A): id único desta EXECUÇÃO de busca (cuid) — amarra
   * critério usado, providers chamados, resultados e custo, persistido em
   * `ProspectingSearchExecution` (ver searchExecution.service.ts) e consultável depois via
   * `GET /api/prospecting/searches/:searchId`. */
  searchId: string;
}

/** Monta a localização mais precisa disponível: cidade + estado > estado > região ampla do playbook. */
export function buildLocationLabel(criteria: ProspectCriteria): string {
  if (criteria.cidade && criteria.estado) return `${criteria.cidade}, ${criteria.estado}`;
  if (criteria.estado) return criteria.estado;
  return criteria.localizacao;
}
