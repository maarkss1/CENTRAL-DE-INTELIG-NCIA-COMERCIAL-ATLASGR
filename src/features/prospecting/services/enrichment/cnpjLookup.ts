import { isValidCnpj, sanitizeCnpj, formatCnpj } from '../cnpj.util';

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
