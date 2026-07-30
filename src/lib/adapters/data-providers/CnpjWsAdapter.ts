import { IDataProvider } from './IDataProvider';
import { IProspectingFilter } from '../../../types/prospecting';
import { IEnrichmentResult } from '../../../types/enrichment';
import { sanitizeCnpj, isValidCnpj, formatCnpj } from '../../../features/prospecting/services/cnpj.util';

export class CnpjWsAdapter implements IDataProvider {
  providerName = 'CNPJ.ws';

  public async fetchWithRetry(url: string, init: RequestInit, attempts = 2, timeoutMs = 8000): Promise<Response> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt++) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          try {
              const res = await fetch(url, { ...init, signal: controller.signal });
              clearTimeout(timeout);
              if (res.status === 429) {
                  // Too many requests - public API limit is 3 requests per minute
                  await new Promise(resolve => setTimeout(resolve, 20000));
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

  private formatPhone(ddd: string, numero: string): string | null {
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
        const res = await this.fetchWithRetry(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                Accept: 'application/json',
            }
        });

        if (!res.ok) {
            console.error(`[CnpjWsAdapter] Error fetching CNPJ ${cnpj}: ${res.status}`);
            return {};
        }

        const raw = await res.json() as Record<string, unknown>;

        const mainActivity = raw.estabelecimento?.atividade_principal;
        const address = raw.estabelecimento;
        const addressParts = [address?.tipo_logradouro, address?.logradouro, address?.numero, address?.complemento, address?.bairro].filter(Boolean);

        const phones = [
            this.formatPhone(address?.ddd1, address?.telefone1),
            this.formatPhone(address?.ddd2, address?.telefone2)
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
                decisionMakers: []
            },
            social: {},
            enrichment: {
                sources: [{ sourceName: this.providerName, extractedAt: new Date().toISOString() }],
                confidence: {
                    company: 95, // Altamente confiável, espelho da receita
                    address: 90,
                    contacts: 70,
                    social: 0
                },
                timestamp: new Date().toISOString(),
                executionTime: Date.now() - startTime
            }
        };
    } catch (error: unknown) {
        console.error(`[CnpjWsAdapter] Request failed for CNPJ ${cnpj}:`, error);
        return {};
    }
  }
}
