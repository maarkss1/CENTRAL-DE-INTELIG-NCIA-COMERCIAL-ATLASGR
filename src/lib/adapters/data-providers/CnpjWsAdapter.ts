import { logger } from '../../../lib/logger';
import { IDataProvider } from './IDataProvider';
import { IProspectingFilter } from '../../../types/prospecting';
import { IEnrichmentResult } from '../../../types/enrichment';
import { sanitizeCnpj, isValidCnpj, formatCnpj } from '../../../features/prospecting/services/cnpj.util';

// Rate limit da API pública CNPJ.ws: 3 requisições por minuto.
// Em vez de bloquear a thread por 20s, registramos o aviso e devolvemos vazio —
// o MergeEngine vai tentar o próximo provedor da cascata (Google Places / Apollo).
const CNPJWS_RATE_LIMIT_BACKOFF_MS = 3_000;

interface CnpjWsAtividade {
    id?: string;
    descricao?: string;
}

interface CnpjWsEstabelecimento {
    atividade_principal?: CnpjWsAtividade;
    tipo_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    ddd1?: string;
    telefone1?: string;
    ddd2?: string;
    telefone2?: string;
    nome_fantasia?: string;
    situacao_cadastral?: string;
    data_inicio_atividade?: string;
    cidade?: { nome?: string };
    estado?: { sigla?: string };
    cep?: string;
    email?: string;
}

interface CnpjWsResponse {
    razao_social?: string;
    natureza_juridica?: { descricao?: string };
    capital_social?: string;
    porte?: { descricao?: string };
    estabelecimento?: CnpjWsEstabelecimento;
}

// Domínio único autorizado para este adapter — guard anti-SSRF idêntico ao BrasilApiAdapter.
const ALLOWED_HOSTNAME = 'publica.cnpj.ws';

export class CnpjWsAdapter implements IDataProvider {
    providerName = 'CNPJ.ws';

    public async fetchWithRetry(url: string, init: RequestInit, attempts = 2, timeoutMs = 8000): Promise<Response> {
        // Guard anti-SSRF: só aceita chamadas ao hostname oficial do CNPJ.ws.
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== ALLOWED_HOSTNAME) {
            throw new Error('invalid_upstream_url');
        }

        let lastError: unknown;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(url, { ...init, signal: controller.signal });
                clearTimeout(timeout);
                if (res.status === 429) {
                    // Rate limit da API pública: aguarda um backoff curto e tenta mais uma vez.
                    // Não bloqueamos a thread por 20s — isso é inaceitável em produção.
                    logger.warn({ url, attempt }, '[CnpjWsAdapter] Rate limit (429) — aguardando backoff curto');
                    await new Promise(resolve => setTimeout(resolve, CNPJWS_RATE_LIMIT_BACKOFF_MS));
                    continue;
                }
                if (res.status >= 500 && attempt < attempts) continue;
                return res;
            } catch (error: unknown) {
                clearTimeout(timeout);
                lastError = error;
                if (attempt >= attempts) throw error;
            }
        }
        throw lastError;
    }

    private formatPhone(ddd?: string, numero?: string): string | null {
        if (!ddd || !numero) return null;
        const digits = (ddd + numero).replace(/\D/g, '');
        if (digits.length < 10) return null;
        const d = digits.slice(0, 2);
        const rest = digits.slice(2);
        return rest.length === 9
            ? `(${d}) ${rest.slice(0, 5)}-${rest.slice(5)}`
            : `(${d}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }

    async search(_filters: IProspectingFilter): Promise<Partial<IEnrichmentResult>[]> {
        return [];
    }

    async enrich(query: { cnpj?: string; name?: string; domain?: string; location?: string }): Promise<Partial<IEnrichmentResult>> {
        if (!query.cnpj) return {};

        const startTime = Date.now();
        const cnpj = sanitizeCnpj(query.cnpj);
        if (!isValidCnpj(cnpj)) {
            return {};
        }

        try {
            const res = await this.fetchWithRetry(`https://${ALLOWED_HOSTNAME}/cnpj/${cnpj}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    Accept: 'application/json',
                },
            });

            if (!res.ok) {
                logger.error(`[CnpjWsAdapter] Error fetching CNPJ ${cnpj}: ${res.status}`);
                return {};
            }

            const raw = await res.json() as CnpjWsResponse;

            const mainActivity = raw.estabelecimento?.atividade_principal;
            const address = raw.estabelecimento;
            const addressParts = [
                address?.tipo_logradouro,
                address?.logradouro,
                address?.numero,
                address?.complemento,
                address?.bairro,
            ].filter(Boolean);

            const phones = [
                this.formatPhone(address?.ddd1, address?.telefone1),
                this.formatPhone(address?.ddd2, address?.telefone2),
            ].filter((p): p is string => !!p);

            return {
                company: {
                    legalName: raw.razao_social,
                    tradeName: address?.nome_fantasia || raw.razao_social,
                    cnpj: formatCnpj(cnpj),
                    situacaoCadastral: address?.situacao_cadastral,
                    naturezaJuridica: raw.natureza_juridica?.descricao,
                    capitalSocial: raw.capital_social ? parseFloat(raw.capital_social) : undefined,
                    dataAbertura: address?.data_inicio_atividade,
                    cnae: mainActivity?.id,
                    cnaeDescription: mainActivity?.descricao,
                    size: raw.porte?.descricao,
                },
                address: {
                    street: [address?.tipo_logradouro, address?.logradouro].filter(Boolean).join(' '),
                    number: address?.numero,
                    complement: address?.complemento,
                    neighborhood: address?.bairro,
                    city: address?.cidade?.nome,
                    state: address?.estado?.sigla,
                    zipCode: address?.cep,
                    fullAddress: addressParts.join(', '),
                },
                contacts: {
                    phones,
                    emails: address?.email ? [address.email] : [],
                    decisionMakers: [],
                },
                social: {},
                enrichment: {
                    sources: [{ sourceName: this.providerName, extractedAt: new Date().toISOString() }],
                    confidence: {
                        company: 95, // Altamente confiável, espelho da receita
                        address: 90,
                        contacts: 70,
                        social: 0,
                    },
                    timestamp: new Date().toISOString(),
                    executionTime: Date.now() - startTime,
                },
            };
        } catch (error: unknown) {
            logger.error({ err: error, cnpj }, '[CnpjWsAdapter] Request failed');
            return {};
        }
    }
}
