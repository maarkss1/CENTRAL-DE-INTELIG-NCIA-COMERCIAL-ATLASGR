import { logger } from '../../../lib/logger';
import { prisma, withRlsContext } from '../../../lib/prisma.js';
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
import { ExclusionSet } from '../utils/exclusionSet.js';

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
    /** Página do ranking da Apollo (1-based, padrão 1). Usada pelo botão "Buscar mais resultados"
     * do frontend para trazer a próxima fatia do mesmo ranking em vez de repetir sempre o topo. */
    pagina?: number;
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

/** Monta a pesquisa nominal para Google Places/OpenStreetMap, combinando livremente nome, segmento, palavra-chave e localização. */
function buildPlacesQuery(criteria: ProspectCriteria): string {
    const companyOrPlace = criteria.nomeEmpresa?.trim();
    const segment = criteria.segmento?.trim();
    const location = buildLocationLabel(criteria)?.trim();
    const keywords = criteria.palavrasChave?.trim();

    // Se o usuário digitou uma busca direta por nome ou palavra-chave (ex: "Supermercado", "Academia"), usaremos isso diretamente
    const term = companyOrPlace || segment || keywords || 'Empresa';
    
    return [term, location ? `em ${location}` : null]
        .filter(Boolean)
        .join(' ');
}

/** Descoberta via Google Places (New) Text Search — empresas reais, sem IA generativa envolvida. */
async function discoverViaGooglePlaces(
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
async function fetchKnownExclusions(organizationId: string): Promise<ExclusionSet> {
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
 * Descoberta de candidatos: combina Apollo.io, Google Places e OpenStreetMap (Nominatim).
 * — nenhuma chamada a modelos generativos. Cada candidato ainda passa pelo pipeline de
 * enriquecimento real (Receita Federal + Google Places + Apollo People) antes de virar um Lead confiável.
 * `organizationId`, quando informado, exclui do resultado empresas já cadastradas no CRM do tenant
 * ou já rejeitadas (ver `fetchKnownExclusions`) — opcional só para não quebrar chamadas de teste
 * sem tenant. Quando `criteria.cidade` é informado, uma fatia da cota é sempre reservada pro
 * Google Places (precisão geográfica real), em vez de só entrar como fallback se a Apollo não
 * preencher a cota sozinha. `criteria.pagina` avança pro próximo lote do ranking da Apollo.
 */
export async function discoverCandidates(criteria: ProspectCriteria, organizationId?: string): Promise<DiscoverResult> {
    const total = Math.max(1, Math.min(100, criteria.quantidade || 10));
    const allCandidates: ProspectCandidate[] = [];
    const exclusions = organizationId ? await fetchKnownExclusions(organizationId) : new ExclusionSet();
    const providerMode = getProspectingProviderMode();

    function absorb(found: ProspectCandidate[]) {
        for (const candidate of found) {
            if (exclusions.has(candidate.tradeName, candidate.website)) continue;
            exclusions.add(candidate.tradeName, candidate.website);
            allCandidates.push(candidate);
        }
    }

    // Quando uma cidade específica é informada, reserva uma fatia da cota pro Google Places desde
    // o início — a Apollo filtra localização por cidade de forma mais grosseira que o Google Places
    // Text Search (que geocodifica de verdade), e a Apollo normalmente preenche a cota sozinha,
    // então sem essa reserva a variedade geográfica real dependia de a Apollo falhar, o que quase
    // nunca acontecia.
    const placesReserve = providerMode === 'hybrid' && criteria.cidade
        ? Math.min(total, Math.max(1, Math.round(total * 0.3)))
        : 0;
    const apolloTarget = total - placesReserve;

    let apolloError: string | undefined;
    if (providerMode === 'hybrid' && apolloTarget > 0) {
        const apollo = await fetchApolloCandidates(criteria, apolloTarget, exclusions);
        absorb(apollo.candidates);
        apolloError = apollo.error;
    }

    if (placesReserve > 0) {
        absorb(await discoverViaGooglePlaces(criteria, placesReserve, exclusions));
    }

    // Preenche o que faltou (Apollo desabilitada/insuficiente, ou reserva de Places não bastou)
    // com mais Google Places e, por fim, Nominatim como último recurso sem chave paga.
    const remaining = total - allCandidates.length;
    if (providerMode === 'hybrid' && remaining > 0) {
        absorb(await discoverViaGooglePlaces(criteria, remaining, exclusions));
    }

    const remainingAfterPlaces = total - allCandidates.length;
    if (remainingAfterPlaces > 0) {
        absorb(await discoverViaNominatim(criteria, remainingAfterPlaces, exclusions));
    }

    return {
        candidates: allCandidates,
        sources: [
            {
                title: 'OpenStreetMap Nominatim',
                uri: 'https://nominatim.openstreetmap.org/',
            },
        ],
        apolloError: providerMode === 'hybrid' ? apolloError : undefined,
        providerMode,
    };
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

