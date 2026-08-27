import { logger } from '../../../lib/logger';
import { prisma, withRlsContext } from '../../../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { isValidCnpj, sanitizeCnpj, discoverCnpjByName } from './cnpj.util';
import { enrichCompany } from './enrichment.service';
import { fetchApolloCandidates, searchDecisionMakersAdvanced, enrichOrganizationWithContacts } from './apollo.service';
import type { DecisionMakerCriteria } from './apollo.service';
import { searchGooglePlacesCandidates } from './places.service';
import { searchNominatimCandidates } from './nominatim.service';
import { toPrismaLeadStatus, fromPrismaLeadStatus, fromPrismaCompanyStatus } from '../../../lib/enumMap';
import { getProspectingProviderMode } from '../../../config/prospecting-integrations.js';
import { pushLeadToBitrix } from '../../integrations/bitrix/bitrix.service.js';
import { ExclusionSet } from '../utils/exclusionSet.js';
import { searchCompanyNews } from './news.service.js';
import { findCompanyDomain } from '../utils/domain.js';
import { validContactEmails } from '../../../shared/utils/contact-links';
import { buildSearchIntent } from '../domain/searchIntent.js';
import { planCompanyDiscovery, planShortfallFallback, type ProviderPlanStep } from '../domain/queryPlanner.js';
import { SearchExecutionTracker, type SearchExecutionStatus } from './searchExecution.service.js';

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

export type { DecisionMakerCriteria };

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
    
    return [term, location ? `em ${location}` : null]
        .filter(Boolean)
        .join(' ');
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
    exclusions: ExclusionSet
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
    exclusions: ExclusionSet
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
            prisma.company.findMany({ where: { organizationId }, select: { tradeName: true, website: true } }),
            prisma.prospectRejection.findMany({ where: { organizationId }, select: { tradeName: true, website: true } }),
        ]);
        for (const c of companies) exclusions.add(c.tradeName, c.website);
        for (const r of rejections) exclusions.add(r.tradeName, r.website);
    } catch (error) {
        logger.error({ err: error }, 'Falha ao buscar empresas já cadastradas/rejeitadas para excluir da descoberta');
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
    exclusions: ExclusionSet
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

export async function discoverCandidates(
    criteria: ProspectCriteria,
    organizationId?: string,
    /** Onda 42 (dossiê CPI, DEC-13, opção A): id da SavedSearch cuja reexecução gerou esta busca,
     * quando aplicável (ver `/saved-searches/:id/run` em prospecting.routes.ts) — nunca inferido,
     * só passado quando o chamador realmente sabe a origem. Persistido no
     * ProspectingSearchExecution como relação opcional para amarrar "esta execução veio desta
     * busca salva". */
    savedSearchId?: string | null
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
        const exclusions = organizationId ? await fetchKnownExclusions(organizationId) : new ExclusionSet();

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
        const results = await Promise.allSettled(plan.steps.map((step) => executeDiscoveryStep(step, criteria, exclusions)));

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
                tracker.recordProviderCall({ provider: trackerProviderName(step.provider), resultCount: 0, status: 'error', errorMessage: message });
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
            const scoreA = (a.fitScoreEstimate || 50) + (a.decisionMakers?.length ? 30 : 0) + (a.emails?.length ? 20 : 0) + (a.phone ? 10 : 0) + (a.website ? 10 : 0);
            const scoreB = (b.fitScoreEstimate || 50) + (b.decisionMakers?.length ? 30 : 0) + (b.emails?.length ? 20 : 0) + (b.phone ? 10 : 0) + (b.website ? 10 : 0);
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
            errorMessage: error instanceof Error ? error.message : 'Erro desconhecido na execução de busca',
        });
        throw error;
    }
}

/**
 * Enriquecimento de qualidade rodado automaticamente ao final de toda busca (candidatos já
 * limitados a MAX_LEADS_PER_SEARCH): CNPJ (busca reversa por nome), decisores com LinkedIn/
 * e-mail/telefone (para candidatos que ainda não vieram com decisor pré-buscado da Apollo — ex:
 * Google Places/OpenStreetMap) e notícia/quebra-gelo recente. As três tarefas de um candidato
 * rodam em paralelo entre si, e todos os candidatos rodam em paralelo entre eles — o tempo total
 * fica limitado pelo orçamento em `discoverCandidates` (Promise.race), não pela soma dos custos.
 */
export async function enrichCandidatesWithQualityData(
    candidates: ProspectCandidate[],
    /** Onda 42: quando informado, cada chamada real de provider feita aqui (CNPJ/Receita Federal,
     * decisores via Apollo/Hunter, notícias) entra na mesma execução de busca rastreada pelo
     * Search-ID do chamador (ver discoverCandidates). Opcional — chamadores fora do fluxo de busca
     * (ex.: reprocessamento manual) continuam funcionando sem tracker. */
    tracker?: SearchExecutionTracker
): Promise<void> {
    await Promise.allSettled(
        candidates.map(async (candidate) => {
            await Promise.allSettled([
                (async () => {
                    if (candidate.cnpjGuess) return;
                    try {
                        const cnpj = await discoverCnpjByName(candidate.tradeName);
                        if (cnpj) candidate.cnpjGuess = cnpj;
                        tracker?.recordProviderCall({ provider: 'receita_federal', resultCount: cnpj ? 1 : 0, status: 'ok' });
                    } catch (err) {
                        logger.error({ err, searchId: tracker?.searchId, companyName: candidate.tradeName }, 'Falha ao descobrir CNPJ do candidato');
                        tracker?.recordProviderCall({
                            provider: 'receita_federal',
                            resultCount: 0,
                            status: 'error',
                            errorMessage: err instanceof Error ? err.message : 'Falha ao descobrir CNPJ',
                        });
                    }
                })(),
                (async () => {
                    if (candidate.decisionMakers) return; // já veio pré-buscado (Apollo) ou já tentamos antes
                    const domain = findCompanyDomain(candidate.website, candidate.rationale);
                    if (!domain) return;
                    try {
                        const { contacts, source } = await enrichOrganizationWithContacts(domain, 3);
                        candidate.decisionMakers = contacts.map((c) => ({
                            name: c.name,
                            title: c.title,
                            email: c.email,
                            emailSource: c.email ? (source === 'hunter' ? 'hunter' : 'apollo') : undefined,
                            phone: c.phone || null,
                            linkedinUrl: c.linkedin_url,
                        }));
                        if (candidate.decisionMakers.length > 0) {
                            candidate.emails = validContactEmails(candidate.decisionMakers.map((dm) => dm.email));
                        }
                        tracker?.recordProviderCall({ provider: source ?? 'apollo', resultCount: contacts.length, status: 'ok' });
                    } catch (err) {
                        logger.error({ err, searchId: tracker?.searchId, companyName: candidate.tradeName, domain }, 'Falha ao buscar decisores do candidato');
                        tracker?.recordProviderCall({
                            provider: 'apollo',
                            resultCount: 0,
                            status: 'error',
                            errorMessage: err instanceof Error ? err.message : 'Falha ao buscar decisores',
                        });
                    }
                })(),
                (async () => {
                    try {
                        const mentions = await searchCompanyNews(candidate.tradeName);
                        if (mentions && mentions.length > 0) {
                            candidate.webInsights = mentions.map((m) => ({ title: m.title, url: m.url, domain: m.domain }));
                            candidate.icebreakerHook = `📰 Fato Relevante / Notícia: "${mentions[0].title}" (${mentions[0].domain})`;
                        }
                        tracker?.recordProviderCall({ provider: 'news_search', resultCount: mentions?.length ?? 0, status: 'ok' });
                    } catch (err) {
                        logger.error({ err, searchId: tracker?.searchId, companyName: candidate.tradeName }, 'Falha ao buscar notícias para candidato');
                        tracker?.recordProviderCall({
                            provider: 'news_search',
                            resultCount: 0,
                            status: 'error',
                            errorMessage: err instanceof Error ? err.message : 'Falha ao buscar notícias',
                        });
                    }
                })(),
            ]);
        })
    );
}

export interface RejectCandidateInput {
    tradeName: string;
    website?: string | null;
    reason?: string | null;
    organizationId: string;
}

/**
 * Registra um candidato como "Não é esse perfil" — passa a ser excluído de futuras descobertas
 * deste tenant (ver `fetchKnownExclusions`). Não referencia Company/Lead: o candidato rejeitado
 * nunca chegou a ser promovido, então não existe registro nenhum pra apontar.
 */
export async function rejectCandidate(input: RejectCandidateInput) {
    return prisma.prospectRejection.create({
        data: {
            organizationId: input.organizationId,
            tradeName: input.tradeName,
            website: input.website || null,
            reason: input.reason || null,
        },
    });
}

/**
 * Busca de decisores para uma empresa específica (por domínio).
 */
export async function discoverDecisionMakers(domain: string, criteria: DecisionMakerCriteria) {
    const result = await searchDecisionMakersAdvanced(domain, criteria, 10);
    return { decisionMakers: result.contacts, error: result.error };
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

function splitLocation(location?: string | null): { city?: string; state?: string } {
    if (!location) return {};
    const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
    return { city: parts[0], state: parts[1] };
}

/**
 * Localiza uma empresa já cadastrada na organização que corresponda ao candidato
 * (mesmo CNPJ ou mesmo nome fantasia/razão social) — evita duplicar empresas ao
 * promover o mesmo candidato mais de uma vez.
 *
 * `$queryRaw` não passa pela extensão `$allOperations` de `src/lib/prisma.ts` (RLS/tenant
 * scoping) — roda via `withRlsContext` (seta `app.current_tenant_id` na transação; sem isso a
 * policy de RLS de "Company" com FORCE ROW LEVEL SECURITY devolve zero linhas sempre, mesmo com
 * o WHERE certo) e mantém o filtro explícito de `organizationId` como defesa em profundidade,
 * igual ao padrão já usado em `src/lib/ai/vectorStore.ts`.
 */
async function findExistingCompany(input: PromoteInput) {
    try {
        const cnpj = input.cnpj && isValidCnpj(input.cnpj) ? sanitizeCnpj(input.cnpj) : null;
        if (cnpj) {
            // CNPJs de Company nem sempre chegam ao banco no mesmo formato (alguns fluxos
            // gravam só dígitos, outros com pontuação) — normaliza no próprio Postgres via
            // regexp_replace em vez de carregar todas as empresas do tenant para comparar em
            // memória, o que não escalaria com a base de clientes.
            //
            // '\\D' (barra dupla) de propósito: dentro de um template literal comum do JS, `\D`
            // não é uma sequência de escape reconhecida, então o parser descarta a barra e o texto
            // "cooked" enviado ao driver do Postgres vira só `D` — Prisma usa esse texto "cooked"
            // (não `strings.raw`) para montar o SQL da query crua. Com barra simples, o
            // regexp_replace comparava contra o caractere literal "D" (que um CNPJ nunca tem), e a
            // busca por CNPJ nunca encontrava nada, mesmo já dentro do withRlsContext — confirmado
            // empiricamente contra Postgres real (ver tests/integration/prospecting-rls.test.ts).
            const [found] = await withRlsContext((tx) => tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM "Company"
                WHERE "organizationId" = ${input.organizationId}
                  AND cnpj IS NOT NULL
                  AND regexp_replace(cnpj, '\\D', '', 'g') = ${cnpj}
                LIMIT 1
            `);
            if (found) return prisma.company.findUnique({ where: { id: found.id } });
        }
        return await prisma.company.findFirst({
            where: {
                organizationId: input.organizationId,
                OR: [
                    { tradeName: { equals: input.tradeName, mode: 'insensitive' } },
                    { legalName: { equals: input.legalName || input.tradeName, mode: 'insensitive' } },
                ],
            },
        });
    } catch {
        return null;
    }
}

/**
 * Cria (ou reaproveita) Company + Contact + Lead no CRM a partir de um candidato e dispara o
 * enriquecimento real.
 *
 * Não tem fallback silencioso: se qualquer escrita no banco falhar, o erro sobe para a rota (que
 * já trata via `next(error)`). Um fallback aqui já devolveu, no passado, uma empresa/lead
 * inteiramente fabricados com HTTP 201 de sucesso — o usuário via um lead "criado" que nunca foi
 * persistido e sumia na primeira busca real.
 */
export async function promoteToCrm(input: PromoteInput) {
    const derivedLocation = splitLocation(input.location);
    const city = input.city || derivedLocation.city || null;
    const state = input.state || derivedLocation.state || null;

    const existing = await findExistingCompany(input);
    const reusedCompany = !!existing;

    const company = existing ?? await prisma.company.create({
        data: {
            legalName: input.legalName || input.tradeName,
            tradeName: input.tradeName,
            cnpj: input.cnpj && isValidCnpj(input.cnpj) ? sanitizeCnpj(input.cnpj) : null,
            segment: input.segment,
            size: input.size,
            city,
            state,
            linkedin: input.linkedin || null,
            website: input.website || null,
            phones: input.phone ? [input.phone] : [],
            status: 'Ativo',
            tags: ['Prospecção'],
            organizationId: input.organizationId,
        },
    });

    if (reusedCompany) {
        const openLead = await prisma.lead.findFirst({
            where: {
                companyId: company.id,
                organizationId: input.organizationId,
                status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos', 'Lead_Desqualificado'] },
            },
            include: { company: true, contact: true, timeline: true },
        });
        if (openLead) {
            return {
                lead: {
                    ...openLead,
                    status: fromPrismaLeadStatus(openLead.status),
                    company: openLead.company
                        ? { ...openLead.company, status: fromPrismaCompanyStatus(openLead.company.status) }
                        : openLead.company,
                },
                fit: undefined,
                enrichment: null,
                alreadyExists: true,
            };
        }
    }

        let contact = null;
    if (input.contact?.name) {
        // Rotulagem LGPD na observação (já que schema é propriedade do Agente 01)
        const isFromProvider = input.source.toLowerCase().includes('apollo') || input.source.toLowerCase().includes('hunter');
        const lgpdNote = isFromProvider ? `[LGPD] Origem: ${input.source} | Base Legal: Legítimo Interesse (B2B)` : `[LGPD] Origem: ${input.source} | Base Legal: Consentimento/Público`;
        
        contact = await prisma.contact.create({
            data: {
                name: input.contact.name,
                role: input.contact.role,
                companyId: company.id,
                status: 'Ativo',
                observations: `Contato sugerido — confirmar identidade e dados antes da abordagem.\n${lgpdNote}`,
                organizationId: input.organizationId,
            },
        });
    }

    let enrichmentResult: Awaited<ReturnType<typeof enrichCompany>> | null = null;
    if (input.autoEnrich !== false) {
        try {
            enrichmentResult = await enrichCompany(input.organizationId, company.id, {
                cnpj: company.cnpj || undefined,
                segmentKeywords: input.segment ? [input.segment] : undefined,
                fleetSizeHint: input.size || undefined,
                preFetchedDecisionMakers: input.decisionMakers?.length ? input.decisionMakers : undefined,
            });
        } catch (error) {
            // Enriquecimento é um extra sobre um lead já persistido de verdade — sua falha não
            // pode impedir a criação do lead, só deixá-lo sem o fit score automático.
            logger.error({ err: error }, 'Auto-enrichment failed during promote');
        }
    }

    const finalCompany = enrichmentResult?.company || company;
    const fit = enrichmentResult?.fit;

    const lead = await prisma.lead.create({
        data: {
            status: toPrismaLeadStatus('Lead Recebido') as unknown as Prisma.LeadCreateInput['status'],
            source: input.source,
            channel: 'Prospecção',
            temperature: fit?.temperature || 'Morno',
            score: fit?.score ?? null,
            companyId: finalCompany.id,
            contactId: contact?.id,
            organizationId: input.organizationId,
            savedSearchId: input.savedSearchId ?? null,
            timeline: {
                create: {
                    type: 'creation',
                    description: `Lead criado via ${input.source}${enrichmentResult ? ' — enriquecido automaticamente com dados da Receita Federal' : ''}`,
                },
            },
        },
        include: { company: true, contact: true, timeline: true },
    });

    // Fire-and-forget: Atlas → Bitrix24 é automático (nunca exige clique manual), mas nunca deve
    // atrasar nem derrubar a resposta de criação do lead — pushLeadToBitrix já engole os próprios
    // erros e vira no-op se a organização não tiver Bitrix conectado.
    void pushLeadToBitrix(input.organizationId, lead.id);

    return {
        lead: {
            ...lead,
            status: fromPrismaLeadStatus(lead.status),
            company: lead.company ? { ...lead.company, status: fromPrismaCompanyStatus(lead.company.status) } : null,
        },
        fit,
        enrichment: enrichmentResult,
    };
}

