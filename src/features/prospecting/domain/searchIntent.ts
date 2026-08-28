/**
 * CPI DEC-12 (opção A) — camada `SearchIntent`.
 *
 * Antes desta camada, `ProspectCriteria` (o shape bruto vindo da rota/formulário, com campos
 * livre-texto pensados individualmente para cada provider — ex.: `porte` no formato Apollo
 * "min,max", `tecnologias` como lista de UIDs Apollo) era interpretado DIRETAMENTE dentro de cada
 * função de busca (`fetchApolloCandidates`, `discoverViaGooglePlaces`, `discoverViaNominatim`) —
 * não existia um lugar único que respondesse "o que o usuário está pedindo, de forma normalizada e
 * independente de provider" antes de decidir quem chamar.
 *
 * `SearchIntent` é essa camada de domínio: não conhece Apollo/Google Places/Nominatim, só sabe o
 * que foi pedido. `QueryPlanner` (`queryPlanner.ts`) é quem lê um `SearchIntent` + as capacidades
 * declaradas de cada provider (`providerCapabilities.ts`) e decide quais chamar e em que ordem. As
 * funções de busca de cada provider continuam recebendo o `ProspectCriteria` bruto (nenhuma delas
 * foi reescrita nesta onda — ver AGENTS.md "não ocultar falha de provider"/mudança mínima) — o
 * `SearchIntent` participa só da DECISÃO de estratégia, não da montagem de cada request.
 */

/** Teto de leads por busca — espelhado em `discoverCriteria.schema.ts` (`quantidade.max(20)`) e
 * consumido por `prospecting.service.ts`. Vive aqui (não duplicado) porque é o próprio
 * `SearchIntent` quem primeiro precisa desse teto, ao normalizar `quantidade` em
 * `quantityRequested`. Priorizamos qualidade (enriquecimento completo: CNPJ, decisores, notícias)
 * em vez de volume — ver `enrichCandidatesWithQualityData`. */
export const MAX_LEADS_PER_SEARCH = 20;

/**
 * Subconjunto dos campos de `ProspectCriteria` (services/prospecting.service.ts) que
 * `buildSearchIntent` precisa. Definido aqui — não importado de lá — de propósito: a camada de
 * domínio não deve depender de volta na camada de orquestração. Um import de tipo pareceria
 * inofensivo (apagado na compilação), mas `services/prospecting.service.ts` importa
 * `services/apollo.service.ts` → `services/apollo/organizationSearch.ts` → de volta
 * `services/prospecting.service.ts` (já preexistente, para `buildLocationLabel`); encadear
 * `domain/searchIntent.ts` nesse mesmo ciclo criava um import circular REAL entre `domain/` e
 * `services/`, confirmado por `npx depcruise` (regra `no-circular`) — mesmo com o import sendo só
 * de tipo. TypeScript tipa estruturalmente: qualquer `ProspectCriteria` real já satisfaz este
 * shape, então `services/prospecting.service.ts` passa seu `ProspectCriteria` para
 * `buildSearchIntent` sem precisar de nenhum cast.
 */
export interface ProspectCriteriaLike {
    icp?: string;
    decisorCargos?: string[];
    segmento: string;
    localizacao: string;
    quantidade: number;
    estado?: string;
    cidade?: string;
    porte?: string;
    faturamentoMin?: number;
    faturamentoMax?: number;
    faturamentoMensalMin?: number;
    faturamentoMensalMax?: number;
    volume?: string;
    palavrasChave?: string;
    nomeEmpresa?: string;
    anoFundacaoMin?: number;
    anoFundacaoMax?: number;
    tecnologias?: string;
    tecnologiasExcluir?: string;
    localizacaoExcluir?: string;
    apenasCapitalAberto?: boolean;
    pagina?: number;
    excludeNames?: string[];
}

export interface SearchLocationIntent {
    /** Texto bruto usado como fallback quando não há estado/cidade estruturados (ex.: região ampla
     * do playbook comercial, "Rio de Janeiro e Região", ou já a combinação "Cidade, Estado"). */
    label: string;
    city?: string;
    state?: string;
    /** Cidades/estados a excluir da busca (hoje só a Apollo sabe filtrar isso — ver
     * `organization_not_locations` em organizationSearch.ts). */
    excluded: string[];
    /** true quando cidade E estado foram informados — a busca pede geografia hiperlocal real, não
     * uma região ampla/estado inteiro. Providers que geocodificam de verdade (Google Places,
     * Nominatim) ganham prioridade no `QueryPlanner` quando isto é true — ver
     * `providerCapabilities.ts::supportsCitySpecificPrecision`. */
    isCitySpecific: boolean;
}

export interface SearchFirmographicIntent {
    /** Faixa de funcionários no formato Apollo "min,max" (ex.: "11,50") — mantido no formato bruto
     * porque só a Apollo sabe interpretá-lo hoje; nenhum outro provider deste domínio filtra por
     * porte. */
    employeeRange?: string;
    annualRevenueMin?: number;
    annualRevenueMax?: number;
    foundedYearMin?: number;
    foundedYearMax?: number;
    technologiesInclude: string[];
    technologiesExclude: string[];
    publicCompanyOnly: boolean;
}

export interface SearchIntent {
    segment: string;
    /** Termos livres adicionais (ICP, volume de operação, palavras-chave soltas, cargos de
     * decisor) — o que hoje vira `q_organization_keyword_tags` na Apollo ou é concatenado na query
     * textual de Google Places/Nominatim. Mantido como lista normalizada (trim, sem vazios) em vez
     * do texto bruto separado por vírgula do formulário. */
    freeTextTerms: string[];
    companyName?: string;
    location: SearchLocationIntent;
    firmographics: SearchFirmographicIntent;
    /** true quando qualquer filtro firmográfico estruturado (porte, faturamento, ano de fundação,
     * tecnologia, capital aberto) foi informado — hoje só a Apollo sabe filtrar por isso de verdade
     * (ver `organizationSearch.ts`); usado pelo `QueryPlanner` para priorizar a Apollo quando esses
     * filtros importam para a busca. */
    needsFirmographicFiltering: boolean;
    decisionMakerTitles: string[];
    /** true quando cargos-alvo de decisor foram informados explicitamente — sinal de que a busca
     * se importa especialmente com decisor pré-buscado (capacidade que só a Apollo tem hoje na
     * descoberta — ver `enrichCandidatesWithDecisionMakers`). NÃO controla se a descoberta busca
     * decisores (isso sempre acontece ao final, para todo candidato — ver
     * `enrichCandidatesWithQualityData`); só afeta a prioridade que o `QueryPlanner` dá à Apollo. */
    needsDecisionMakerContacts: boolean;
    /** Já limitado a `MAX_LEADS_PER_SEARCH` — mesmo teto que `discoverCandidates` aplicava antes
     * de montar o cascade. */
    quantityRequested: number;
    page?: number;
    excludeNames: string[];
}

function splitList(value: string | undefined): string[] {
    if (!value) return [];
    return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/** Mesma regra de `buildLocationLabel` (prospecting.service.ts): cidade+estado > estado > região
 * ampla do playbook. Reimplementada aqui (em vez de importar o valor) para o domínio de
 * `SearchIntent` não importar de volta `services/prospecting.service.ts` (ver
 * `ProspectCriteriaLike` acima — evita o import circular real). Se `buildLocationLabel` mudar,
 * esta função precisa mudar junto — coberta pelo mesmo teste de paridade em `queryPlanner.test.ts`
 * que já cobre o resto do `SearchIntent`. */
function resolveLocationLabel(criteria: Pick<ProspectCriteriaLike, 'cidade' | 'estado' | 'localizacao'>): string {
    if (criteria.cidade && criteria.estado) return `${criteria.cidade}, ${criteria.estado}`;
    if (criteria.estado) return criteria.estado;
    return criteria.localizacao;
}

/**
 * Normaliza um `ProspectCriteria` bruto (formulário/rota) num `SearchIntent` tipado — a busca do
 * usuário representada de forma independente de provider, pronta para o `QueryPlanner` decidir
 * estratégia em cima dela.
 */
export function buildSearchIntent(criteria: ProspectCriteriaLike): SearchIntent {
    const freeTextTerms = [
        criteria.icp?.trim(),
        criteria.volume?.trim(),
        ...splitList(criteria.palavrasChave),
        ...(criteria.decisorCargos?.map((c) => c.trim()).filter(Boolean) || []),
    ].filter((v): v is string => !!v);

    const isCitySpecific = !!(criteria.cidade && criteria.estado);

    const hasFirmographicFilter = !!(
        criteria.porte ||
        criteria.faturamentoMin != null ||
        criteria.faturamentoMax != null ||
        criteria.faturamentoMensalMin != null ||
        criteria.faturamentoMensalMax != null ||
        criteria.anoFundacaoMin != null ||
        criteria.anoFundacaoMax != null ||
        criteria.tecnologias ||
        criteria.tecnologiasExcluir ||
        criteria.apenasCapitalAberto
    );

    return {
        segment: criteria.segmento,
        freeTextTerms,
        companyName: criteria.nomeEmpresa?.trim() || undefined,
        location: {
            label: resolveLocationLabel(criteria),
            city: criteria.cidade,
            state: criteria.estado,
            excluded: splitList(criteria.localizacaoExcluir),
            isCitySpecific,
        },
        firmographics: {
            employeeRange: criteria.porte,
            annualRevenueMin: criteria.faturamentoMin,
            annualRevenueMax: criteria.faturamentoMax,
            foundedYearMin: criteria.anoFundacaoMin,
            foundedYearMax: criteria.anoFundacaoMax,
            technologiesInclude: splitList(criteria.tecnologias),
            technologiesExclude: splitList(criteria.tecnologiasExcluir),
            publicCompanyOnly: !!criteria.apenasCapitalAberto,
        },
        needsFirmographicFiltering: hasFirmographicFilter,
        decisionMakerTitles: criteria.decisorCargos?.map((c) => c.trim()).filter(Boolean) || [],
        needsDecisionMakerContacts: !!(criteria.decisorCargos && criteria.decisorCargos.length > 0),
        quantityRequested: Math.max(1, Math.min(MAX_LEADS_PER_SEARCH, criteria.quantidade || MAX_LEADS_PER_SEARCH)),
        page: criteria.pagina,
        excludeNames: criteria.excludeNames || [],
    };
}
