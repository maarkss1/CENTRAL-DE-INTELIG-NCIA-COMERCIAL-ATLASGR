import type { ProspectingProviderMode } from '../../../config/prospecting-integrations.js';
import type { SearchIntent } from './searchIntent.js';
import {
  PROVIDER_CAPABILITIES,
  isProviderAvailable,
  type DiscoveryProviderId,
} from './providerCapabilities.js';

/**
 * CPI DEC-12 (opção A) — camada `QueryPlanner`.
 *
 * Antes deste módulo, a ORDEM e a COTA de cada provider na descoberta de empresas eram uma
 * sequência fixa dentro de `discoverCandidates` (`prospecting.service.ts`): um array
 * `Promise.allSettled([fetchApolloCandidates(...), discoverViaGooglePlaces(...),
 * discoverViaNominatim(...)])` com condicionais soltas (`providerMode === 'hybrid' ? ... : ...`,
 * `total > 15 ? ... : ...`) escritas diretamente no meio da função de orquestração — nenhum teste
 * cobria "dado este critério, por que a Apollo entra e o Nominatim não", porque a decisão não
 * existia como uma função isolada, só como efeito colateral da ordem do array.
 *
 * Este módulo torna essa decisão EXPLÍCITA e TESTÁVEL: `planCompanyDiscovery` recebe um
 * `SearchIntent` + o `providerMode` vigente e devolve um `QueryPlan` — quais providers chamar, em
 * que ordem (prioridade) e com que cota, cada um com a razão documentada. `discoverCandidates`
 * (`prospecting.service.ts`) executa esse plano; não decide mais nada sozinho.
 *
 * Comportamento preservado como caso-base: os mesmos números/condições que o cascade fixo anterior
 * já usava (Apollo só em modo 'hybrid' com cota = quantidade total; Google Places sempre com a
 * mesma reserva de 40% quando a busca é hiperlocal; Nominatim só acima de 15 candidatos pedidos,
 * com teto de 20) — ver `queryPlanner.test.ts`, seção "paridade com o cascade legado". A única
 * coisa nova é que agora essas decisões são função pura, nomeada, comentada e testada — não uma
 * sequência hardcoded.
 */

export interface ProviderPlanStep {
  provider: DiscoveryProviderId;
  /** Quantos candidatos pedir a este provider nesta chamada. */
  quota: number;
  /** Score de prioridade (maior = mais prioritário) — ver `scoreProvider`. Controla a ORDEM do
   * plano, que por sua vez controla a ordem de absorção/dedupe em `discoverCandidates`: quando o
   * mesmo nome de empresa aparece em mais de um provider da mesma leva, o resultado do provider
   * que aparece PRIMEIRO no plano é o que fica (ver `absorb` em `prospecting.service.ts`). Não
   * controla velocidade — todos os providers da leva primária ainda são chamados em paralelo. */
  score: number;
  /** Por que este provider entrou no plano com esta quota/posição — pensado para log/teste, não
   * só comentário de código. Sempre tem ao menos a razão de prioridade-base. */
  reasons: string[];
}

export interface QueryPlan {
  /** Ordenados por score decrescente — a ordem em que `discoverCandidates` deve chamar e
   * absorver os resultados. */
  steps: ProviderPlanStep[];
  intent: SearchIntent;
  providerMode: ProspectingProviderMode;
}

// Pesos do scoring — números escolhidos com uma folga grande o bastante entre o "score base" de
// cada provider (30 pontos de diferença em cada degrau) para que NENHUMA combinação de bônus de
// intent troque a ordem relativa entre eles (soma máxima de bônus por provider = 25, sempre menor
// que os 30 de folga — ver teste "a ordem relativa nunca inverte" em queryPlanner.test.ts). Não é
// ML nem precisa ser: é uma função determinística, pequena o bastante para ser auditada por
// inteiro num code review, e testada exatamente por isso.
const BASE_SCORE: Record<DiscoveryProviderId, number> = {
  // Único provider com filtro firmográfico estruturado real (porte, faturamento, ano de
  // fundação, tecnologia, capital aberto) e decisor pré-buscado — a fonte de dado mais rica do
  // ICP logístico da Atlas hoje (ver `organizationSearch.ts`/`rankByIcpAffinity`).
  apollo: 100,
  // Dado real de "lugar" (endereço, avaliação, telefone, site) com geocodificação precisa — mais
  // confiável que a Apollo para geografia hiperlocal, mais rico que o Nominatim.
  googlePlaces: 70,
  // Fallback aberto/gratuito — cobertura mais fraca de campos (sem avaliação; telefone/site
  // dependem de tag OSM preenchida pela comunidade), mas sem custo e sem exigir chave.
  nominatim: 40,
};

const W_FIRMOGRAPHIC_MATCH = 15;
const W_CITY_PRECISION_MATCH = 15;
const W_DECISION_MAKER_MATCH = 10;

/**
 * Calcula a prioridade de um provider para este `SearchIntent` específico — score base do provider
 * (`BASE_SCORE`, reflete a riqueza/confiabilidade geral do dado que ele traz) mais bônus quando uma
 * capacidade real do provider (`providerCapabilities.ts`) bate com uma necessidade real da busca.
 * Exportada para ser testada isoladamente, sem precisar montar um `QueryPlan` inteiro.
 */
export function scoreProvider(
  provider: DiscoveryProviderId,
  intent: SearchIntent,
): { score: number; reasons: string[] } {
  const capability = PROVIDER_CAPABILITIES[provider];
  let score = BASE_SCORE[provider];
  const reasons: string[] = [`Prioridade-base (${capability.label}): ${BASE_SCORE[provider]}`];

  if (intent.needsFirmographicFiltering && capability.supportsFirmographicFilters) {
    score += W_FIRMOGRAPHIC_MATCH;
    reasons.push(
      `+${W_FIRMOGRAPHIC_MATCH}: busca pede filtro firmográfico estruturado (porte/faturamento/ano/tecnologia/capital aberto) e este provider sabe filtrar por isso`,
    );
  }
  if (intent.location.isCitySpecific && capability.supportsCitySpecificPrecision) {
    score += W_CITY_PRECISION_MATCH;
    reasons.push(
      `+${W_CITY_PRECISION_MATCH}: busca informou cidade+estado (geografia hiperlocal) e este provider geocodifica com precisão real`,
    );
  }
  if (intent.needsDecisionMakerContacts && capability.dataKinds.includes('decisionMakerContacts')) {
    score += W_DECISION_MAKER_MATCH;
    reasons.push(
      `+${W_DECISION_MAKER_MATCH}: busca informou cargos-alvo de decisor e este provider já traz decisor pré-buscado`,
    );
  }
  return { score, reasons };
}

/** Abaixo desta quantidade solicitada, o Nominatim não entra no plano — mesma regra que já valia
 * implicitamente no cascade fixo anterior (`total > 15` em `prospecting.service.ts`): buscas
 * pequenas já costumam ser bem cobertas por Apollo+Google Places, e uma terceira chamada de rede
 * (mesmo gratuita) só para completar uma cota que os dois primeiros já preenchem não compensa a
 * latência extra. Preservada aqui como constante nomeada e testável em vez de um "15" solto no
 * meio do orquestrador. */
export const NOMINATIM_SUPPLEMENT_MIN_QUANTITY = 15;

/** Teto de candidatos que o Nominatim é chamado a trazer numa única leva — mesmo teto que já valia
 * no cascade fixo anterior. */
const NOMINATIM_QUOTA_CAP = 20;

/** Fração da cota total reservada ao Google Places quando a busca já é hiperlocal (cidade+estado
 * informados) — mesma regra do cascade fixo anterior (comentário original em
 * `discoverCandidates`: "quando `criteria.cidade` é informado, uma fatia da cota é sempre
 * reservada pro Google Places [...] em vez de só entrar como fallback"). */
const CITY_SPECIFIC_GOOGLE_PLACES_SHARE = 0.4;
const GOOGLE_PLACES_QUOTA_CAP = 25;

function googlePlacesQuota(intent: SearchIntent): number {
  return intent.location.isCitySpecific
    ? Math.max(1, Math.round(intent.quantityRequested * CITY_SPECIFIC_GOOGLE_PLACES_SHARE))
    : Math.min(intent.quantityRequested, GOOGLE_PLACES_QUOTA_CAP);
}

/**
 * Decide QUAIS providers chamar (e em que ORDEM/COTA) para a leva primária (paralela) de uma
 * descoberta de empresas — substitui o cascade fixo anterior (Apollo → Google Places → Nominatim,
 * sempre nesta ordem, sempre com esta aritmética de cota) por uma decisão explícita e testável.
 */
export function planCompanyDiscovery(
  intent: SearchIntent,
  providerMode: ProspectingProviderMode,
): QueryPlan {
  const steps: ProviderPlanStep[] = [];

  // Apollo só participa em modo 'hybrid' — em 'free' não há chave paga habilitada
  // (`getPaidProspectingKey`) e o cascade anterior já pulava a chamada inteiramente nesse caso
  // (`Promise.resolve({candidates: []})` em vez de chamar `fetchApolloCandidates`). Usa
  // `isProviderAvailable` (baseado na capacidade declarada `requiresPaidKey`) em vez de repetir
  // a checagem de modo solta.
  if (isProviderAvailable('apollo', providerMode)) {
    const { score, reasons } = scoreProvider('apollo', intent);
    steps.push({
      provider: 'apollo',
      quota: intent.quantityRequested,
      score,
      reasons: [...reasons, `providerMode='hybrid' habilita este provider pago`],
    });
  }

  // Google Places é sempre tentado na leva primária, independente do modo — o cascade anterior
  // também chamava `discoverViaGooglePlaces` incondicionalmente; sem chave paga habilitada (modo
  // 'free'), a chamada real já devolvia vazio internamente (`getPaidProspectingKey` depende do
  // mesmo `providerMode`), então o resultado observável é idêntico. Preservado por fidelidade
  // estrita ao comportamento anterior — não é uma escolha nova deste planner (por isso não usa
  // `isProviderAvailable`, diferente da Apollo acima).
  {
    const { score, reasons } = scoreProvider('googlePlaces', intent);
    steps.push({ provider: 'googlePlaces', quota: googlePlacesQuota(intent), score, reasons });
  }

  if (intent.quantityRequested > NOMINATIM_SUPPLEMENT_MIN_QUANTITY) {
    const { score, reasons } = scoreProvider('nominatim', intent);
    steps.push({
      provider: 'nominatim',
      quota: Math.min(intent.quantityRequested, NOMINATIM_QUOTA_CAP),
      score,
      reasons: [
        ...reasons,
        `quantidade solicitada (${intent.quantityRequested}) > ${NOMINATIM_SUPPLEMENT_MIN_QUANTITY} — cota grande o bastante para justificar uma terceira fonte gratuita`,
      ],
    });
  }

  // Ordena por score decrescente (maior prioridade primeiro). No cascade legado a ORDEM da leva
  // primária (que também é a ordem de absorção/dedupe — ver `absorb` em
  // `prospecting.service.ts`) já era hardcoded como Apollo → Google Places → Nominatim; o
  // scoring acima foi desenhado (ver `BASE_SCORE`) para reproduzir exatamente essa ordem por
  // padrão, mas agora de forma explícita e auditável — a posição no array de código deixou de
  // ser o que determina a prioridade.
  steps.sort((a, b) => b.score - a.score);

  return { steps, intent, providerMode };
}

/**
 * Decide se (e com que cota) uma chamada de reforço deve ser feita depois da leva primária, quando
 * ela não preencheu a cota pedida — mesma regra do cascade anterior: só em modo 'hybrid' (reforçar
 * com o mesmo Google Places sem chave paga não mudaria nada — ver
 * `providerCapabilities.ts::requiresPaidKey`), sempre via Google Places (único provider usado como
 * reforço no cascade anterior: `discoverCandidates` chamava `discoverViaGooglePlaces` de novo,
 * nunca Apollo/Nominatim, quando faltavam candidatos). Devolve `null` quando não há reforço a
 * fazer — a cota já foi preenchida, ou o modo não permite.
 */
export function planShortfallFallback(
  intent: SearchIntent,
  providerMode: ProspectingProviderMode,
  gatheredCount: number,
): ProviderPlanStep | null {
  if (providerMode !== 'hybrid') return null;
  if (gatheredCount >= intent.quantityRequested) return null;

  const remaining = intent.quantityRequested - gatheredCount;
  const { score, reasons } = scoreProvider('googlePlaces', intent);
  return {
    provider: 'googlePlaces',
    quota: remaining,
    score,
    reasons: [
      ...reasons,
      `leva primária trouxe só ${gatheredCount}/${intent.quantityRequested} candidatos — reforço para completar a cota`,
    ],
  };
}
