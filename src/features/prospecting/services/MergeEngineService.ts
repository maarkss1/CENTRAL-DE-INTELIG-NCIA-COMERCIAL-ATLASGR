import { IEnrichmentResult } from '../../../types/enrichment';
import { IDataProvider } from '../../../lib/adapters/data-providers/IDataProvider';
import { BrasilApiAdapter } from '../../../lib/adapters/data-providers/BrasilApiAdapter';
import { CnpjWsAdapter } from '../../../lib/adapters/data-providers/CnpjWsAdapter';
import { GooglePlacesAdapter } from '../../../lib/adapters/data-providers/GooglePlacesAdapter';
import { ApolloAdapter } from '../../../lib/adapters/data-providers/ApolloAdapter';
import { sanitizeCnpj } from './cnpj.util';

export class MergeEngineService {
  private adapters: IDataProvider[];

  constructor() {
    // Cascata de provedores: Oficial -> Fallback -> Alternativo -> Contatos
    this.adapters = [
      new BrasilApiAdapter(),
      new CnpjWsAdapter(),
      new GooglePlacesAdapter(),
      new ApolloAdapter(),
    ];
  }

  async enrich(query: { cnpj?: string; name?: string; domain?: string; location?: string }): Promise<IEnrichmentResult> {
    const startTime = Date.now();
    let mergedResult = this.createEmptyResult();
    const cnpjsConsultados: string[] = [];

    if (query.cnpj) {
       cnpjsConsultados.push(sanitizeCnpj(query.cnpj));
    }

    for (const adapter of this.adapters) {
      try {
         // Otimização: Se for Google/Apollo, passamos o nome descoberto se query.name estiver vazio
         const adapterQuery = { ...query };
         if (!adapterQuery.name && mergedResult.company.tradeName) {
             adapterQuery.name = mergedResult.company.tradeName;
         }

         const result = await adapter.enrich(adapterQuery);

         if (Object.keys(result).length > 0) {
            mergedResult = this.mergeResults(mergedResult, result as IEnrichmentResult);

            // Logica de Fallback CNPJ: Se o BrasilApiAdapter trouxe dados da empresa, pulamos o CnpjWs
            if (adapter.providerName === 'BrasilAPI' && mergedResult.company.cnpj) {
                // Remove o CnpjWsAdapter da cascata desta execucao pois já temos os dados oficiais
                this.adapters = this.adapters.filter(a => a.providerName !== 'CNPJ.ws');
            }
         }
      } catch (error) {
         console.error(`[MergeEngine] Error calling adapter ${adapter.providerName}:`, error);
      }
    }

    mergedResult.enrichment.executionTime = Date.now() - startTime;
    mergedResult.enrichment.timestamp = new Date().toISOString();

    return mergedResult;
  }

  private createEmptyResult(): IEnrichmentResult {
    return {
      company: {},
      address: {},
      contacts: { phones: [], emails: [], decisionMakers: [] },
      social: {},
      enrichment: {
        sources: [],
        confidence: { company: 0, address: 0, contacts: 0, social: 0 },
        timestamp: new Date().toISOString(),
        executionTime: 0
      }
    };
  }

  private mergeResults(current: IEnrichmentResult, incoming: IEnrichmentResult): IEnrichmentResult {
    const next = { ...current };

    if (!incoming.enrichment) return next;

    const currentConfidence = next.enrichment.confidence;
    const incomingConfidence = incoming.enrichment.confidence;

    // Regra de ouro: Só sobrescrever campos se a confiança da fonte entrante for maior que a atual

    if (incoming.company && incomingConfidence.company > currentConfidence.company) {
       next.company = { ...next.company, ...incoming.company };
       currentConfidence.company = incomingConfidence.company;
    }

    if (incoming.address && incomingConfidence.address > currentConfidence.address) {
       next.address = { ...next.address, ...incoming.address };
       currentConfidence.address = incomingConfidence.address;
    }

    // Contatos (Emails e telefones) unimos, não sobrescrevemos destrutivamente
    if (incoming.contacts) {
        if (incoming.contacts.phones?.length) {
            next.contacts.phones = Array.from(new Set([...next.contacts.phones, ...incoming.contacts.phones]));
        }
        if (incoming.contacts.emails?.length) {
            next.contacts.emails = Array.from(new Set([...next.contacts.emails, ...incoming.contacts.emails]));
        }
        if (incoming.contacts.decisionMakers?.length) {
            // Em tese seria um dedup por email ou linkedin
            next.contacts.decisionMakers = [...next.contacts.decisionMakers, ...incoming.contacts.decisionMakers];
        }
        if (incomingConfidence.contacts > currentConfidence.contacts) {
            currentConfidence.contacts = incomingConfidence.contacts;
        }
    }

    if (incoming.social && incomingConfidence.social > currentConfidence.social) {
       next.social = { ...next.social, ...incoming.social };
       currentConfidence.social = incomingConfidence.social;
    }

    // Merge metadata
    next.enrichment.sources = [...next.enrichment.sources, ...(incoming.enrichment.sources || [])];

    return next;
  }
}
