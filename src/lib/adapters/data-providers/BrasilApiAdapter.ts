import { IDataProvider } from './IDataProvider';
import { IProspectingFilter } from '../../../types/prospecting';
import { IEnrichmentResult } from '../../../types/enrichment';
import { sanitizeCnpj, isValidCnpj, formatCnpj } from '../../../features/prospecting/services/cnpj.util';

const BRASIL_API_BASE = 'https://brasilapi.com.br/api';
const BRASIL_API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/json',
};

const PORTE_TO_EMPLOYEE_ESTIMATE: Record<number, { label: string; count: number }> = {
    1: { label: '1-9 (estimado)', count: 5 },
    2: { label: '1-9 (estimado)', count: 5 },
    3: { label: '10-49 (estimado)', count: 25 },
    5: { label: '50-500+ (estimado)', count: 120 },
};

export class BrasilApiAdapter implements IDataProvider {
  providerName = 'BrasilAPI';

  public async fetchWithRetry(url: string, init: RequestInit, attempts = 2, timeoutMs = 8000): Promise<Response> {
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
              if (res.status >= 500 && attempt < attempts) continue;
              return res;
          } catch (error) {
              clearTimeout(timeout);
              lastError = error;
              if (attempt >= attempts) throw error;
          }
      }
      throw lastError;
  }

  private formatPhone(ddd_telefone: string): string | null {
      const digits = (ddd_telefone || '').replace(/\D/g, '');
      if (digits.length < 10) return null;
      const ddd = digits.slice(0, 2);
      const rest = digits.slice(2);
      return rest.length === 9
          ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
          : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }

  async search(filters: IProspectingFilter): Promise<Partial<IEnrichmentResult>[]> {
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
        const res = await this.fetchWithRetry(`${BRASIL_API_BASE}/cnpj/v1/${cnpj}`, { headers: BRASIL_API_HEADERS });
        if (!res.ok) {
            console.error(`[BrasilApiAdapter] Error fetching CNPJ ${cnpj}: ${res.status}`);
            return {};
        }

        const raw = await res.json() as unknown;
        const employeeEstimate = PORTE_TO_EMPLOYEE_ESTIMATE[raw.codigo_porte] ?? PORTE_TO_EMPLOYEE_ESTIMATE[5];

        const addressParts = [raw.logradouro, raw.numero, raw.complemento, raw.bairro].filter(Boolean);
        const phones = [this.formatPhone(raw.ddd_telefone_1), this.formatPhone(raw.ddd_telefone_2)].filter(
            (p): p is string => !!p
        );

        return {
            company: {
                legalName: raw.razao_social,
                tradeName: raw.nome_fantasia || raw.razao_social,
                cnpj: formatCnpj(cnpj),
                situacaoCadastral: raw.descricao_situacao_cadastral,
                naturezaJuridica: raw.natureza_juridica,
                capitalSocial: raw.capital_social,
                dataAbertura: raw.data_inicio_atividade,
                cnae: String(raw.cnae_fiscal),
                cnaeDescription: raw.cnae_fiscal_descricao,
                size: raw.porte,
                employeeCountEstimate: employeeEstimate.count,
            },
            address: {
                street: raw.logradouro,
                number: raw.numero,
                complement: raw.complemento,
                neighborhood: raw.bairro,
                city: raw.municipio,
                state: raw.uf,
                zipCode: raw.cep,
                fullAddress: addressParts.join(', '),
            },
            contacts: {
                phones,
                emails: raw.email ? [raw.email] : [],
                decisionMakers: []
            },
            social: {},
            enrichment: {
                sources: [{ sourceName: this.providerName, extractedAt: new Date().toISOString() }],
                confidence: {
                    company: 100, // Dado oficial da receita
                    address: 90,
                    contacts: 70, // Telefones contadores as vezes
                    social: 0
                },
                timestamp: new Date().toISOString(),
                executionTime: Date.now() - startTime
            }
        };
    } catch (error) {
        console.error(`[BrasilApiAdapter] Request failed for CNPJ ${cnpj}:`, error);
        return {};
    }
  }
}
