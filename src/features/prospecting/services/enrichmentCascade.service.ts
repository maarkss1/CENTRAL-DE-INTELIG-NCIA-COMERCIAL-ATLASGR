import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { enrichOrganizationWithContacts, enrichOrganizationByDomain } from './apollo.service.js';
import { findEmailViaHunter, findPeopleViaDomainSearch } from './hunter.service.js';
import { searchGooglePlace } from './places.service.js';
import { fetchCnpjData } from './enrichment/cnpjLookup.js';
import { extractDomainFromWebsite, guessDomainAndEmails } from './enrichment/domainGuess.js';
import { filterNewContacts } from '../utils/contactDedupe.js';

export interface CascadeEnrichmentOptions {
    cnpj?: string;
    domain?: string;
    companyName?: string;
    city?: string;
    state?: string;
    force?: boolean;
}

export interface CascadeEnrichmentResult {
    companyId: string;
    companyName: string;
    cnpj?: string | null;
    website?: string | null;
    domain?: string | null;
    apolloEnriched: boolean;
    hunterEnriched: boolean;
    googlePlacesEnriched: boolean;
    contactsAdded: number;
    phone?: string | null;
    googleRating?: number | null;
}

/**
 * Orquestrador de Enriquecimento em Cascata:
 * 1. Passo 1 (Apollo): Firmographics + Decisores/E-mails profissionais.
 * 2. Passo 2 (Hunter.io): Fallback para e-mails e contatos não cobertos pela Apollo.
 * 3. Passo 3 (Google Places): Fallback para telefone comercial, endereço, avaliação e mapa.
 */
export async function runEnrichmentCascade(
    organizationId: string,
    companyId: string,
    options: CascadeEnrichmentOptions = {}
): Promise<CascadeEnrichmentResult> {
    const startedAt = Date.now();
    logger.info({ organizationId, companyId, options }, 'Iniciando enriquecimento em cascata (Apollo -> Hunter -> Google Places)');

    const company = await prisma.company.findFirst({
        where: { id: companyId, organizationId, deletedAt: null },
        include: { contacts: { where: { deletedAt: null } } },
    });

    if (!company) {
        throw new AppError('Empresa não encontrada para enriquecimento.', 404);
    }

    let cnpj = options.cnpj || company.cnpj || undefined;
    let companyName = options.companyName || company.tradeName || company.legalName || 'Empresa';
    let website = company.website || undefined;
    let city = options.city || company.city || undefined;
    let state = options.state || company.state || undefined;
    let domain = options.domain || (website ? extractDomainFromWebsite(website) : undefined);

    let apolloEnriched = false;
    let hunterEnriched = false;
    let googlePlacesEnriched = false;
    const collectedContacts: Array<{
        name: string;
        title: string | null;
        email: string | null;
        phone: string | null;
        linkedinUrl: string | null;
        source: string;
        seniority?: string;
    }> = [];

    // Se tiver CNPJ mas faltarem dados cadastrais, puxa BrasilAPI/Receita Federal
    if (cnpj && (!company.legalName || !city || !state)) {
        try {
            const cnpjData = await fetchCnpjData(cnpj);
            if (cnpjData && cnpjData.found && cnpjData.data) {
                companyName = cnpjData.data.tradeName || cnpjData.data.legalName || companyName;
                city = city || cnpjData.data.city || undefined;
                state = state || cnpjData.data.state || undefined;
                if (!domain) {
                    const guessed = await guessDomainAndEmails(cnpjData.data.tradeName || cnpjData.data.legalName);
                    domain = guessed.domain || undefined;
                }
            }
        } catch (err) {
            logger.warn({ err, cnpj }, 'Aviso ao buscar dados cadastrais de CNPJ na cascata');
        }
    }

    // ────────────────────────── PASSO 1: APOLLO ──────────────────────────
    if (domain || companyName) {
        try {
            const targetDomain = domain || extractDomainFromWebsite(website) || '';
            if (targetDomain) {
                const orgRes = await enrichOrganizationByDomain(targetDomain);
                const org = orgRes.organization;
                if (org) {
                    apolloEnriched = true;
                    website = website || org.website_url || undefined;
                    if (org.website_url && !domain) {
                        domain = extractDomainFromWebsite(org.website_url) || undefined;
                    }

                    // Atualiza campos firmográficos Apollo
                    await prisma.company.update({
                        where: { id: companyId },
                        data: {
                            website: website || company.website,
                            logoUrl: org.logo_url || company.logoUrl,
                            technologies: org.technology_names || company.technologies,
                            keywords: org.keywords || company.keywords,
                            apolloOrgId: org.id || company.apolloOrgId,
                            enrichmentStatus: 'Enriquecendo',
                        },
                    });
                }

                // Coleta decisores retornados pela Apollo
                const contactsRes = await enrichOrganizationWithContacts(targetDomain);
                for (const person of contactsRes.contacts || []) {
                    if (person.name) {
                        collectedContacts.push({
                            name: person.name,
                            title: person.title || null,
                            email: person.email || null,
                            phone: person.phone || null,
                            linkedinUrl: person.linkedin_url || null,
                            source: 'Apollo',
                            seniority: undefined,
                        });
                    }
                }
            }
        } catch (err) {
            logger.warn({ err, companyId, domain }, 'Falha no passo 1 da cascata (Apollo) — prosseguindo para Hunter.io');
        }
    }

    // ────────────────────────── PASSO 2: HUNTER.IO ──────────────────────────
    // Se faltarem contatos ou existirem contatos sem e-mail, aciona Hunter.io
    if (domain) {
        try {
            // Caso 1: Encontrar e-mail para contatos que a Apollo achou sem e-mail
            for (const contact of collectedContacts) {
                if (!contact.email && contact.name) {
                    const hunterEmail = await findEmailViaHunter(domain, contact.name);
                    if (hunterEmail.email) {
                        contact.email = hunterEmail.email;
                        contact.source = 'Apollo+Hunter';
                        hunterEnriched = true;
                    }
                }
            }

            // Caso 2: Se ainda tivermos menos de 2 contatos, busca pessoas pelo domínio no Hunter
            if (collectedContacts.length < 2) {
                const domainPeople = await findPeopleViaDomainSearch(domain, 5);
                if (domainPeople.contacts && domainPeople.contacts.length > 0) {
                    hunterEnriched = true;
                    for (const p of domainPeople.contacts) {
                        collectedContacts.push({
                            name: p.name,
                            title: p.title || null,
                            email: p.email || null,
                            phone: p.phone || null,
                            linkedinUrl: p.linkedin_url || null,
                            source: 'Hunter',
                        });
                    }
                }
            }
        } catch (err) {
            logger.warn({ err, companyId, domain }, 'Falha no passo 2 da cascata (Hunter.io) — prosseguindo para Google Places');
        }
    }

    // ────────────────────────── PASSO 3: GOOGLE PLACES ──────────────────────────
    // Se a empresa ainda não tiver telefone, endereço detalhado ou avaliação do Google Maps
    let placePhone: string | undefined = undefined;
    let placeRating: number | undefined = undefined;

    if (!company.phones?.length || !company.googleRating) {
        try {
            const locStr = [city, state].filter(Boolean).join(', ') || 'Brasil';
            const place = await searchGooglePlace(companyName, locStr);
            if (place) {
                googlePlacesEnriched = true;
                placePhone = place.nationalPhoneNumber || undefined;
                placeRating = place.rating || undefined;

                await prisma.company.update({
                    where: { id: companyId },
                    data: {
                        googleRating: place.rating ?? company.googleRating,
                        googleReviewsCount: place.userRatingCount ?? company.googleReviewsCount,
                        businessHours: (place.businessHours as any) ?? company.businessHours,
                        address: company.address || place.formattedAddress || undefined,
                        phones: placePhone && !company.phones.includes(placePhone)
                            ? [...company.phones, placePhone]
                            : company.phones,
                    },
                });
            }
        } catch (err) {
            logger.warn({ err, companyId, companyName }, 'Falha no passo 3 da cascata (Google Places)');
        }
    }

    // ────────────────────────── PERSISTÊNCIA DE CONTATOS ──────────────────────────
    // Deduplica e insere contatos novos na base do tenant
    let contactsAdded = 0;
    if (collectedContacts.length > 0) {
        const existingContacts = company.contacts.map((c) => ({
            name: c.name,
            email: c.email || undefined,
            phone: c.phone || undefined,
        }));

        const newContacts = filterNewContacts(collectedContacts, existingContacts);
        for (const nc of newContacts) {
            await prisma.contact.create({
                data: {
                    companyId,
                    organizationId,
                    name: nc.name,
                    role: nc.title,
                    email: nc.email,
                    phone: nc.phone,
                    whatsapp: nc.phone,
                    linkedin: nc.linkedinUrl,
                    source: nc.source,
                    seniority: nc.seniority,
                },
            });
            contactsAdded++;
        }
    }

    // Finaliza status da Company e grava log de auditoria
    await prisma.company.update({
        where: { id: companyId },
        data: {
            enrichmentStatus: 'Enriquecido',
            enrichmentSource: 'Cascade:Apollo->Hunter->GooglePlaces',
            enrichedAt: new Date(),
        },
    });

    await prisma.enrichmentLog.create({
        data: {
            companyId,
            source: 'Cascade:Apollo->Hunter->GooglePlaces',
            field: 'firmographics-contacts-places',
            status: 'success',
            dataOrigin: 'confirmado',
            rawData: {
                apolloEnriched,
                hunterEnriched,
                googlePlacesEnriched,
                contactsAdded,
                durationMs: Date.now() - startedAt,
            },
        },
    });

    logger.info({
        companyId,
        apolloEnriched,
        hunterEnriched,
        googlePlacesEnriched,
        contactsAdded,
        durationMs: Date.now() - startedAt,
    }, 'Enriquecimento em cascata finalizado com sucesso');

    return {
        companyId,
        companyName,
        cnpj,
        website,
        domain,
        apolloEnriched,
        hunterEnriched,
        googlePlacesEnriched,
        contactsAdded,
        phone: placePhone,
        googleRating: placeRating,
    };
}
