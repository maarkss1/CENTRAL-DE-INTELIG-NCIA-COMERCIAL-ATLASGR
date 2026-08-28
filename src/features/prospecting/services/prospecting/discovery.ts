import { logger } from '../../../../lib/logger';
import { prisma } from '../../../../lib/prisma.js';
import { fetchApolloCandidates } from '../apollo.service';
import { searchGooglePlacesCandidates } from '../places.service';
import { searchNominatimCandidates } from '../nominatim.service';
import { getProspectingProviderMode } from '../../../../config/prospecting-integrations.js';
import { ExclusionSet } from '../../utils/exclusionSet.js';
import { buildSearchIntent } from '../../domain/searchIntent.js';
import {
  planCompanyDiscovery,
  planShortfallFallback,
  type ProviderPlanStep,
} from '../../domain/queryPlanner.js';
import { SearchExecutionTracker, type SearchExecutionStatus } from '../searchExecution.service.js';
import { enrichCandidatesWithQualityData } from './qualityEnrichment.js';
import { buildLocationLabel } from '../../domain/prospectTypes.js';
import type { ProspectCriteria, ProspectCandidate, DiscoverResult } from './types.js';

export { buildLocationLabel };

/** Monta a pesquisa nominal para Google Places/OpenStreetMap, combinando livremente nome, segmento, palavra-chave e localização. */
function buildPlacesQuery(criteria: ProspectCriteria): string {
  const companyOrPlace = criteria.nomeEmpresa?.trim();
  const segment = criteria.segmento?.trim();
  const location = buildLocationLabel(criteria)?.trim();
  const keywords = criteria.palavrasChave?.trim();
  const icp = criteria.icp?.trim();
  const volume = criteria.volume?.trim();

  // Combina os termos relevantes (exclui persona/decisorCargos da busca geográfica, pois foca em serviços/empresas)
  const terms = [companyOrPlace, segment, icp, keywords, volume].filter(Boolean);
  const term = terms.length > 0 ? terms.join(' ') : 'Empresa';

  return [term, location ? `em ${location}` : null].filter(Boolean).join(' ');
}

/**
 * Descoberta via Google Places (New) Text Search — empresas reais, sem IA generativa envolvida.
 * Exportada (além de usada pelo orquestrador `discoverCandidates`) porque é a base da ferramenta
 * standalone "Google Places" (`prospecting-tools.routes.ts`) — já é 100% single-provider, não
 * precisa de nenhuma outra função pra "isolar" a fonte.
 */
export async function discoverViaGooglePlaces(
  criteria: ProspectCriteria,
  count: number,
  exclusions: ExclusionSet,
): Promise<ProspectCandidate[]> {
  const query = buildPlacesQuery(criteria);
  const places = await searchGooglePlacesCandidates(query, count + exclusions.size);

  return places
    .filter((p) => !exclusions.has(p.tradeName, p.website))
    .slice(0, count)
    .map((p) => ({
      tradeName: p.tradeName,
      legalNameGuess: null,
      cnpjGuess: null,
      segment: criteria.segmento,
      size: 'Não informado',
      location: [p.city, p.state].filter(Boolean).join(', ') || buildLocationLabel(criteria),
      fitScoreEstimate: p.rating ? Math.round(Math.min(100, p.rating * 20)) : 60,
      suggestedContact: null,
      rationale: p.rating
        ? `Encontrado via Google Places — nota ${p.rating} (${p.userRatingCount || 0} avaliações)`
        : 'Encontrado via Google Places',
      website: p.website || null,
      phone: p.phone || null,
    }));
}

/** Descoberta via OpenStreetMap (Nominatim) — alternativa livre para dados geográficos. */
async function discoverViaNominatim(
  criteria: ProspectCriteria,
  count: number,
  exclusions: ExclusionSet,
): Promise<ProspectCandidate[]> {
  const query = buildPlacesQuery(criteria);
  const places = await searchNominatimCandidates(query, count + exclusions.size);

  return places
    .filter((p) => !exclusions.has(p.tradeName, p.website))
    .slice(0, count)
    .map((p) => ({
      tradeName: p.tradeName,
      legalNameGuess: null,
      cnpjGuess: null,
      segment: criteria.segmento,
      size: 'Não informado',
      location: [p.city, p.state].filter(Boolean).join(', ') || buildLocationLabel(criteria),
      fitScoreEstimate: 60,
      suggestedContact: null,
      rationale: 'Encontrado via OpenStreetMap (Nominatim)',
    }));
}

/**
 * Empresas já cadastradas no CRM deste tenant + candidatos explicitamente rejeitados
 * ("Não é esse perfil") — usado para excluir da descoberta empresas que o vendedor já viu/salvou
 * ou já descartou antes. Sem isso, uma busca repetida com os mesmos filtros amplos (ex:
 * "Transportadora" + "São Paulo") sempre resurfaceava as mesmas ~10 empresas de maior relevância
 * na Apollo, mesmo depois de já promovidas a lead ou marcadas como fora do perfil — era a causa
 * principal do motor de busca "sempre trazer os mesmos contatos".
 */
export async function fetchKnownExclusions(organizationId: string): Promise<ExclusionSet> {
  const exclusions = new ExclusionSet();
  try {
    const [companies, rejections] = await Promise.all([
      prisma.company.findMany({
        where: { organizationId },
        select: { tradeName: true, website: true },
      }),
      prisma.prospectRejection.findMany({
        where: { organizationId },
        select: { tradeName: true, website: true },
      }),
    ]);
    for (const c of companies) exclusions.add(c.tradeName, c.website);
    for (const r of rejections) exclusions.add(r.tradeName, r.website);
  } catch (error) {
    logger.error(
      { err: error },
      'Falha ao buscar empresas já cadastradas/rejeitadas para excluir da descoberta',
    );
  }
  return exclusions;
}

/**
 * Executa UM passo do `QueryPlan` (`domain/queryPlanner.ts`) contra o provider real que ele indica
 * — o único lugar que ainda conhece as três funções concretas de busca (`fetchApolloCandidates`,
 * `discoverViaGooglePlaces`, `discoverViaNominatim`). O planner decide QUAIS providers chamar, com
 * que cota e em que ordem; este dispatcher só traduz essa decisão em chamada real, normalizando o
 * retorno de cada provider (só a Apollo hoje devolve `error` junto dos candidatos) para o mesmo
 * formato `{ candidates, error? }`.
 */
async function executeDiscoveryStep(
  step: ProviderPlanStep,
  criteria: ProspectCriteria,
  exclusions: ExclusionSet,
): Promise<{ candidates: ProspectCandidate[]; error?: string }> {
  switch (step.provider) {
    case 'apollo':
      return fetchApolloCandidates(criteria, step.quota, exclusions);
    case 'googlePlaces':
      return { candidates: await discoverViaGooglePlaces(criteria, step.quota, exclusions) };
    case 'nominatim':
      return { candidates: await discoverViaNominatim(criteria, step.quota, exclusions) };
  }
}

// Onda 42 (DEC-12+DEC-13): a ORDEM e a COTA de cada provider deixaram de ser um array hardcoded e
// passaram a ser uma decisão explícita do QueryPlanner (`domain/queryPlanner.ts`) — dado o mesmo
// `SearchIntent` e `providerMode`, `planCompanyDiscovery` devolve o MESMO cascade que existia antes
// (Apollo → Google Places → Nominatim, com a mesma aritmética de cota), só que agora nomeado,
// comentado e testado (ver queryPlanner.test.ts). Cada chamada de provider real, tanto na leva
// primária quanto no fallback, também alimenta o `SearchExecutionTracker` (DEC-13) — o Search-ID
// rastreável amarra critério → providers chamados → resultados → custo de ponta a ponta.
function trackerProviderName(provider: ProviderPlanStep['provider']): string {
  return provider === 'googlePlaces' ? 'google_places' : provider;
}

/**
 * Descoberta de candidatos: combina Apollo.io, Google Places e OpenStreetMap (Nominatim), na
 * ordem/cota que o `QueryPlanner` (`domain/queryPlanner.ts`) decidir para o `SearchIntent` desta
 * busca — nenhuma chamada a modelos generativos. Cada candidato ainda passa pelo pipeline de
 * enriquecimento real (Receita Federal + Google Places + Apollo People) antes de virar um Lead confiável.
 * `organizationId`, quando informado, exclui do resultado empresas já cadastradas no CRM do tenant
 * ou já rejeitadas (ver `fetchKnownExclusions`) — opcional só para não quebrar chamadas de teste
 * sem tenant. Quando `criteria.cidade` é informado, uma fatia da cota é sempre reservada pro
 * Google Places (precisão geográfica real), em vez de só entrar como fallback se a Apollo não
 * preencher a cota sozinha. `criteria.pagina` avança pro próximo lote do ranking da Apollo.
 */
export async function discoverCandidates(
  criteria: ProspectCriteria,
  organizationId?: string,
  /** Onda 42 (dossiê CPI, DEC-13, opção A): id da SavedSearch cuja reexecução gerou esta busca,
   * quando aplicável (ver `/saved-searches/:id/run` em prospecting.routes.ts) — nunca inferido,
   * só passado quando o chamador realmente sabe a origem. Persistido no
   * ProspectingSearchExecution como relação opcional para amarrar "esta execução veio desta
   * busca salva". */
  savedSearchId?: string | null,
): Promise<DiscoverResult> {
  // `SearchIntent` normaliza `criteria.quantidade` (clamp a MAX_LEADS_PER_SEARCH) da mesma forma
  // que este serviço já fazia antes — `total` é só um apelido local de `intent.quantityRequested`
  // para o restante da função (ranking/corte final) não precisar recalcular o mesmo clamp.
  const intent = buildSearchIntent(criteria);
  const total = intent.quantityRequested;
  const providerMode = getProspectingProviderMode();
  // Search-ID gerado ANTES de qualquer chamada a provider — precisa existir mesmo que a busca
  // falhe logo no início, para os logs estruturados da execução inteira poderem carregá-lo.
  const tracker = new SearchExecutionTracker({
    organizationId,
    savedSearchId: savedSearchId ?? null,
    criteria,
    providerMode,
  });

  try {
    const allCandidates: ProspectCandidate[] = [];
    const exclusions = organizationId
      ? await fetchKnownExclusions(organizationId)
      : new ExclusionSet();

    if (criteria.excludeNames && criteria.excludeNames.length > 0) {
      for (const name of criteria.excludeNames) {
        exclusions.add(name);
      }
    }

    let apolloError: string | undefined;

    function absorb(found: ProspectCandidate[]) {
      for (const candidate of found) {
        if (exclusions.has(candidate.tradeName, candidate.website)) continue;
        exclusions.add(candidate.tradeName, candidate.website);
        allCandidates.push(candidate);
      }
    }

    function reasonMessage(reason: unknown): string {
      return reason instanceof Error ? reason.message : String(reason);
    }

    // A leva primária continua rodando em PARALELO — o plano decide QUEM e QUANTO, não quando;
    // o tempo de resposta ultrarrápido (Promise.allSettled) é preservado.
    const plan = planCompanyDiscovery(intent, providerMode);
    const results = await Promise.allSettled(
      plan.steps.map((step) => executeDiscoveryStep(step, criteria, exclusions)),
    );

    // A ordem de absorção segue `plan.steps` (maior prioridade primeiro) — quando o mesmo nome
    // de empresa aparece em mais de um provider da leva, o resultado do provider mais
    // prioritário "vence" o dedupe (ver `scoreProvider` em queryPlanner.ts). Mesmo comportamento
    // do cascade anterior (Apollo antes de Google Places antes de Nominatim), só que a ordem
    // agora vem do plano, não da posição literal no array de código.
    plan.steps.forEach((step, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        absorb(result.value.candidates);
        if (step.provider === 'apollo') apolloError = result.value.error;
        tracker.recordProviderCall({
          provider: trackerProviderName(step.provider),
          resultCount: result.value.candidates.length,
          status: result.value.error ? 'error' : 'ok',
          errorMessage: result.value.error,
        });
      } else {
        const message = reasonMessage(result.reason);
        if (step.provider === 'apollo') apolloError = message;
        tracker.recordProviderCall({
          provider: trackerProviderName(step.provider),
          resultCount: 0,
          status: 'error',
          errorMessage: message,
        });
      }
    });

    // Se faltarem candidatos para completar a cota desejada, o planner decide se (e como)
    // reforçar — mesma regra do cascade anterior: só em modo 'hybrid', sempre via Google Places.
    const fallbackStep = planShortfallFallback(intent, providerMode, allCandidates.length);
    if (fallbackStep) {
      try {
        const fallbackResult = await executeDiscoveryStep(fallbackStep, criteria, exclusions);
        absorb(fallbackResult.candidates);
        tracker.recordProviderCall({
          provider: trackerProviderName(fallbackStep.provider),
          resultCount: fallbackResult.candidates.length,
          status: 'ok',
        });
      } catch (err) {
        tracker.recordProviderCall({
          provider: trackerProviderName(fallbackStep.provider),
          resultCount: 0,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Falha no fallback do Google Places',
        });
      }
    }

    // RANKING DE ALTA QUALIDADE: eleva ao topo os candidatos com maior acionabilidade (decisores, e-mails, fones, site)
    allCandidates.sort((a, b) => {
      const scoreA =
        (a.fitScoreEstimate || 50) +
        (a.decisionMakers?.length ? 30 : 0) +
        (a.emails?.length ? 20 : 0) +
        (a.phone ? 10 : 0) +
        (a.website ? 10 : 0);
      const scoreB =
        (b.fitScoreEstimate || 50) +
        (b.decisionMakers?.length ? 30 : 0) +
        (b.emails?.length ? 20 : 0) +
        (b.phone ? 10 : 0) +
        (b.website ? 10 : 0);
      return scoreB - scoreA;
    });

    const finalCandidates = allCandidates.slice(0, total);

    // Enriquecimento de qualidade (CNPJ, decisores + LinkedIn/e-mail/telefone, notícias/quebra-gelo)
    // direto na busca — o teto de MAX_LEADS_PER_SEARCH candidatos é o que torna isto viável em
    // termos de tempo/custo (antes, com até 500 candidatos, só os 10 primeiros recebiam notícia e
    // decisores só vinham para os candidatos originados da Apollo).
    try {
      await Promise.race([
        enrichCandidatesWithQualityData(finalCandidates, tracker),
        new Promise<void>((resolve) => setTimeout(resolve, 9000)),
      ]);
    } catch {
      // Non-blocking best-effort
    }

    const hadProviderError = tracker.providerCalls.some((c) => c.status === 'error');
    const finishStatus: SearchExecutionStatus = !hadProviderError
      ? 'success'
      : finalCandidates.length > 0
        ? 'partial'
        : 'error';

    await tracker.finish({
      status: finishStatus,
      totalResults: finalCandidates.length,
      errorMessage: providerMode === 'hybrid' ? apolloError : undefined,
    });

    return {
      searchId: tracker.searchId,
      candidates: finalCandidates,
      sources: [
        {
          title: 'Apollo.io / Google Places / OpenStreetMap',
          uri: 'https://apollo.io',
        },
      ],
      apolloError: providerMode === 'hybrid' ? apolloError : undefined,
      providerMode,
    };
  } catch (error) {
    // Search-ID precisa ser persistido mesmo quando a execução inteira quebra antes de gerar
    // qualquer candidato — é exatamente o cenário que a auditoria de execução (Onda 42) existe
    // para capturar ("a busca rodou, com este critério, e falhou assim").
    await tracker.finish({
      status: 'error',
      totalResults: 0,
      errorMessage:
        error instanceof Error ? error.message : 'Erro desconhecido na execução de busca',
    });
    throw error;
  }
}
