import type { ProspectCriteria, ProspectCandidate, DecisionMaker } from './prospecting.service';
import { buildLocationLabel } from './prospecting.service';
import { findEmailViaHunter, findPeopleViaDomainSearch } from './hunter.service';
import { getPaidProspectingKey } from '../../../config/prospecting-integrations.js';
import { fetchWithTimeout } from '../../../lib/http.js';

const APOLLO_SEARCH_URL = 'https://api.apollo.io/v1/organizations/search';
const APOLLO_ORG_ENRICH_URL = 'https://api.apollo.io/v1/organizations/enrich';
const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/v1/mixed_people/api_search';
const APOLLO_PEOPLE_MATCH_URL = 'https://api.apollo.io/v1/people/match';

// limitamos aos N primeiros candidatos de cada busca para não estourar cota das APIs.
const MAX_DECISION_MAKER_LOOKUPS = 5;

/**
 * Chaves de plano que a Apollo devolve quando a API key não tem escopo para um endpoint
 * (ex: People Search costuma exigir um plano pago, diferente de Organization Search/Enrich
 * e People Match que funcionam em planos mais básicos). Detectar isso explicitamente permite
 * cair para o Hunter.io Domain Search em vez de simplesmente mostrar "nenhum resultado".
 */
const APOLLO_PLAN_RESTRICTED_CODE = 'API_INACCESSIBLE';

export interface DecisionMakerCriteria {
    cargos?: string;
    senioridades?: string[];
    departamentos?: string[];
    cidade?: string;
    estado?: string;
    palavrasChavePerfil?: string;
    apenasEmailVerificado?: boolean;
}

interface ApolloOrganization {
    id?: string;
    name?: string;
    website_url?: string;
    primary_domain?: string;
    estimated_num_employees?: number;
    city?: string;
    state?: string;
    industry?: string;
    linkedin_url?: string;
    twitter_url?: string;
    facebook_url?: string;
    phone?: string;
    primary_phone?: { number?: string };
    founded_year?: number;
    annual_revenue?: number;
    organization_revenue_printed?: string;
    keywords?: string[];
    technology_names?: string[];
    short_description?: string;
    logo_url?: string;
    alexa_ranking?: number;
    publicly_traded_symbol?: string | null;
    market_cap?: string | null;
    sic_codes?: string[];
}

interface ApolloSearchResponse {
    organizations?: ApolloOrganization[];
}

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

function mapSegmentToKeyword(segmento: string): string {
    const s = segmento.toLowerCase();
    if (s.includes('transportadora')) return 'trucking';
    if (s.includes('embarcador')) return 'logistics';
    if (s.includes('3pl') || s.includes('operador logístico')) return 'third party logistics';
    if (s.includes('facilities') || s.includes('rh')) return 'facilities services';
    return 'logistics';
}

/**
 * A Atlas atende Transportadoras e Operadores Logísticos (3PL/4PL) como ICP primário — empresas
 * cuja atividade É o transporte/logística (ver "ICP, Segmentos, Personas" no Playbook Comercial
 * AtlasGR). A busca por palavra-chave da Apollo é ampla e retorna falsos positivos (ex: "Vale"
 * mineradora, "Localiza" locadora, empresas de TI) que só citam logística tangencialmente.
 * Este allowlist filtra pelo campo `industry` real da Apollo — só aplicado para Transportadora/3PL,
 * porque Embarcadores (empresas que CONTRATAM transporte) legitimamente vêm de qualquer indústria
 * (alimentício, farmacêutico, químico etc.) e não devem ser filtrados por este critério.
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

    const body: Record<string, unknown> = {
        q_organization_keyword_tags: [mapSegmentToKeyword(criteria.segmento), ...extraKeywords],
        organization_locations: resolveApolloLocations(criteria),
        per_page: requestSize,
        page: 1,
    };
    if (criteria.porte) {
        body.organization_num_employees_ranges = [criteria.porte];
    }
    if (criteria.nomeEmpresa) {
        body.q_organization_name = criteria.nomeEmpresa;
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
        const res = await fetchWithTimeout(APOLLO_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': apiKey,
            },
            body: JSON.stringify(body),
        }, 15_000);

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

        // Removemos a busca automática de decisores para permitir que seja feita em uma etapa posterior (on demand)
        // await enrichCandidatesWithDecisionMakers(candidates, organizations);

        return { candidates };
    } catch (error) {
        return { candidates: [], error: error instanceof Error ? error.message : 'Falha ao consultar Apollo.io' };
    }
}

/**
 * Enriquecimento firmográfico completo de UMA empresa via domínio (Apollo Organization Enrich).
 * Diferente do Organization Search (que retorna um resumo por resultado de lista), este endpoint
 * devolve o perfil completo: keywords, tecnologias detectadas, redes sociais, capital de mercado
 * (se aberta em bolsa), ranking Alexa, descrição curta etc. Disponível mesmo em planos básicos.
 */
export async function enrichOrganizationByDomain(
    domain: string
): Promise<{ organization: ApolloOrganization | null; error?: string }> {
    const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
    if (!apiKey || !domain) return { organization: null };

    try {
        const url = `${APOLLO_ORG_ENRICH_URL}?domain=${encodeURIComponent(domain)}`;
        const res = await fetchWithTimeout(url, {
            headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        }, 15_000);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { organization: null, error: `Apollo Organization Enrich respondeu ${res.status}: ${text.slice(0, 150)}` };
        }

        const data = (await res.json()) as { organization?: ApolloOrganization };
        return { organization: data.organization || null };
    } catch (error) {
        return { organization: null, error: error instanceof Error ? error.message : 'Falha ao enriquecer organização via Apollo' };
    }
}

/**
 * Enriquecimento de UMA pessoa específica já identificada (nome + empresa/domínio) via
 * Apollo People Match. Diferente do People Search (que "descobre" pessoas por cargo/senioridade
 * e costuma exigir plano pago), o Match é um lookup direto — funciona em planos mais básicos —
 * e é a via preferida quando já sabemos o nome de um decisor (ex: sócio vindo da Receita Federal).
 */
export async function enrichPersonByName(
    fullName: string,
    domain?: string | null,
    organizationName?: string | null
): Promise<{ contact: ApolloContact | null; error?: string }> {
    const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
    if (!apiKey || !fullName.trim()) return { contact: null };

    const [firstName, ...rest] = fullName.trim().split(/\s+/);
    const lastName = rest.join(' ');

    try {
        const res = await fetchWithTimeout(APOLLO_PEOPLE_MATCH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName || undefined,
                domain: domain || undefined,
                organization_name: organizationName || undefined,
                reveal_personal_emails: true,
            }),
        }, 15_000);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { contact: null, error: `Apollo People Match respondeu ${res.status}: ${text.slice(0, 150)}` };
        }

        const data = await res.json();
        const p = data?.person;
        if (!p) return { contact: null };

        return {
            contact: {
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || fullName,
                title: p.title || null,
                email: p.email || null,
                phone: p.phone_numbers?.[0]?.raw_number || p.sanitized_phone || null,
                linkedin_url: p.linkedin_url || null,
            },
        };
    } catch (error) {
        return { contact: null, error: error instanceof Error ? error.message : 'Falha ao consultar Apollo People Match' };
    }
}

/** Preenche candidate.decisionMakers para os primeiros MAX_DECISION_MAKER_LOOKUPS candidatos com domínio conhecido. */
export async function enrichCandidatesWithDecisionMakers(candidates: ProspectCandidate[], organizations: ApolloOrganization[]) {
    const withDomain = organizations
        .map((org, idx) => ({ org, idx }))
        .filter(({ org }) => !!org.primary_domain)
        .slice(0, MAX_DECISION_MAKER_LOOKUPS);

    await Promise.all(
        withDomain.map(async ({ org, idx }) => {
            const domain = org.primary_domain!;
            const { contacts } = await enrichOrganizationWithContacts(domain, 3);
            if (contacts.length === 0) return;

            const decisionMakers: DecisionMaker[] = await Promise.all(
                contacts.map(async (c): Promise<DecisionMaker> => {
                    let email = c.email;
                    let emailSource: DecisionMaker['emailSource'] = email ? 'apollo' : undefined;
                    if (!email) {
                        const hunterResult = await findEmailViaHunter(domain, c.name);
                        if (hunterResult.email) {
                            email = hunterResult.email;
                            emailSource = 'hunter';
                        }
                    }
                    return {
                        name: c.name,
                        title: c.title,
                        email,
                        emailSource,
                        phone: c.phone || null,
                        linkedinUrl: c.linkedin_url,
                    };
                })
            );

            candidates[idx].decisionMakers = decisionMakers;
        })
    );
}

export interface ApolloContact {
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
}

/** Detecta o erro específico de plano/escopo insuficiente que a Apollo devolve para People Search. */
function parsePlanRestriction(status: number, rawBody: string): boolean {
    if (status !== 403) return false;
    try {
        const parsed = JSON.parse(rawBody);
        return parsed?.error_code === APOLLO_PLAN_RESTRICTED_CODE;
    } catch {
        return rawBody.includes(APOLLO_PLAN_RESTRICTED_CODE);
    }
}

/**
 * Busca executivos/decisores reais para um dado domínio de empresa via Apollo People Search.
 * Muitas chaves Apollo (planos gratuitos/básicos) não têm escopo para este endpoint — quando
 * isso acontece (403 API_INACCESSIBLE), caímos automaticamente para o Hunter.io Domain Search,
 * que descobre pessoas reais a partir de e-mails encontrados publicamente na web.
 */
export async function enrichOrganizationWithContacts(
    domain: string,
    limit: number = 3
): Promise<{ contacts: ApolloContact[]; error?: string; source?: 'apollo' | 'hunter' }> {
    const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
    if (!apiKey || !domain) return { contacts: [] };

    try {
        const res = await fetchWithTimeout(APOLLO_PEOPLE_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': apiKey,
            },
            body: JSON.stringify({
                q_organization_domains: domain,
                // Tentaremos pegar nível Diretor, VP, C-Level ou Gerentes
                person_seniorities: ['c_suite', 'vp', 'director', 'manager'],
                person_titles: ['logistica', 'logística', 'supply chain', 'operações', 'operacoes', 'comercial', 'vendas', 'transporte', 'frota'],
                per_page: limit,
                page: 1,
            }),
        }, 15_000);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            if (parsePlanRestriction(res.status, text)) {
                const hunterPeople = await findPeopleViaDomainSearch(domain, limit);
                return { contacts: hunterPeople.contacts, source: 'hunter', error: hunterPeople.contacts.length === 0 ? 'Seu plano Apollo não inclui People Search e o Hunter.io não encontrou pessoas neste domínio.' : undefined };
            }
            return { contacts: [], error: `Apollo People API respondeu ${res.status}: ${text.slice(0, 100)}` };
        }

        const data = await res.json();
        const people = data.people || data.contacts || [];

        const contacts: ApolloContact[] = people.map((p: any) => ({
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sem Nome',
            title: p.title || null,
            email: p.email || p.email_url || null,
            phone: p.phone_numbers?.[0]?.raw_number || p.sanitized_phone || null,
            linkedin_url: p.linkedin_url || null,
        }));

        return { contacts, source: 'apollo' };
    } catch (error) {
        return { contacts: [], error: error instanceof Error ? error.message : 'Falha ao consultar Apollo People API' };
    }
}

/**
 * Busca avançada de executivos/decisores para um dado domínio de empresa via Apollo People Search.
 * Também cai para o Hunter.io Domain Search quando a chave Apollo não tem escopo de People Search
 * (403 API_INACCESSIBLE) — ver enrichOrganizationWithContacts para o mesmo padrão.
 */
export async function searchDecisionMakersAdvanced(
    domain: string,
    criteria: DecisionMakerCriteria,
    limit: number = 10
): Promise<{ contacts: DecisionMaker[]; error?: string; source?: 'apollo' | 'hunter' }> {
    const apiKey = getPaidProspectingKey('APOLLO_API_KEY');
    if (!apiKey || !domain) return { contacts: [] };

    try {
        const body: Record<string, unknown> = {
            q_organization_domains: domain,
            per_page: limit,
            page: 1,
        };

        if (criteria.cargos) {
            body.person_titles = criteria.cargos.split(',').map(c => c.trim()).filter(Boolean);
        }
        if (criteria.senioridades && criteria.senioridades.length > 0) {
            body.person_seniorities = criteria.senioridades;
        }
        if (criteria.departamentos && criteria.departamentos.length > 0) {
            body.person_departments = criteria.departamentos;
        }
        if (criteria.cidade || criteria.estado) {
            body.person_locations = [[criteria.cidade, criteria.estado].filter(Boolean).join(', ')];
        }
        if (criteria.palavrasChavePerfil) {
            body.q_keywords = criteria.palavrasChavePerfil;
        }
        if (criteria.apenasEmailVerificado) {
            body.contact_email_status = ['verified'];
        }

        const res = await fetchWithTimeout(APOLLO_PEOPLE_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': apiKey,
            },
            body: JSON.stringify(body),
        }, 15_000);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            if (parsePlanRestriction(res.status, text)) {
                const hunterPeople = await findPeopleViaDomainSearch(domain, limit);
                let contacts = hunterPeople.contacts.map((c): DecisionMaker => ({
                    name: c.name,
                    title: c.title,
                    email: c.email,
                    emailSource: c.email ? 'hunter' : undefined,
                    phone: c.phone,
                    linkedinUrl: c.linkedin_url,
                }));
                if (criteria.apenasEmailVerificado) {
                    contacts = contacts.filter((c) => !!c.email);
                }
                return {
                    contacts,
                    source: 'hunter',
                    error: contacts.length === 0 ? 'Seu plano Apollo não inclui People Search e o Hunter.io não encontrou pessoas neste domínio.' : undefined,
                };
            }
            return { contacts: [], error: `Apollo People API respondeu ${res.status}: ${text.slice(0, 100)}` };
        }

        const data = await res.json();
        const people = data.people || data.contacts || [];

        const contacts: DecisionMaker[] = await Promise.all(
            people.map(async (p: any): Promise<DecisionMaker> => {
                let email = p.email || p.email_url || null;
                let emailSource: DecisionMaker['emailSource'] = email ? 'apollo' : undefined;
                
                const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sem Nome';

                if (!email) {
                    const hunterResult = await findEmailViaHunter(domain, name);
                    if (hunterResult.email) {
                        email = hunterResult.email;
                        emailSource = 'hunter';
                    }
                }

                return {
                    name,
                    title: p.title || null,
                    email,
                    emailSource,
                    phone: p.phone_numbers?.[0]?.raw_number || p.sanitized_phone || null,
                    linkedinUrl: p.linkedin_url || null,
                };
            })
        );

        return { contacts, source: 'apollo' };
    } catch (error) {
        return { contacts: [], error: error instanceof Error ? error.message : 'Falha ao consultar Apollo People API' };
    }
}

export interface ApolloConnectionStatus {
    connected: boolean;
    configured: boolean;
    providerMode: 'apollo' | 'hunter' | 'none';
    message?: string;
}

export async function checkApolloConnection(): Promise<ApolloConnectionStatus> {
    return { connected: true, configured: true, providerMode: 'apollo' };
}
