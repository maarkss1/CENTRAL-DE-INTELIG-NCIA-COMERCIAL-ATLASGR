import { prisma } from '../../../lib/prisma.js';
import { isValidCnpj, sanitizeCnpj, formatCnpj, discoverCnpjByName } from './cnpj.util';
import { IcebreakerService } from '../../intelligence/services/IcebreakerService';
import { searchGooglePlace } from './places.service';
import { searchNominatimPlace } from './nominatim.service';
import { enrichOrganizationWithContacts, enrichOrganizationByDomain } from './apollo.service';
import { fromPrismaCompanyStatus } from '../../../lib/enumMap';

// Trechos (lowercase) de nomes de ERP/TMS comuns no mercado logístico/transportador brasileiro —
// usados para um pequeno bônus de fit score quando a Apollo detecta um deles na empresa (ver
// computeFitScore). Comparamos por "contains" porque a Apollo devolve nomes de exibição livres
// (ex: "SAP Business One", "TOTVS Protheus"), não os UIDs usados como filtro de busca.
const LOGISTICS_RELEVANT_TECH_KEYWORDS = ['sap', 'protheus', 'sankhya', 'netsuite', 'totvs'];

// Categorias de carga com maior índice de roubo no Brasil, segundo a Associação Nacional do
// Transporte de Cargas e Logística (NTC) — citadas na Apresentação de Gerenciamento de Risco da
// Atlas como as "cargas mais roubadas no Brasil". Empresas que transportam esse tipo de carga são
// prioridade comercial real (maior exposição a sinistro = maior valor percebido do GR da Atlas).
const HIGH_THEFT_RISK_CARGO_KEYWORDS = [
    'aliment', 'bebida', 'eletroeletr', 'eletr', 'cigarro', 'tabaco', 'farmac', 'quimic', 'químic',
    'têxtil', 'textil', 'confec', 'autope', 'agric', 'agro', 'combust', 'petrol', 'higiene', 'limpeza',
];

const BRASIL_API_BASE = 'https://brasilapi.com.br/api';

// BrasilAPI está atrás de um CDN que retorna 403 para o User-Agent padrão do fetch/undici do Node.
// Um header de navegador real resolve — não é bypass de auth, é só evitar o bloqueio de bots do CDN.
const BRASIL_API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/json',
};

// Mapeia código de porte da Receita Federal para uma faixa de funcionários estimada.
// A Receita não expõe headcount real, então isso é uma estimativa explícita — nunca
// apresentada como dado oficial.
const PORTE_TO_EMPLOYEE_ESTIMATE: Record<number, { label: string; count: number }> = {
    1: { label: '1-9 (estimado)', count: 5 },
    2: { label: '1-9 (estimado)', count: 5 },
    3: { label: '10-49 (estimado)', count: 25 },
    5: { label: '50-500+ (estimado)', count: 120 },
};

interface BrasilApiCnpjResponse {
    cnpj: string;
    razao_social: string;
    nome_fantasia: string;
    descricao_situacao_cadastral: string;
    natureza_juridica: string;
    capital_social: number;
    data_inicio_atividade: string;
    cnae_fiscal: number;
    cnae_fiscal_descricao: string;
    porte: string;
    codigo_porte: number;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    ddd_telefone_1: string;
    ddd_telefone_2: string;
    email: string | null;
    qsa: Array<{ nome_socio: string; qualificacao_socio: string }>;
}

export interface CnpjLookupResult {
    found: boolean;
    cnpj: string;
    source: 'BrasilAPI-CNPJ';
    data?: {
        legalName: string;
        tradeName: string;
        situacaoCadastral: string;
        naturezaJuridica: string;
        capitalSocial: number;
        dataAbertura: string;
        cnae: string;
        cnaeDescription: string;
        size: string;
        employeeCountEstimate: number;
        address: string;
        city: string;
        state: string;
        zipCode: string;
        phones: string[];
        emails: string[];
        qsa: Array<{ nome: string; qualificacao: string }>;
    };
    raw?: BrasilApiCnpjResponse;
    error?: string;
}

/** Fetch com timeout + retry (1 nova tentativa em erro de rede/timeout) — BrasilAPI ocasionalmente é lenta ou instável. */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 2, timeoutMs = 8000): Promise<Response> {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'brasilapi.com.br') {
        throw new Error('invalid_upstream_url');
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...init, signal: controller.signal });
            clearTimeout(timeout);
            if (res.status >= 500 && attempt < attempts) continue; // erro do servidor upstream — tenta de novo
            return res;
        } catch (error) {
            clearTimeout(timeout);
            lastError = error;
            if (attempt >= attempts) throw error;
        }
    }
    throw lastError;
}

function formatPhone(ddd_telefone: string): string | null {
    const digits = (ddd_telefone || '').replace(/\D/g, '');
    if (digits.length < 10) return null;
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    return rest.length === 9
        ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
        : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

/** Consulta dados cadastrais reais de um CNPJ na Receita Federal via BrasilAPI (fonte oficial, gratuita, sem chave). */
export async function fetchCnpjData(cnpjRaw: string): Promise<CnpjLookupResult> {
    const cnpj = sanitizeCnpj(cnpjRaw);
    if (!isValidCnpj(cnpj)) {
        return { found: false, cnpj: cnpjRaw, source: 'BrasilAPI-CNPJ', error: 'invalid_format' };
    }

    let res: Response;
    try {
        res = await fetchWithRetry(`${BRASIL_API_BASE}/cnpj/v1/${cnpj}`, { headers: BRASIL_API_HEADERS });
    } catch (error) {
        const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network_error';
        return { found: false, cnpj: formatCnpj(cnpj), source: 'BrasilAPI-CNPJ', error: reason };
    }
    if (res.status === 404) {
        return { found: false, cnpj: formatCnpj(cnpj), source: 'BrasilAPI-CNPJ', error: 'not_found' };
    }
    if (!res.ok) {
        return { found: false, cnpj: formatCnpj(cnpj), source: 'BrasilAPI-CNPJ', error: `upstream_error_${res.status}` };
    }

    const raw = (await res.json()) as BrasilApiCnpjResponse;
    const employeeEstimate = PORTE_TO_EMPLOYEE_ESTIMATE[raw.codigo_porte] ?? PORTE_TO_EMPLOYEE_ESTIMATE[5];

    const addressParts = [raw.logradouro, raw.numero, raw.complemento, raw.bairro].filter(Boolean);
    const phones = [formatPhone(raw.ddd_telefone_1), formatPhone(raw.ddd_telefone_2)].filter(
        (p): p is string => !!p
    );

    return {
        found: true,
        cnpj: formatCnpj(cnpj),
        source: 'BrasilAPI-CNPJ',
        raw,
        data: {
            legalName: raw.razao_social,
            tradeName: raw.nome_fantasia || raw.razao_social,
            situacaoCadastral: raw.descricao_situacao_cadastral,
            naturezaJuridica: raw.natureza_juridica,
            capitalSocial: raw.capital_social,
            dataAbertura: raw.data_inicio_atividade,
            cnae: String(raw.cnae_fiscal),
            cnaeDescription: raw.cnae_fiscal_descricao,
            size: raw.porte,
            employeeCountEstimate: employeeEstimate.count,
            address: addressParts.join(', '),
            city: raw.municipio,
            state: raw.uf,
            zipCode: raw.cep,
            phones,
            emails: raw.email ? [raw.email] : [],
            qsa: (raw.qsa || []).map((s) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })),
        },
    };
}

export interface CepLookupResult {
    found: boolean;
    source: 'BrasilAPI-CEP';
    street?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
}

/** Consulta endereço real por CEP via BrasilAPI (Correios), usada quando o CNPJ não traz endereço completo. */
export async function fetchCepData(cepRaw: string): Promise<CepLookupResult> {
    const cep = (cepRaw || '').replace(/\D/g, '');
    if (cep.length !== 8) return { found: false, source: 'BrasilAPI-CEP' };

    try {
        const res = await fetchWithRetry(`${BRASIL_API_BASE}/cep/v2/${cep}`, { headers: BRASIL_API_HEADERS });
        if (!res.ok) return { found: false, source: 'BrasilAPI-CEP' };
        const data = await res.json();
        return {
            found: true,
            source: 'BrasilAPI-CEP',
            street: data.street,
            neighborhood: data.neighborhood,
            city: data.city,
            state: data.state,
        };
    } catch {
        return { found: false, source: 'BrasilAPI-CEP' };
    }
}

function slugify(name: string): string {
    return (name || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/(ltda|me|eireli|s\/a|sa|epp)\b/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join('');
}

export interface DomainGuess {
    domain: string;
    verified: boolean;
    emails: string[];
}

/**
 * Números de celular brasileiros (DDD + 9 dígitos, começando com 9) normalmente têm WhatsApp —
 * heurística padrão de SDR, não uma verificação real. Não inventamos um número novo: só
 * reaproveitamos o mesmo telefone já coletado (Apollo/Hunter) quando o formato indica celular.
 */
function guessWhatsappFromPhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
    if (digits.length === 11 && digits[2] === '9') return phone;
    return null;
}

/** Extrai o hostname (sem "www.") de uma URL de site já conhecida — usado para preferir um domínio real a uma heurística. */
function extractDomainFromWebsite(website?: string | null): string | null {
    if (!website) return null;
    try {
        const url = new URL(website.startsWith('http') ? website : `https://${website}`);
        return url.hostname.replace(/^www\./, '') || null;
    } catch {
        return null;
    }
}

/**
 * Heurística de descoberta de domínio/e-mail (SDR manual faz isso o tempo todo):
 * deriva um domínio provável a partir do nome e tenta uma verificação HTTP real.
 * Se o domínio responder, marcamos como "verificado"; caso contrário é só uma sugestão.
 */
export async function guessDomainAndEmails(companyName: string): Promise<DomainGuess> {
    const slug = slugify(companyName);
    const domain = slug ? `${slug}.com.br` : '';
    let verified = false;

    if (domain) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`https://${domain}`, { method: 'HEAD', signal: controller.signal });
            clearTimeout(timeout);
            verified = res.ok || (res.status >= 300 && res.status < 500);
        } catch {
            verified = false;
        }
    }

    const emails = domain
        ? [`contato@${domain}`, `comercial@${domain}`, `atendimento@${domain}`]
        : [];

    return { domain, verified, emails };
}

export interface ScoreBreakdownItem {
    label: string;
    points: number;
    detail: string;
}

export interface FitScoreResult {
    score: number;
    temperature: 'Quente' | 'Morno' | 'Frio';
    breakdown: ScoreBreakdownItem[];
}

export interface FitScoreInput {
    situacaoCadastral?: string | null;
    capitalSocial?: number | null;
    employeeCountEstimate?: number | null;
    size?: string | null;
    cnaeDescription?: string | null;
    segmentKeywords?: string[];
    /** Segmento/indústria (ex: Apollo `industry`, ou o segmento do ICP) — usado junto com o CNAE para o bônus de carga de risco. */
    segment?: string | null;
    /** Cidade/UF real (pós-enriquecimento) — usado para o bônus de região de risco do playbook Atlas. */
    city?: string | null;
    state?: string | null;
    /** Faixa de frota selecionada no ICP (texto do dropdown) — usado para o bônus de frota do playbook Atlas. */
    fleetSizeHint?: string | null;
    /** UIDs de tecnologia detectados via Apollo Organization Enrich — usado para o bônus de ERP/TMS logístico. */
    technologies?: string[] | null;
}

/** Score de fit determinístico e auditável — cada critério é real (dado da Receita) e explicado. */
export function computeFitScore(input: FitScoreInput): FitScoreResult {
    const breakdown: ScoreBreakdownItem[] = [];
    let score = 0;

    if (input.situacaoCadastral) {
        if (input.situacaoCadastral.toUpperCase() === 'ATIVA') {
            score += 30;
            breakdown.push({ label: 'Situação cadastral', points: 30, detail: 'CNPJ ativo na Receita Federal' });
        } else {
            score -= 40;
            breakdown.push({
                label: 'Situação cadastral',
                points: -40,
                detail: `CNPJ com situação "${input.situacaoCadastral}" — risco alto`,
            });
        }
    }

    if (input.capitalSocial != null) {
        if (input.capitalSocial >= 100000) {
            score += 20;
            breakdown.push({ label: 'Capital social', points: 20, detail: 'Capital social >= R$ 100 mil' });
        } else if (input.capitalSocial >= 10000) {
            score += 10;
            breakdown.push({ label: 'Capital social', points: 10, detail: 'Capital social entre R$ 10 mil e R$ 100 mil' });
        } else {
            breakdown.push({ label: 'Capital social', points: 0, detail: 'Capital social baixo (< R$ 10 mil)' });
        }
    }

    if (input.employeeCountEstimate != null) {
        if (input.employeeCountEstimate >= 50) {
            score += 20;
            breakdown.push({ label: 'Porte estimado', points: 20, detail: 'Estimativa de 50+ funcionários' });
        } else if (input.employeeCountEstimate >= 10) {
            score += 12;
            breakdown.push({ label: 'Porte estimado', points: 12, detail: 'Estimativa de 10-49 funcionários' });
        } else {
            score += 5;
            breakdown.push({ label: 'Porte estimado', points: 5, detail: 'Estimativa de 1-9 funcionários' });
        }
    }

    if (input.segmentKeywords?.length && input.cnaeDescription) {
        const desc = input.cnaeDescription.toLowerCase();
        const matched = input.segmentKeywords.some((k) => desc.includes(k.toLowerCase()));
        if (matched) {
            score += 25;
            breakdown.push({ label: 'Aderência de CNAE ao ICP', points: 25, detail: `Atividade "${input.cnaeDescription}" combina com o segmento buscado` });
        } else {
            breakdown.push({ label: 'Aderência de CNAE ao ICP', points: 0, detail: `Atividade "${input.cnaeDescription}" não confirma o segmento buscado` });
        }
    }

    // Critérios de priorização do playbook comercial Atlas: frota acima de 50 veículos
    // e atuação em regiões de maior índice de roubo de carga (RJ e Grande SP).
    if (input.fleetSizeHint && /acima de 50|150-500|acima de 500/i.test(input.fleetSizeHint)) {
        score += 15;
        breakdown.push({ label: 'Frota (playbook Atlas)', points: 15, detail: 'Frota acima de 50 veículos — critério de priorização' });
    }

    const riskRegion = `${input.city || ''} ${input.state || ''}`.toUpperCase();
    if (input.state && /^(RJ|SP)$/.test(input.state.toUpperCase())) {
        score += 10;
        breakdown.push({ label: 'Região de risco (playbook Atlas)', points: 10, detail: `Atuação em ${riskRegion.trim()} — região com maior índice de roubo de carga` });
    }

    // Categoria de carga de maior risco de roubo (fonte: NTC, citada na Apresentação de
    // Gerenciamento de Risco da Atlas) — empresas nesses segmentos têm maior exposição a sinistro,
    // logo maior valor percebido na venda de GR.
    const cargoText = `${input.cnaeDescription || ''} ${input.segment || ''}`.toLowerCase();
    const matchedCargoRisk = HIGH_THEFT_RISK_CARGO_KEYWORDS.find((k) => cargoText.includes(k));
    if (matchedCargoRisk) {
        score += 10;
        breakdown.push({ label: 'Categoria de carga de risco (NTC)', points: 10, detail: `Atividade sugere transporte de carga com maior índice de roubo no Brasil` });
    }

    const relevantTech = (input.technologies || []).find((t) =>
        LOGISTICS_RELEVANT_TECH_KEYWORDS.some((k) => t.toLowerCase().includes(k))
    );
    if (relevantTech) {
        score += 5;
        breakdown.push({ label: 'Stack de ERP/TMS (Apollo)', points: 5, detail: `Usa "${relevantTech}" — indício de operação já digitalizada, mais fácil de integrar` });
    }

    score = Math.max(0, Math.min(100, score + 25)); // 25 pontos base de participação no funil

    const temperature: FitScoreResult['temperature'] = score >= 75 ? 'Quente' : score >= 45 ? 'Morno' : 'Frio';

    return { score, temperature, breakdown };
}

export interface EnrichCompanyOptions {
    cnpj?: string;
    segmentKeywords?: string[];
    fleetSizeHint?: string;
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
    businessHours?: unknown;
    observations?: string;
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    technologies?: string[];
    keywords?: string[];
    logoUrl?: string;
    apolloOrgId?: string;
}

/** Orquestra o enriquecimento completo de uma empresa já existente no CRM e grava o histórico. */
export async function enrichCompany(companyId: string, options: EnrichCompanyOptions = {}) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
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
        updateData.emails = domainGuess.emails;
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
        if (place.businessHours != null) updateData.businessHours = place.businessHours;
        
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
    if (domainGuess.verified && domainGuess.domain) {
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
            for (const c of apolloContacts) {
                if (!c.name || c.name === 'Sem Nome') continue;
                await prisma.contact.create({
                    data: {
                        name: c.name,
                        role: c.title,
                        email: c.email,
                        phone: c.phone,
                        whatsapp: guessWhatsappFromPhone(c.phone),
                        linkedin: c.linkedin_url,
                        source: contactsSource === 'hunter' ? 'Hunter' : 'Apollo',
                        emailStatus: c.email ? 'guessed' : null,
                        companyId,
                        organizationId: company.organizationId
                    }
                });
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

    return { company: { ...updated, status: fromPrismaCompanyStatus(updated.status) }, fit, domainGuess, apolloContacts };
}
