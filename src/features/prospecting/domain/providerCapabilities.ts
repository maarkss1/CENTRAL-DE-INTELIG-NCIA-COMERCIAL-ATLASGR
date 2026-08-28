import type { ProspectingProviderMode } from '../../../config/prospecting-integrations.js';
import { getRateLimitPerMinute } from '../services/providerRateLimit.js';
import { getCostPerCallUsd } from '../services/providerCostMetrics.js';

/**
 * CPI DEC-12 (opção A) — camada `ProviderCapabilities`.
 *
 * Antes deste módulo, "o que cada provider sabe fazer" estava implícito e espalhado: filtro
 * firmográfico só funcionar na Apollo era um fato que só existia nos comentários de
 * `organizationSearch.ts`; rate limit vivia em `providerRateLimit.ts`; custo por chamada em
 * `providerCostMetrics.ts`; e nada declarava, num único lugar, que Google Places/Nominatim
 * geocodificam de verdade e a Apollo não. Este módulo centraliza essas capacidades — reusando as
 * fontes de verdade já existentes (`providerRateLimit.ts`, `providerCostMetrics.ts`) em vez de
 * duplicar os números — para que o `QueryPlanner` (`queryPlanner.ts`) tome decisões em cima de
 * fatos declarados, não de suposições implícitas no meio do cascade.
 *
 * Os 4 providers deste domínio (Apollo, Google Places, Hunter, Nominatim) estão todos aqui, mesmo
 * que só 3 participem da DESCOBERTA de empresas (`planCompanyDiscovery` em `queryPlanner.ts`) —
 * Hunter não tem endpoint de busca de organizações, só de e-mail/contato (ver
 * `hunter.service.ts`), então nunca é candidato a `DiscoveryProviderId`. Ele é registrado do mesmo
 * jeito porque a tarefa pede as capacidades dos 4 providers centralizadas num único lugar, e porque
 * um futuro `QueryPlanner` de enriquecimento de contato (fora do escopo desta onda) já teria onde
 * ler a capacidade dele.
 */

export type DiscoveryProviderId = 'apollo' | 'googlePlaces' | 'nominatim';
export type ProviderId = DiscoveryProviderId | 'hunter';

export type ProviderDataKind =
  /** Porte, faturamento, ano de fundação, tecnologia, indústria, capital aberto. */
  | 'companyFirmographics'
  /** Nome, endereço, avaliação/nota, telefone, site — dado real de "lugar". */
  | 'companyGeoListing'
  /** Nome, cargo, e-mail, telefone, LinkedIn de uma pessoa (decisor). */
  | 'decisionMakerContacts'
  /** Confirma/descobre um e-mail para um nome já conhecido (não descobre pessoas novas). */
  | 'emailVerification';

export interface ProviderCapabilityProfile {
  id: ProviderId;
  label: string;
  dataKinds: ProviderDataKind[];
  /** true = o provider entende filtros firmográficos estruturados de verdade (porte,
   * faturamento, ano de fundação, tecnologia, capital aberto) — hoje só a Apollo
   * (`organization_num_employees_ranges`, `revenue_range`,
   * `currently_using_any_of_technology_uids`, `organization_trading_status`, ver
   * `organizationSearch.ts`). Google Places/Nominatim não têm noção de firmográfico — são busca
   * textual de "lugar". */
  supportsFirmographicFilters: boolean;
  /** true = o provider geocodifica a busca com precisão real (endereço/coordenada), não só um
   * filtro textual de região. A Apollo filtra localização por TEXTO ("Cidade, Estado, Brazil") e
   * ignora silenciosamente geografias que não reconhece (bug real documentado em
   * `organizationSearch.ts::resolveApolloLocations`) — por isso `discoverCandidates` sempre
   * reservava uma fatia da cota pro Google Places quando a busca é hiperlocal (cidade+estado).
   * Google Places e Nominatim geocodificam de verdade. */
  supportsCitySpecificPrecision: boolean;
  /** Custo estimado (USD) por chamada bem-sucedida. Para Apollo/Hunter, vem do MESMO contador
   * vivo (Prometheus) que `providerCostMetrics.ts` já incrementa em produção — não duplicado
   * aqui, só lido de lá (`getCostPerCallUsd`). Google Places e Nominatim não têm um contador de
   * custo dedicado neste domínio (fora do escopo desta onda — só Apollo/Hunter são
   * `ProspectingCostProvider`); os valores abaixo são estimativas documentadas só para o
   * `QueryPlanner` comparar ordem de grandeza entre providers, não uma métrica viva. */
  costPerCallUsd: number;
  /** false = provider gratuito (sem custo monetário direto — ainda sujeito a política de uso
   * própria, ex.: Nominatim). */
  isPaid: boolean;
  /** Limite de chamadas/minuto conhecido. Para Apollo/Hunter, vem do MESMO token bucket vivo que
   * `providerRateLimit.ts` já aplica (`getRateLimitPerMinute`) — não duplicado aqui. Google
   * Places segue cota de billing do Google Cloud (sem teto fixo/minuto conhecido publicamente
   * para o plano deste app — `null`). Nominatim aplica uma política pública de uso justo de no
   * máx. 1 req/s por IP (https://operations.osmfoundation.org/policies/nominatim/) — não é um
   * teto por minuto documentado como tal, por isso também `null`; respeitado hoje só por este
   * domínio nunca disparar rajada (no máx. `MAX_LEADS_PER_SEARCH` candidatos por busca), não por
   * um limitador dedicado. */
  rateLimitPerMinute: number | null;
  /** true = exige API key própria configurada E `PROSPECTING_PROVIDER_MODE=hybrid` (ver
   * `getPaidProspectingKey`) — quando ausente, a chamada real ao provider hoje retorna vazio
   * silenciosamente (comportamento pré-existente, preservado por este planner, não uma escolha
   * nova). */
  requiresPaidKey: boolean;
  /** Cobertura geográfica real de uso hoje — os 4 providers deste domínio só são usados para
   * empresas no Brasil (ver `REGION_TO_APOLLO_LOCATIONS`/ICP do playbook comercial AtlasGR);
   * nenhum filtra por região fora do Brasil hoje. Não é um limite técnico do provider (todos os
   * 4 suportam outras geografias), é o único uso real deste produto. */
  coverage: 'brazil';
}

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilityProfile> = {
  apollo: {
    id: 'apollo',
    label: 'Apollo.io (Organization Search)',
    dataKinds: ['companyFirmographics', 'decisionMakerContacts'],
    supportsFirmographicFilters: true,
    supportsCitySpecificPrecision: false,
    costPerCallUsd: getCostPerCallUsd('apollo'),
    isPaid: true,
    rateLimitPerMinute: getRateLimitPerMinute('apollo'),
    requiresPaidKey: true,
    coverage: 'brazil',
  },
  googlePlaces: {
    id: 'googlePlaces',
    label: 'Google Places (New) Text Search',
    dataKinds: ['companyGeoListing'],
    supportsFirmographicFilters: false,
    supportsCitySpecificPrecision: true,
    // Não é o valor exato faturado — a Places API (New) cobra por SKU conforme os campos
    // pedidos no FieldMask (Essentials/Pro/Enterprise, ver
    // https://mapsplatform.google.com/pricing/). O FieldMask usado por este domínio
    // (rating, userRatingCount, telefone, site, endereço — ver places.service.ts) cai no SKU
    // "Pro" da tabela pública, listado a ~US$32/1.000 chamadas = US$0.032/chamada. Ajuste este
    // número se o FieldMask real mudar de SKU.
    costPerCallUsd: 0.032,
    isPaid: true,
    rateLimitPerMinute: null,
    requiresPaidKey: true,
    coverage: 'brazil',
  },
  nominatim: {
    id: 'nominatim',
    label: 'OpenStreetMap Nominatim',
    dataKinds: ['companyGeoListing'],
    supportsFirmographicFilters: false,
    supportsCitySpecificPrecision: true,
    costPerCallUsd: 0,
    isPaid: false,
    rateLimitPerMinute: null,
    requiresPaidKey: false,
    coverage: 'brazil',
  },
  hunter: {
    id: 'hunter',
    label: 'Hunter.io (Email Finder / Domain Search)',
    // Hunter não participa da DESCOBERTA de empresas (sem endpoint de busca de organizações)
    // — só do enriquecimento de CONTATO, como fallback de e-mail quando a Apollo People Search
    // não devolve um decisor (ver apollo/people.ts). Registrado aqui pela mesma razão que
    // Apollo/Google Places/Nominatim: capacidade real de cada um dos 4 providers deste domínio
    // centralizada num único lugar — mesmo que `planCompanyDiscovery` nunca o inclua no plano.
    dataKinds: ['decisionMakerContacts', 'emailVerification'],
    supportsFirmographicFilters: false,
    supportsCitySpecificPrecision: false,
    costPerCallUsd: getCostPerCallUsd('hunter'),
    isPaid: true,
    rateLimitPerMinute: getRateLimitPerMinute('hunter'),
    requiresPaidKey: true,
    coverage: 'brazil',
  },
};

/**
 * true = o provider está estruturalmente habilitado neste `providerMode` — só considera o "portão"
 * de modo pago (`PROSPECTING_PROVIDER_MODE=hybrid`), não a presença real da API key (isso só é
 * conhecido dentro do service do provider, via `getPaidProspectingKey`, no momento da chamada).
 * Providers gratuitos (`requiresPaidKey: false`) são sempre estruturalmente habilitados.
 *
 * Usado hoje só pela Apollo em `planCompanyDiscovery` — reproduz fielmente a checagem que o
 * cascade anterior já fazia (`providerMode === 'hybrid' ? fetchApolloCandidates(...) : skip`) para
 * decidir SE a chamada é feita, e não só o quê ela devolve. Google Places, embora também exija
 * chave paga, é chamado incondicionalmente no plano por fidelidade estrita ao comportamento
 * anterior (ver comentário em `queryPlanner.ts::planCompanyDiscovery`) — por isso não usa este
 * helper para decidir inclusão, só a Apollo usa.
 */
export function isProviderAvailable(
  id: ProviderId,
  providerMode: ProspectingProviderMode,
): boolean {
  const capability = PROVIDER_CAPABILITIES[id];
  if (!capability.requiresPaidKey) return true;
  return providerMode === 'hybrid';
}
