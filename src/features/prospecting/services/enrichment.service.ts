// ARCH-009 (auditoria de dívida técnica): 846L / complexidade proxy 235 — a maior do repo.
// Diferente de bitrix/apollo (onde a decomposição foi por responsabilidade de domínio), aqui o
// núcleo é UM único fluxo sequencial (runEnrichment) que orquestra várias fontes de dado passo a
// passo, cada passo alimentando o próximo (domínio guessado informa busca de contato, que informa
// o resumo final etc.) — não dá pra separar isso em "adapters" independentes sem reescrever a
// orquestração inteira, e este arquivo não tem cobertura de teste que garanta que uma reescrita
// desse tipo preserva o comportamento atual (ver nota abaixo sobre lib/adapters).
//
// O que FOI extraído sem mudar comportamento (código movido, não reescrito) foram os três blocos
// que são funções puras/isoladas dentro do arquivo, cada uma testável e reutilizável por si só:
// - enrichment/cnpjLookup.ts: fetchCnpjData/fetchCepData (BrasilAPI/Receita Federal)
// - enrichment/domainGuess.ts: heurística de domínio/e-mail + status de entregabilidade
// - enrichment/fitScore.ts: computeFitScore (determinístico, auditável)
// Este arquivo mantém enrichCompany/runEnrichment — o orquestrador de fato — e reexporta a API
// pública dos três módulos acima.
//
// ATUALIZAÇÃO (BITRIX24-LEAD-FLOW-AUDIT.md, achado P1-2): os adapters (IDataProvider) citados
// aqui numa nota anterior — BrasilApiAdapter/ApolloAdapter/CnpjWsAdapter/GooglePlacesAdapter em
// lib/adapters/data-providers, e o orquestrador MergeEngineService que os consumia — foram
// REMOVIDOS. Eram uma segunda implementação completa, nunca chamada por runEnrichment nem por
// nenhuma rota real (só pelos próprios testes unitários), puro código morto duplicando esta
// lógica. Se uma reescrita nesses moldes voltar a ser cogitada, trate como trabalho novo — não
// há mais nada pra "migrar para consumir".
import { prisma } from '../../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { isValidCnpj, discoverCnpjByName } from './cnpj.util';
import { IcebreakerService } from '../../intelligence/services/IcebreakerService';
import { searchGooglePlace } from './places.service';
import { searchNominatimPlace } from './nominatim.service';
import { enrichOrganizationWithContacts, enrichOrganizationByDomain } from './apollo.service';
import { fromPrismaCompanyStatus } from '../../../lib/enumMap';
import { searchCompanyNews, type NewsMention } from './news.service';
import { checkEmailDeliverability } from './email-verification.service';
import { computeLookalikeScore } from './lookalike-scoring.service';
import { fetchCnpjData } from './enrichment/cnpjLookup.js';
import { guessDomainAndEmails, extractDomainFromWebsite, resolveEmailStatus, guessWhatsappFromPhone, type DomainGuess } from './enrichment/domainGuess.js';
import { computeFitScore } from './enrichment/fitScore.js';

export { fetchCnpjData, fetchCepData, type CnpjLookupResult, type CepLookupResult } from './enrichment/cnpjLookup.js';
export { guessDomainAndEmails, type DomainGuess } from './enrichment/domainGuess.js';
export { computeFitScore, type ScoreBreakdownItem, type FitScoreResult, type FitScoreInput } from './enrichment/fitScore.js';

export interface EnrichCompanyOptions {
    cnpj?: string;
    segmentKeywords?: string[];
    fleetSizeHint?: string;
    /** Decisores já buscados na tela de descoberta (Apollo/Hunter) — quando presentes, evitam uma
     * nova chamada às APIs pagas para os mesmos dados que o usuário já viu antes de promover o lead. */
    preFetchedDecisionMakers?: Array<{
        name: string;
        title: string | null;
        email: string | null;
        emailSource?: 'apollo' | 'hunter';
        phone: string | null;
        linkedinUrl: string | null;
    }>;
}

interface CompanyUpdateData {
    cnpj?: string;
    legalName?: string;
    tradeName?: string;
    situacaoCadastral?: string;
    naturezaJuridica?: string;
    capitalSocial?: number;
    dataAbertura?: Date;
    cnae?: string;
    size?: string;
    employeeCount?: number;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    phones?: string[];
    emails?: string[];
    qsa?: Array<{ nome: string; qualificacao: string }>;
    website?: string;
    googleRating?: number;
    googleReviewsCount?: number;
    // Tipado como o JSON de entrada do Prisma (e não `unknown`) porque este objeto é repassado
    // direto pro `company.update` — deixar `unknown` aqui quebra a inferência do `data`.
    businessHours?: Prisma.InputJsonValue;
    observations?: string;
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    technologies?: string[];
    keywords?: string[];
    logoUrl?: string;
    apolloOrgId?: string;
    newsMentions?: Prisma.InputJsonValue;
}

/**
 * Orquestra o enriquecimento completo de uma empresa já existente no CRM e grava o histórico.
 *
 * `organizationId` é exigido aqui (não só no chamador) por consistência com o resto do código —
 * hoje todo chamador real já valida a posse do registro antes de chegar aqui, e `Company` tem RLS
 * (FORCE ROW LEVEL SECURITY) como segunda camada, então isto não corrige uma falha explorável;
 * é hardening para que um chamador futuro que esqueça o pré-check não fique dependendo só da RLS.
 */
export async function enrichCompany(organizationId: string, companyId: string, options: EnrichCompanyOptions = {}) {
    const company = await prisma.company.findFirst({ where: { id: companyId, organizationId } });
    if (!company) throw new Error('Company not found');

    await prisma.company.update({ where: { id: companyId }, data: { enrichmentStatus: 'Enriquecendo' } });

    try {
        return await runEnrichment(company, options);
    } catch (error) {
        await prisma.company.update({ where: { id: companyId }, data: { enrichmentStatus: 'Falhou' } }).catch(() => {});
        throw error;
    }
}

async function runEnrichment(
    company: NonNullable<Awaited<ReturnType<typeof prisma.company.findUnique>>>,
    options: EnrichCompanyOptions
) {
    const companyId = company.id;
    const cnpj = options.cnpj || company.cnpj;
    const updateData: CompanyUpdateData = {};
    let enrichmentSourceLabel = 'Heurística';
    // Capturado durante o lookup de CNPJ (se houver) e usado no fit score — não é persistido no
    // Company hoje (só o código CNAE é), mas precisa estar disponível aqui pro critério de aderência.
    let cnaeDescription: string | undefined;

    let finalCnpj = cnpj;
    if (!finalCnpj && company.tradeName) {
        const discovered = await discoverCnpjByName(company.tradeName);
        if (discovered) finalCnpj = discovered;
    }

    if (finalCnpj && isValidCnpj(finalCnpj)) {
        const lookup = await fetchCnpjData(finalCnpj);

        await prisma.enrichmentLog.create({
            data: {
                companyId,
                source: 'BrasilAPI-CNPJ',
                field: 'dados-cadastrais',
                status: lookup.found ? 'success' : lookup.error === 'not_found' ? 'not_found' : 'failed',
                rawData: lookup.raw ? JSON.parse(JSON.stringify(lookup.raw)) : undefined,
            },
        });

        if (lookup.found && lookup.data) {
            enrichmentSourceLabel = 'BrasilAPI/Receita Federal';
            cnaeDescription = lookup.data.cnaeDescription;
            Object.assign(updateData, {
                cnpj: lookup.cnpj,
                legalName: lookup.data.legalName,
                tradeName: lookup.data.tradeName,
                situacaoCadastral: lookup.data.situacaoCadastral,
                naturezaJuridica: lookup.data.naturezaJuridica,
                capitalSocial: lookup.data.capitalSocial,
                dataAbertura: new Date(lookup.data.dataAbertura),
                cnae: lookup.data.cnae,
                size: lookup.data.size,
                employeeCount: lookup.data.employeeCountEstimate,
                address: lookup.data.address,
                city: lookup.data.city,
                state: lookup.data.state,
                zipCode: lookup.data.zipCode,
                phones: Array.from(new Set([...(company.phones || []), ...lookup.data.phones])),
                emails: Array.from(new Set([...(company.emails || []), ...lookup.data.emails])),
                qsa: lookup.data.qsa,
            } satisfies Partial<CompanyUpdateData>);
        }
    }

    // Se já sabemos o domínio real (ex: `primary_domain` da Apollo ou `websiteUri` do Google Places,
    // capturados no momento da promoção do candidato), usamos ele diretamente — só recorremos à
    // heurística de adivinhação por nome quando não há nenhum site conhecido. Isso evita o caso em
    // que a empresa tem domínio verificado (ex: "dmslog.com") mas a heurística "chuta" um domínio
    // diferente e errado (ex: "dmslogistics.com.br"), pulando os passos de enriquecimento de contatos.
    const knownDomain = extractDomainFromWebsite(company.website);
    const domainGuess: DomainGuess = knownDomain
        ? { domain: knownDomain, verified: true, emails: [`contato@${knownDomain}`, `comercial@${knownDomain}`, `atendimento@${knownDomain}`] }
        : await guessDomainAndEmails(company.tradeName || company.legalName);

    await prisma.enrichmentLog.create({
        data: {
            companyId,
            source: knownDomain ? 'Website-Conhecido' : 'Domain-Heuristic',
            field: 'website-e-emails',
            status: domainGuess.domain ? (domainGuess.verified ? 'success' : 'not_found') : 'failed',
            rawData: JSON.parse(JSON.stringify(domainGuess)),
        },
    });

    if (domainGuess.domain && !company.website) {
        updateData.website = domainGuess.verified
            ? `https://${domainGuess.domain}`
            : `https://${domainGuess.domain} (não verificado)`;
    }
    // Bug real corrigido aqui: quando o CNPJ não trazia e-mail (comum em MEI/autônomo), o bloco da
    // Receita Federal acima já gravava `updateData.emails = []` — um array vazio, mas ainda assim
    // "truthy" em JS — então o antigo guard `!updateData.emails` nunca deixava esse fallback rodar.
    // Além disso, só aplicamos e-mail adivinhado quando o domínio foi REALMENTE verificado (resolveu
    // via HTTP) — para domínio não verificado, "adivinhar" um e-mail em cima de um domínio que talvez
    // nem exista é especulação demais para apresentar como dado da empresa.
    if (domainGuess.verified && domainGuess.emails.length && !(company.emails || []).length && !(updateData.emails?.length)) {
        // O domínio verificado (HTTP 2xx/3xx) não garante que ele aceite e-mail — checamos MX real
        // antes de gravar os e-mails adivinhados (contato@, comercial@, atendimento@) como dado da
        // empresa, senão empurramos endereço inexistente pra régua de outreach.
        const deliverability = await Promise.all(domainGuess.emails.map(checkEmailDeliverability));
        const deliverableEmails = domainGuess.emails.filter(
            (_, i) => deliverability[i].status !== 'invalid'
        );
        if (deliverableEmails.length) {
            updateData.emails = deliverableEmails;
        }
    }

    // Google Places is optional. OpenStreetMap is the zero-cost fallback.
    const locationQuery = updateData.city || company.city || '';
    const stateQuery = updateData.state || company.state || '';
    const companyName = updateData.tradeName || company.tradeName;
    const location = `${locationQuery} ${stateQuery}`.trim();
    const googlePlace = await searchGooglePlace(companyName, location);
    const place = googlePlace || await searchNominatimPlace(companyName, location);
    const placeSource = googlePlace ? 'Google-Places' : 'OpenStreetMap-Nominatim';

    if (place) {
        if (place.rating != null) updateData.googleRating = place.rating;
        if (place.userRatingCount != null) updateData.googleReviewsCount = place.userRatingCount;
        // `PlaceSearchResult.businessHours` é `unknown` (payload livre do Google Places); o cast é
        // seguro porque só chegamos aqui quando o valor não é null/undefined.
        if (place.businessHours != null) updateData.businessHours = place.businessHours as Prisma.InputJsonValue;

        if (place.websiteUri && !domainGuess.verified) {
            updateData.website = place.websiteUri;
        }
        if (place.nationalPhoneNumber) {
            updateData.phones = Array.from(new Set([...(updateData.phones || company.phones || []), place.nationalPhoneNumber]));
        }

        await prisma.enrichmentLog.create({
            data: {
                companyId,
                source: placeSource,
                field: 'reputacao-local',
                status: 'success',
                rawData: JSON.parse(JSON.stringify(place)),
            }
        });
        enrichmentSourceLabel += googlePlace ? ' + Google' : ' + OpenStreetMap';
    }

    // GDELT — índice global de notícias, gratuito/sem chave. Sinal best-effort: nome de empresa
    // pode gerar falso positivo em notícias de terceiros com nome parecido, por isso guardamos os
    // artigos brutos (para o usuário julgar) em vez de usá-los em qualquer pontuação automática.
    const newsMentions: NewsMention[] = await searchCompanyNews(companyName || '');
    await prisma.enrichmentLog.create({
        data: {
            companyId,
            source: 'GDELT-News',
            field: 'noticias',
            status: newsMentions.length > 0 ? 'success' : 'not_found',
            rawData: newsMentions.length > 0 ? JSON.parse(JSON.stringify(newsMentions)) : undefined,
        },
    });
    if (newsMentions.length > 0) {
        updateData.newsMentions = newsMentions as unknown as Prisma.InputJsonValue;
    }

    // Apollo Organization Enrich — perfil firmográfico completo (tecnologias, keywords, redes
    // sociais, capital de mercado etc.), disponível mesmo em planos básicos da Apollo.
    if (domainGuess.verified && domainGuess.domain) {
        const orgEnrich = await enrichOrganizationByDomain(domainGuess.domain);
        await prisma.enrichmentLog.create({
            data: {
                companyId,
                source: 'Apollo-Organization',
                field: 'firmographics',
                status: orgEnrich.organization ? 'success' : orgEnrich.error ? 'failed' : 'not_found',
                rawData: orgEnrich.organization ? JSON.parse(JSON.stringify(orgEnrich.organization)) : undefined,
            },
        });

        if (orgEnrich.organization) {
            const org = orgEnrich.organization;
            updateData.technologies = org.technology_names?.slice(0, 20) || [];
            updateData.keywords = org.keywords?.slice(0, 20) || [];
            if (org.logo_url) updateData.logoUrl = org.logo_url;
            if (org.id) updateData.apolloOrgId = org.id;
            if (org.linkedin_url && !company.linkedin) updateData.linkedin = org.linkedin_url;
            if (org.twitter_url && !company.twitter) updateData.twitter = org.twitter_url;
            if (org.facebook_url && !company.facebook) updateData.facebook = org.facebook_url;
            // A Receita Federal (CNPJ) é a fonte de verdade para porte/funcionários quando disponível;
            // a Apollo só complementa quando a Receita não trouxe nada.
            if (org.estimated_num_employees && !updateData.employeeCount && !company.employeeCount) {
                updateData.employeeCount = org.estimated_num_employees;
            }
            enrichmentSourceLabel += ' + Apollo (firmographics)';
        }
    }

    // Apollo People Enrichment — com fallback automático para Hunter.io Domain Search quando o
    // plano da chave Apollo não inclui People Search (ver apollo.service.ts).
    let apolloContacts: Array<{ name: string; title: string | null; email: string | null; phone: string | null; linkedin_url: string | null }> = [];
    let contactsSource: 'apollo' | 'hunter' | null = null;
    if (options.preFetchedDecisionMakers?.length) {
        // Já buscamos os decisores na tela de descoberta (Radar) — reaproveita em vez de gastar
        // créditos Apollo/Hunter de novo com o mesmo domínio.
        apolloContacts = options.preFetchedDecisionMakers.map((dm) => ({
            name: dm.name,
            title: dm.title,
            email: dm.email,
            phone: dm.phone,
            linkedin_url: dm.linkedinUrl,
        }));
        contactsSource = options.preFetchedDecisionMakers.some((dm) => dm.emailSource === 'hunter') ? 'hunter' : 'apollo';
        enrichmentSourceLabel += ' + Decisores pré-buscados na descoberta';

        await prisma.enrichmentLog.create({
            data: {
                companyId,
                source: 'Discovery-PreFetched',
                field: 'contatos-decisores',
                status: 'success',
                rawData: JSON.parse(JSON.stringify(apolloContacts)),
            }
        });

        const validContacts = apolloContacts.filter(c => c.name && c.name !== 'Sem Nome');
        if (validContacts.length > 0) {
            const contactsData = await Promise.all(validContacts.map(async (c) => ({
                name: c.name,
                role: c.title,
                email: c.email,
                phone: c.phone,
                whatsapp: guessWhatsappFromPhone(c.phone),
                linkedin: c.linkedin_url,
                source: 'Apollo',
                emailStatus: await resolveEmailStatus(c.email),
                companyId,
                organizationId: company.organizationId
            })));
            await prisma.contact.createMany({ data: contactsData });
        }
    } else if (domainGuess.verified && domainGuess.domain) {
        const apolloRes = await enrichOrganizationWithContacts(domainGuess.domain);
        if (apolloRes.contacts.length > 0) {
            apolloContacts = apolloRes.contacts;
            contactsSource = apolloRes.source ?? 'apollo';
            const sourceLabel = contactsSource === 'hunter' ? 'Hunter.io (Domain Search)' : 'Apollo (People Search)';
            enrichmentSourceLabel += ` + ${sourceLabel}`;

            await prisma.enrichmentLog.create({
                data: {
                    companyId,
                    source: contactsSource === 'hunter' ? 'Hunter-DomainSearch' : 'Apollo-People',
                    field: 'contatos-decisores',
                    status: 'success',
                    rawData: JSON.parse(JSON.stringify(apolloContacts)),
                }
            });

            // Save contacts to CRM
            const validContacts = apolloContacts.filter(c => c.name && c.name !== 'Sem Nome');
            if (validContacts.length > 0) {
                const contactsData = await Promise.all(validContacts.map(async (c) => ({
                    name: c.name,
                    role: c.title,
                    email: c.email,
                    phone: c.phone,
                    whatsapp: guessWhatsappFromPhone(c.phone),
                    linkedin: c.linkedin_url,
                    source: contactsSource === 'hunter' ? 'Hunter' : 'Apollo',
                    emailStatus: await resolveEmailStatus(c.email),
                    companyId,
                    organizationId: company.organizationId
                })));
                await prisma.contact.createMany({ data: contactsData });
            }
        }
    }

    const fit = computeFitScore({
        situacaoCadastral: updateData.situacaoCadastral ?? company.situacaoCadastral,
        capitalSocial: updateData.capitalSocial ?? company.capitalSocial,
        employeeCountEstimate: updateData.employeeCount ?? company.employeeCount,
        cnaeDescription,
        segmentKeywords: options.segmentKeywords,
        segment: company.segment,
        city: updateData.city ?? company.city,
        state: updateData.state ?? company.state,
        fleetSizeHint: options.fleetSizeHint,
        technologies: updateData.technologies ?? company.technologies,
    });

    // Look-alike scoring (pgvector) — roda depois do fit score determinístico, nunca no lugar dele:
    // é um sinal complementar ("parece com quem já comprou"), não substitui os critérios auditáveis
    // acima. `null` quando o tenant ainda não tem histórico de vitórias suficiente (cold start).
    const lookalike = company.organizationId
        ? await computeLookalikeScore(companyId, company.organizationId)
        : null;
    await prisma.enrichmentLog.create({
        data: {
            companyId,
            source: 'Lookalike-PgVector',
            field: 'similaridade-com-ganhos',
            status: lookalike ? 'success' : 'not_found',
            rawData: lookalike ? JSON.parse(JSON.stringify(lookalike)) : undefined,
        },
    });

    // Resumo determinístico do enriquecimento — montado a partir dos próprios dados coletados
    // acima (Receita Federal, Google Negócios, Apollo), sem depender de nenhum modelo generativo.
    const summaryParts: string[] = [];
    if (updateData.situacaoCadastral) {
        summaryParts.push(
            updateData.situacaoCadastral.toUpperCase() === 'ATIVA'
                ? 'CNPJ ativo na Receita Federal'
                : `CNPJ com situação "${updateData.situacaoCadastral}" — atenção antes de abordar`
        );
    }
    if (updateData.googleRating != null) {
        summaryParts.push(`nota ${updateData.googleRating} no Google (${updateData.googleReviewsCount || 0} avaliações)`);
    }
    if (updateData.technologies && updateData.technologies.length > 0) {
        summaryParts.push(`stack de tecnologia identificado: ${updateData.technologies.slice(0, 5).join(', ')}`);
    }
    if (apolloContacts.length > 0) {
        const sourceLabel = contactsSource === 'hunter' ? 'Hunter.io' : 'Apollo';
        summaryParts.push(`decisores identificados via ${sourceLabel}: ${apolloContacts.map((c) => `${c.name} (${c.title || 'cargo não informado'})`).join(', ')}`);
    }
    if (newsMentions.length > 0) {
        summaryParts.push(`${newsMentions.length} menção(ões) recentes na imprensa encontradas (GDELT): ${newsMentions.map((n) => n.title).join('; ')}`);
    }
    if (lookalike) {
        summaryParts.push(`${lookalike.score}% de semelhança com empresas já ganhas (mais parecida: ${lookalike.matches[0]?.tradeName})`);
    }

    const icebreakerService = new IcebreakerService();
    const icebreaker = await icebreakerService.generateIcebreaker(companyName || '');
    if (icebreaker) {
        summaryParts.push(`\n\n💡 Sugestão de Quebra-Gelo: "${icebreaker}"`);
    }

    if (summaryParts.length > 0) {
        updateData.observations = `Resumo do enriquecimento — ${summaryParts.join('; ')}.`;
    }

    const updated = await prisma.company.update({
        where: { id: companyId },
        data: {
            ...updateData,
            enrichmentStatus: 'Enriquecido',
            enrichmentSource: enrichmentSourceLabel,
            enrichedAt: new Date(),
        },
    });

    return { company: { ...updated, status: fromPrismaCompanyStatus(updated.status) }, fit, lookalike, domainGuess, apolloContacts };
}
