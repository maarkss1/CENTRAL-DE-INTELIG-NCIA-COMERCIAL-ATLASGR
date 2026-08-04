import { logger } from '../../../lib/logger';
import { prisma } from '../../../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { isValidCnpj, sanitizeCnpj } from './cnpj.util';
import { enrichCompany } from './enrichment.service';
import { fetchApolloCandidates, searchDecisionMakersAdvanced } from './apollo.service';
import type { DecisionMakerCriteria } from './apollo.service';
import { searchGooglePlacesCandidates } from './places.service';
import { searchNominatimCandidates } from './nominatim.service';
import { toPrismaLeadStatus, fromPrismaLeadStatus, fromPrismaCompanyStatus } from '../../../lib/enumMap';
import { getProspectingProviderMode } from '../../../config/prospecting-integrations.js';
import { pushLeadToBitrix } from '../../integrations/bitrix/bitrix.service.js';

export interface ProspectCriteria {
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
}

export interface DiscoverResult {
    candidates: ProspectCandidate[];
    sources: Array<{ title: string; uri: string }>;
    apolloError?: string;
    providerMode: 'free' | 'hybrid';
}

/** Monta a localização mais precisa disponível: cidade + estado > estado > região ampla do playbook. */
export function buildLocationLabel(criteria: ProspectCriteria): string {
    if (criteria.cidade && criteria.estado) return `${criteria.cidade}, ${criteria.estado}`;
    if (criteria.estado) return criteria.estado;
    return criteria.localizacao;
}

/** Monta a pesquisa nominal do Google Places/OpenStreetMap, preservando segmento e localização. */
function buildPlacesQuery(criteria: ProspectCriteria): string {
    const companyOrPlace = criteria.nomeEmpresa?.trim();
    const segment = criteria.segmento.split('(')[0].trim();
    const location = buildLocationLabel(criteria);
    return [companyOrPlace, companyOrPlace ? segment : null, location ? `em ${location}` : null]
        .filter(Boolean)
        .join(' ');
}

/** Descoberta via Google Places (New) Text Search — empresas reais, sem IA generativa envolvida. */
async function discoverViaGooglePlaces(
    criteria: ProspectCriteria,
    count: number,
    excludeNames: Set<string>
): Promise<ProspectCandidate[]> {
    const query = buildPlacesQuery(criteria);
    const places = await searchGooglePlacesCandidates(query, count + excludeNames.size);

    return places
        .filter((p) => !excludeNames.has(p.tradeName.trim().toLowerCase()))
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
        }));
}

/** Descoberta via OpenStreetMap (Nominatim) — alternativa livre para dados geográficos. */
async function discoverViaNominatim(
    criteria: ProspectCriteria,
    count: number,
    excludeNames: Set<string>
): Promise<ProspectCandidate[]> {
    const query = buildPlacesQuery(criteria);
    const places = await searchNominatimCandidates(query, count + excludeNames.size);

    return places
        .filter((p) => !excludeNames.has(p.tradeName.trim().toLowerCase()))
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
 * Descoberta de candidatos: combina Apollo.io, Google Places e OpenStreetMap (Nominatim).
 * — nenhuma chamada a modelos generativos. Cada candidato ainda passa pelo pipeline de
 * enriquecimento real (Receita Federal + Google Places + Apollo People) antes de virar um Lead confiável.
 */
export async function discoverCandidates(criteria: ProspectCriteria): Promise<DiscoverResult> {
    const total = Math.max(1, Math.min(100, criteria.quantidade || 10));
    const allCandidates: ProspectCandidate[] = [];
    const seenNames = new Set<string>();
    const providerMode = getProspectingProviderMode();

    const apollo = providerMode === 'hybrid'
        ? await fetchApolloCandidates(criteria, total)
        : { candidates: [], error: undefined };
    for (const candidate of apollo.candidates) {
        const key = candidate.tradeName.trim().toLowerCase();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        allCandidates.push(candidate);
    }

    const remaining = total - allCandidates.length;
    if (providerMode === 'hybrid' && remaining > 0) {
        const placesCandidates = await discoverViaGooglePlaces(criteria, remaining, seenNames);
        for (const candidate of placesCandidates) {
            const key = candidate.tradeName.trim().toLowerCase();
            if (seenNames.has(key)) continue;
            seenNames.add(key);
            allCandidates.push(candidate);
        }
    }

    const remainingAfterPlaces = total - allCandidates.length;
    if (remainingAfterPlaces > 0) {
        const nominatimCandidates = await discoverViaNominatim(criteria, remainingAfterPlaces, seenNames);
        for (const candidate of nominatimCandidates) {
            const key = candidate.tradeName.trim().toLowerCase();
            if (seenNames.has(key)) continue;
            seenNames.add(key);
            allCandidates.push(candidate);
        }
    }

    return {
        candidates: allCandidates,
        sources: [
            {
                title: 'OpenStreetMap Nominatim',
                uri: 'https://nominatim.openstreetmap.org/',
            },
        ],
        apolloError: providerMode === 'hybrid' ? apollo.error : undefined,
        providerMode,
    };
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
 */
async function findExistingCompany(input: PromoteInput) {
    try {
        const cnpj = input.cnpj && isValidCnpj(input.cnpj) ? sanitizeCnpj(input.cnpj) : null;
        if (cnpj) {
            // CNPJs de Company nem sempre chegam ao banco no mesmo formato (alguns fluxos
            // gravam só dígitos, outros com pontuação) — normaliza no próprio Postgres via
            // regexp_replace em vez de carregar todas as empresas do tenant para comparar em
            // memória, o que não escalaria com a base de clientes.
            const [found] = await prisma.$queryRaw<{ id: string }[]>`
                SELECT id FROM "Company"
                WHERE "organizationId" = ${input.organizationId}
                  AND cnpj IS NOT NULL
                  AND regexp_replace(cnpj, '\D', '', 'g') = ${cnpj}
                LIMIT 1
            `;
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
                status: { notIn: ['Fechado_Ganho', 'Fechado_Perdido'] },
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
        contact = await prisma.contact.create({
            data: {
                name: input.contact.name,
                role: input.contact.role,
                companyId: company.id,
                status: 'Ativo',
                observations: 'Contato sugerido — confirmar identidade e dados antes da abordagem.',
                organizationId: input.organizationId,
            },
        });
    }

    let enrichmentResult: Awaited<ReturnType<typeof enrichCompany>> | null = null;
    if (input.autoEnrich !== false) {
        try {
            enrichmentResult = await enrichCompany(company.id, {
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
            status: toPrismaLeadStatus('Novo Lead') as unknown as Prisma.LeadCreateInput['status'],
            source: input.source,
            channel: 'Prospecção',
            temperature: fit?.temperature || 'Morno',
            score: fit?.score ?? null,
            companyId: finalCompany.id,
            contactId: contact?.id,
            organizationId: input.organizationId,
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
