import type { ProspectCriteria, ProspectCandidate } from '../prospecting.service';
import { buildLocationLabel } from '../prospecting.service';
import { getPaidProspectingKey } from '../../../../config/prospecting-integrations.js';
import { fetchWithProviderRetry } from '../../../../lib/enrichment/providerFetch.js';
import { validContactEmails } from '../../../../shared/utils/contact-links';
import { logger } from '../../../../lib/logger';
import { APOLLO_SEARCH_URL, DECISION_MAKER_PREFETCH_BUDGET_MS } from './client.js';
import type { ApolloSearchResponse } from './types.js';
import { enrichCandidatesWithDecisionMakers } from './people.js';

/**
 * As opções de "Região de Atuação (ampla)" do ICP (icp-options.ts) usam rótulos do playbook
 * comercial (ex: "Rio de Janeiro e Região", "Sul (PR, SC, RS)") que NÃO são geografias válidas
 * para a Apollo — testado contra a API real: "Rio de Janeiro e Região" devolve 0 resultados
 * (silenciosamente, sem erro), enquanto "Rio de Janeiro, Brazil" devolve resultados normalmente.
 * Este mapa traduz cada rótulo do playbook para o(s) nome(s) de estado que a Apollo reconhece.
 */
const REGION_TO_APOLLO_LOCATIONS: Record<string, string[]> = {
    'Rio de Janeiro e Região': ['Rio de Janeiro, Brazil'],
    'São Paulo e Grande SP': ['São Paulo, Brazil'],
    'Sul (PR, SC, RS)': ['Paraná, Brazil', 'Santa Catarina, Brazil', 'Rio Grande do Sul, Brazil'],
    'Sudeste (MG, ES)': ['Minas Gerais, Brazil', 'Espírito Santo, Brazil'],
    'Nordeste': ['Bahia, Brazil', 'Pernambuco, Brazil', 'Ceará, Brazil', 'Maranhão, Brazil', 'Paraíba, Brazil', 'Rio Grande do Norte, Brazil', 'Alagoas, Brazil', 'Sergipe, Brazil', 'Piauí, Brazil'],
    'Centro-Oeste': ['Mato Grosso, Brazil', 'Mato Grosso do Sul, Brazil', 'Goiás, Brazil', 'Distrito Federal, Brazil'],
    'Norte': ['Amazonas, Brazil', 'Pará, Brazil', 'Acre, Brazil', 'Amapá, Brazil', 'Rondônia, Brazil', 'Roraima, Brazil', 'Tocantins, Brazil'],
    'Brasil (todas as regiões)': ['Brazil'],
};

/**
 * Resolve a localização para o formato que a Apollo Organization Search realmente reconhece.
 * Cidade+Estado e Estado sozinho (ex: "Niterói, Rio de Janeiro" / "Rio de Janeiro") já são
 * geografias válidas por si só — só a região ampla do playbook precisa do mapa acima.
 */
function resolveApolloLocations(criteria: ProspectCriteria): string[] {
    if (criteria.cidade && criteria.estado) return [`${criteria.cidade}, ${criteria.estado}`];
    if (criteria.estado) return [`${criteria.estado}, Brazil`];
    return REGION_TO_APOLLO_LOCATIONS[criteria.localizacao] || [criteria.localizacao];
}

/**
 * Só os segmentos que São de fato sinônimos em inglês do que a Apollo reconhece como keyword tag
 * viram um termo fixo — qualquer outro segmento (ex: "loja de roupa", "mercado", carro-chefe de um
 * nicho fora do ICP logístico padrão) usa o texto exatamente como a pessoa digitou. Antes, todo
 * segmento não mapeado caía silenciosamente em 'logistics', então buscar qualquer coisa fora da
 * lista fixa (mercado, loja de roupa, restaurante...) devolvia sempre transportadoras/operadores
 * logísticos em vez do que foi pedido.
 */
function mapSegmentToKeyword(segmento: string): string | null {
    const s = segmento.toLowerCase();
    if (s.includes('transportadora')) return 'trucking';
    if (s.includes('embarcador')) return 'logistics';
    if (s.includes('3pl') || s.includes('operador logístico')) return 'third party logistics';
    if (s.includes('facilities') || s.includes('rh')) return 'facilities services';
    return null;
}

/**
 * A Atlas atende Transportadoras e Operadores Logísticos (3PL/4PL) como ICP primário — empresas
 * cuja atividade É o transporte/logística (ver "ICP, Segmentos, Personas" no Playbook Comercial
 * AtlasGR). A busca por palavra-chave da Apollo é ampla e retorna falsos positivos (ex: "Vale"
 * mineradora, "Localiza" locadora, empresas de TI) que só citam logística tangencialmente.
 * Este allowlist filtra pelo campo `industry` real da Apollo — só aplicado para Transportadora/3PL,
 * porque Embarcadores (empresas que CONTRATAM transporte) legitimamente vêm de qualquer indústria
 * (alimentício, industrial, químico etc.) e não devem ser filtrados por este critério.
 */
const ICP_TRANSPORT_INDUSTRY_KEYWORDS = [
    'logistics', 'trucking', 'transportation', 'railroad', 'warehousing',
    'maritime', 'freight', 'supply chain', 'import', 'export', 'shipping', 'courier',
];

function isTransportOperatorSegment(segmento: string): boolean {
    const s = segmento.toLowerCase();
    return s.includes('transportadora') || s.includes('3pl') || s.includes('operador log');
}

function matchesIcpIndustry(industry: string | undefined): boolean {
    if (!industry) return true; // Apollo nem sempre preenche `industry` — não descartamos por ausência de dado.
    const i = industry.toLowerCase();
    return ICP_TRANSPORT_INDUSTRY_KEYWORDS.some((k) => i.includes(k));
}

/**
 * Busca real de empresas via Apollo.io (Organization Search API).
 * Opcional: só executa se APOLLO_API_KEY estiver configurada no ambiente.
 * Suporta os filtros firmográficos que a Apollo de fato reconhece nesse endpoint — validados
 * um a um contra a API real (confirmados pelo campo `breadcrumbs` do próprio response):
 * segmento/keywords, localização (cidade/estado/região, incl. exclusão), porte (faixa de
 * funcionários), faturamento estimado, nome da empresa e tecnologias (via UID, não nome livre).
 * IMPORTANTE: `founded_year_range` e `q_organization_technology_names` (nome livre) NÃO são
 * reconhecidos por este endpoint — a Apollo simplesmente os ignora sem erro. Ano de fundação é
 * por isso aplicado como pós-filtro local (ver abaixo), e tecnologia usa a lista de UIDs
 * confirmados em `icp-options.ts`.
 * Para os primeiros candidatos com domínio conhecido, também busca decisores reais
 * (Apollo People Search, com Hunter.io como fallback de e-mail) — ver enrichCandidatesWithDecisionMakers.
 */
export async function fetchApolloCandidates(
    criteria: ProspectCriteria,
    count: number
): Promise<{ candidates: ProspectCandidate[]; error?: string }> {
    const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
    if (!apiKey) return { candidates: [] };

    const extraKeywords = criteria.palavrasChave
        ? criteria.palavrasChave.split(',').map((k) => k.trim()).filter(Boolean)
        : [];

    const needsFoundedYearFilter = criteria.anoFundacaoMin != null || criteria.anoFundacaoMax != null;
    const needsIcpIndustryFilter = isTransportOperatorSegment(criteria.segmento);
    // Ano de fundação e o allowlist de indústria do ICP não são filtráveis pela API — pedimos mais
    // candidatos do que o necessário para sobrar o suficiente depois do pós-filtro local.
    const requestSize = Math.min(
        needsFoundedYearFilter || needsIcpIndustryFilter ? Math.max(count * 4, 50) : count,
        100
    );

    const mappedKeyword = mapSegmentToKeyword(criteria.segmento);
    const keywords = [mappedKeyword, ...extraKeywords].filter(Boolean) as string[];

    const body: Record<string, unknown> = {
        organization_locations: resolveApolloLocations(criteria),
        per_page: requestSize,
        page: 1,
    };

    if (keywords.length > 0) {
        body.q_organization_keyword_tags = keywords;
    }

    const orgName = criteria.nomeEmpresa || (!mappedKeyword && criteria.segmento !== 'Qualquer Segmento' ? criteria.segmento : undefined);
    if (orgName) {
        body.q_organization_name = orgName;
    }

    if (criteria.porte) {
        body.organization_num_employees_ranges = [criteria.porte];
    }
    if (criteria.faturamentoMin != null || criteria.faturamentoMax != null) {
        body.revenue_range = {
            ...(criteria.faturamentoMin != null ? { min: criteria.faturamentoMin } : {}),
            ...(criteria.faturamentoMax != null ? { max: criteria.faturamentoMax } : {}),
        };
    }
    if (criteria.tecnologias) {
        // Espera-se uma lista de UIDs confirmados (ex: "salesforce,aws") — ver TECNOLOGIA_OPTIONS.
        body.currently_using_any_of_technology_uids = criteria.tecnologias.split(',').map((t) => t.trim()).filter(Boolean);
    }
    if (criteria.tecnologiasExcluir) {
        body.currently_not_using_any_of_technology_uids = criteria.tecnologiasExcluir.split(',').map((t) => t.trim()).filter(Boolean);
    }
    if (criteria.localizacaoExcluir) {
        body.organization_not_locations = criteria.localizacaoExcluir
            .split(',')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => (l.toLowerCase().endsWith('brazil') ? l : `${l}, Brazil`));
    }
    if (criteria.apenasCapitalAberto) {
        body.organization_trading_status = ['public'];
    }

    try {
        const res = await fetchWithProviderRetry(APOLLO_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': apiKey,
            },
            body: JSON.stringify(body),
        }, { timeoutMs: 15_000, providerName: 'Apollo-OrganizationSearch', billable: true });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { candidates: [], error: `Apollo API respondeu ${res.status}: ${text.slice(0, 200)}` };
        }

        const data = (await res.json()) as ApolloSearchResponse;
        let organizations = data.organizations || [];

        if (needsFoundedYearFilter) {
            organizations = organizations.filter((org) => {
                if (org.founded_year == null) return false;
                if (criteria.anoFundacaoMin != null && org.founded_year < criteria.anoFundacaoMin) return false;
                if (criteria.anoFundacaoMax != null && org.founded_year > criteria.anoFundacaoMax) return false;
                return true;
            });
        }
        if (needsIcpIndustryFilter) {
            organizations = organizations.filter((org) => matchesIcpIndustry(org.industry));
        }
        organizations = organizations.slice(0, count);

        const candidates: ProspectCandidate[] = organizations.map((org) => ({
            tradeName: org.name || 'Empresa sem nome (Apollo)',
            legalNameGuess: null,
            cnpjGuess: null,
            segment: org.industry || criteria.segmento,
            size: org.estimated_num_employees ? `~${org.estimated_num_employees} funcionários` : 'Não informado',
            location: [org.city, org.state].filter(Boolean).join(', ') || buildLocationLabel(criteria),
            fitScoreEstimate: 70,
            suggestedContact: null,
            rationale: `Encontrado via Apollo.io (busca real de firmographic data)${org.primary_domain ? ` — domínio: ${org.primary_domain}` : ''}`,
            linkedinUrl: org.linkedin_url || null,
            phone: org.phone || org.primary_phone?.number || null,
            foundedYear: org.founded_year || null,
            annualRevenue: org.annual_revenue || null,
            technologies: org.technology_names?.slice(0, 6) || undefined,
            website: org.primary_domain ? `https://${org.primary_domain}` : org.website_url || null,
        }));

        // Busca decisores (LinkedIn, e-mail, telefone) já na descoberta para os primeiros
        // MAX_DECISION_MAKER_LOOKUPS candidatos com domínio conhecido — o vendedor não precisa
        // clicar em nada para ver os dados prontos na tela de resultados. Isso NUNCA deve derrubar
        // a busca principal: nem por erro (candidatos já vieram da Apollo com sucesso) nem por
        // demora (respeita um orçamento de tempo próprio, menor que o timeout do frontend).
        try {
            await Promise.race([
                enrichCandidatesWithDecisionMakers(candidates, organizations),
                new Promise<void>((resolve) => setTimeout(resolve, DECISION_MAKER_PREFETCH_BUDGET_MS)),
            ]);
        } catch (decisionMakerError) {
            // Log e segue — os candidatos (já obtidos com sucesso) continuam válidos sem decisores.
            logger.error({ err: decisionMakerError }, 'Falha ao pré-buscar decisores na descoberta');
        }
        for (const candidate of candidates) {
            if (candidate.decisionMakers?.length) {
                candidate.emails = validContactEmails(candidate.decisionMakers.map((dm) => dm.email));
            }
        }

        return { candidates };
    } catch (error) {
        return { candidates: [], error: error instanceof Error ? error.message : 'Falha ao consultar Apollo.io' };
    }
}
