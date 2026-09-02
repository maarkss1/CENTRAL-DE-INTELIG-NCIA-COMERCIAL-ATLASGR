import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { enrichOrganizationWithContacts, enrichOrganizationByDomain } from './apollo.service.js';
import { findEmailViaHunter, findPeopleViaDomainSearch } from './hunter.service.js';
import { searchGooglePlaceDetailed } from './places.service.js';
import { fetchCnpjData } from './enrichment/cnpjLookup.js';
import {
  extractDomainFromWebsite,
  guessDomainAndEmails,
  resolveEmailStatus,
} from './enrichment/domainGuess.js';
import { filterNewContacts } from '../utils/contactDedupe.js';

export interface CascadeEnrichmentOptions {
  cnpj?: string;
  domain?: string;
  companyName?: string;
  city?: string;
  state?: string;
  force?: boolean;
}

export interface CascadeStepErrors {
  apollo?: string;
  hunter?: string;
  googlePlaces?: string;
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
  /**
   * Onda 2 (05): sem isto, um provider fora do ar (Apollo/Hunter/Google Places todos com erro
   * real — chave revogada, upstream fora do ar, etc.) devolvia exatamente o mesmo formato que
   * "rodamos tudo e não achamos nada novo": todo `*Enriched` em `false`, `contactsAdded: 0`,
   * `success: true` na resposta HTTP. `errors` carrega a causa real de cada passo que falhou (não
   * preenchido quando o passo simplesmente não achou dado, ou nem rodou por falta de pré-requisito
   * como domínio/CNPJ) — o chamador consegue então distinguir "sem novidade" de "provider quebrado".
   */
  errors: CascadeStepErrors;
  /** 'enriched': pelo menos um passo trouxe dado novo. 'failed': nenhum passo trouxe dado E pelo
   * menos um provider retornou erro real (não apenas "não encontrado"). 'no_new_data': todos os
   * passos que rodaram responderam normalmente, só que sem nada novo para esta empresa. */
  status: 'enriched' | 'failed' | 'no_new_data';
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
  options: CascadeEnrichmentOptions = {},
): Promise<CascadeEnrichmentResult> {
  const startedAt = Date.now();
  logger.info(
    { organizationId, companyId, options },
    'Iniciando enriquecimento em cascata (Apollo -> Hunter -> Google Places)',
  );

  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId, deletedAt: null },
    include: { contacts: { where: { deletedAt: null } } },
  });

  if (!company) {
    throw new AppError('Empresa não encontrada para enriquecimento.', 404);
  }

  const cnpj = options.cnpj || company.cnpj || undefined;
  let companyName = options.companyName || company.tradeName || company.legalName || 'Empresa';
  let website = company.website || undefined;
  let city = options.city || company.city || undefined;
  let state = options.state || company.state || undefined;
  let domain = options.domain || (website ? extractDomainFromWebsite(website) : undefined);

  let apolloEnriched = false;
  let hunterEnriched = false;
  let googlePlacesEnriched = false;
  let apolloError: string | undefined;
  let hunterError: string | undefined;
  let googlePlacesError: string | undefined;
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
          const guessed = await guessDomainAndEmails(
            cnpjData.data.tradeName || cnpjData.data.legalName,
          );
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
        } else if (orgRes.error) {
          // Organização não veio, mas não foi por "esse domínio não existe" — a Apollo
          // respondeu com erro real (chave inválida, upstream fora do ar, plano sem
          // escopo). Guarda a causa em vez de deixar isso indistinguível de "sem dado".
          apolloError = orgRes.error;
        }

        // Coleta decisores retornados pela Apollo
        const contactsRes = await enrichOrganizationWithContacts(targetDomain);
        if (contactsRes.error && !contactsRes.contacts?.length) {
          apolloError = apolloError || contactsRes.error;
        }
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
      apolloError =
        err instanceof Error ? err.message : 'Falha desconhecida no passo Apollo da cascata';
      logger.error(
        { err, companyId, domain },
        'Falha no passo 1 da cascata (Apollo) — prosseguindo para Hunter.io',
      );
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
          } else if (hunterEmail.error) {
            hunterError = hunterError || hunterEmail.error;
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
        } else if (domainPeople.error) {
          hunterError = hunterError || domainPeople.error;
        }
      }
    } catch (err) {
      hunterError =
        err instanceof Error ? err.message : 'Falha desconhecida no passo Hunter.io da cascata';
      logger.error(
        { err, companyId, domain },
        'Falha no passo 2 da cascata (Hunter.io) — prosseguindo para Google Places',
      );
    }
  }

  // ────────────────────────── PASSO 3: GOOGLE PLACES ──────────────────────────
  // Se a empresa ainda não tiver telefone, endereço detalhado ou avaliação do Google Maps
  let placePhone: string | undefined;
  let placeRating: number | undefined;

  if (!company.phones?.length || !company.googleRating) {
    try {
      const locStr = [city, state].filter(Boolean).join(', ') || 'Brasil';
      const { place, error: placesFetchError } = await searchGooglePlaceDetailed(
        companyName,
        locStr,
      );
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
            phones:
              placePhone && !company.phones.includes(placePhone)
                ? [...company.phones, placePhone]
                : company.phones,
          },
        });
      } else if (placesFetchError) {
        googlePlacesError = placesFetchError;
      }
    } catch (err) {
      googlePlacesError =
        err instanceof Error ? err.message : 'Falha desconhecida no passo Google Places da cascata';
      logger.error({ err, companyId, companyName }, 'Falha no passo 3 da cascata (Google Places)');
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
      // Sem isto, todo contato criado pela cascata tinha emailStatus sempre null, perdendo o
      // sinal "verified/guessed/invalid" que enrichment.service.ts (o path mais antigo) já
      // calcula via checkEmailDeliverability (MX-check) — e nada downstream (cold-email.service.ts
      // incluso) consegue distinguir um e-mail sintaticamente válido mas sem domínio real de um
      // verificado de verdade.
      await prisma.contact.create({
        data: {
          companyId,
          organizationId,
          name: nc.name,
          role: nc.title,
          email: nc.email,
          emailStatus: await resolveEmailStatus(nc.email ?? null),
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

  // ────────────────────────── STATUS HONESTO DA CASCATA ──────────────────────────
  // Onda 2 (05) — critério "provider com erro silencioso": antes daqui, `status`/`dataOrigin`
  // no EnrichmentLog e `enrichmentStatus` na Company eram gravados como sucesso/confirmado
  // incondicionalmente, mesmo quando os três passos acima falharam de verdade (não "não achou
  // nada" — Apollo/Hunter/Google Places genuinely fora do ar ou com chave inválida). Isso tornava
  // "provider quebrado" indistinguível de "empresa sem dado novo disponível" tanto na auditoria
  // quanto na resposta da rota `/companies/:id/enrich-cascade`.
  const anyEnriched = apolloEnriched || hunterEnriched || googlePlacesEnriched;
  const errors: CascadeStepErrors = {
    ...(apolloError ? { apollo: apolloError } : {}),
    ...(hunterError ? { hunter: hunterError } : {}),
    ...(googlePlacesError ? { googlePlaces: googlePlacesError } : {}),
  };
  const anyErrored = Object.keys(errors).length > 0;
  const status: CascadeEnrichmentResult['status'] = anyEnriched
    ? 'enriched'
    : anyErrored
      ? 'failed'
      : 'no_new_data';

  // Finaliza status da Company e grava log de auditoria
  await prisma.company.update({
    where: { id: companyId },
    data: {
      // 'Falhou' só quando NENHUM passo trouxe dado novo E pelo menos um provider quebrou de
      // verdade — um "no_new_data" limpo (todos os providers responderam, sem novidade) ainda
      // conta como um ciclo de enriquecimento completo, mesmo padrão de `enrichment.service.ts`.
      enrichmentStatus: status === 'failed' ? 'Falhou' : 'Enriquecido',
      enrichmentSource: 'Cascade:Apollo->Hunter->GooglePlaces',
      enrichedAt: new Date(),
    },
  });

  await prisma.enrichmentLog.create({
    data: {
      companyId,
      source: 'Cascade:Apollo->Hunter->GooglePlaces',
      field: 'firmographics-contacts-places',
      status: status === 'enriched' ? 'success' : status === 'failed' ? 'failed' : 'not_found',
      // "confirmado" só quando algum provider de fato devolveu dado verbatim (Apollo/Hunter
      // contact record, Google Places record) — nunca quando os três passos falharam ou não
      // encontraram nada (ver AGENTS.md → LGPD → "05: rotulagem de dado inferido vs. confirmado").
      dataOrigin: anyEnriched ? 'confirmado' : null,
      rawData: {
        apolloEnriched,
        hunterEnriched,
        googlePlacesEnriched,
        contactsAdded,
        // `errors` é uma interface com chaves opcionais conhecidas (sem index signature),
        // então não satisfaz `InputJsonValue` diretamente — mesmo padrão de serialização já
        // usado nos outros `rawData` deste domínio (enrichment.service.ts).
        errors: JSON.parse(JSON.stringify(errors)),
        durationMs: Date.now() - startedAt,
      },
    },
  });

  if (status === 'failed') {
    logger.error(
      {
        companyId,
        errors,
        durationMs: Date.now() - startedAt,
      },
      'Enriquecimento em cascata terminou sem nenhum dado novo e com erro real de provider',
    );
  } else {
    logger.info(
      {
        companyId,
        apolloEnriched,
        hunterEnriched,
        googlePlacesEnriched,
        contactsAdded,
        errors: anyErrored ? errors : undefined,
        durationMs: Date.now() - startedAt,
      },
      status === 'enriched'
        ? 'Enriquecimento em cascata finalizado com dado novo'
        : 'Enriquecimento em cascata finalizado sem dado novo (nenhum provider falhou)',
    );
  }

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
    errors,
    status,
  };
}
