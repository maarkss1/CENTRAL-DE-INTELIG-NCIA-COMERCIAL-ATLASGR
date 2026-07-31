import { logger } from '../../../lib/logger';
import { IEnrichmentResult } from '../../../types/enrichment';
import { IDataProvider } from '../../../lib/adapters/data-providers/IDataProvider';
import { BrasilApiAdapter } from '../../../lib/adapters/data-providers/BrasilApiAdapter';
import { CnpjWsAdapter } from '../../../lib/adapters/data-providers/CnpjWsAdapter';
import { GooglePlacesAdapter } from '../../../lib/adapters/data-providers/GooglePlacesAdapter';
import { ApolloAdapter } from '../../../lib/adapters/data-providers/ApolloAdapter';
import { sanitizeCnpj } from './cnpj.util';
import { normalizeCompanyDomain } from '../utils/domain';

export type EnrichmentQuery = {
  cnpj?: string;
  name?: string;
  domain?: string;
  location?: string;
};

export class MergeEngineService {
  private readonly adapters: IDataProvider[];

  constructor(adapters?: IDataProvider[]) {
    // Cascata de provedores: Oficial -> Fallback -> Alternativo -> Contatos
    this.adapters = adapters ?? [
      new BrasilApiAdapter(),
      new CnpjWsAdapter(),
      new GooglePlacesAdapter(),
      new ApolloAdapter(),
    ];
  }

  async enrich(query: EnrichmentQuery): Promise<IEnrichmentResult> {
    const startTime = Date.now();
    let mergedResult = this.createEmptyResult();
    const normalizedQuery = {
      ...query,
      cnpj: query.cnpj ? sanitizeCnpj(query.cnpj) : undefined,
      domain: normalizeCompanyDomain(query.domain),
    };
    let officialCompanyFound = false;

    for (const adapter of this.adapters) {
      if (adapter.providerName === 'CNPJ.ws' && officialCompanyFound) {
        continue;
      }

      try {
         // Propaga dados encontrados pelos provedores anteriores para os próximos da cascata.
         const adapterQuery = { ...normalizedQuery };
         if (!adapterQuery.name && mergedResult.company.tradeName) {
             adapterQuery.name = mergedResult.company.tradeName;
         }
         if (!adapterQuery.domain && mergedResult.social.website) {
             adapterQuery.domain = normalizeCompanyDomain(mergedResult.social.website);
         }

         const result = await adapter.enrich(adapterQuery);

         if (result.enrichment) {
            mergedResult = this.mergeResults(mergedResult, result);

            // Logica de Fallback CNPJ: Se o BrasilApiAdapter trouxe dados da empresa, pulamos o CnpjWs
            officialCompanyFound =
              adapter.providerName === 'BrasilAPI' &&
              Boolean(result.company?.cnpj);
         }
      } catch (error) {
         logger.error({ err: error, provider: adapter.providerName }, '[MergeEngine] Error calling adapter');
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

  private mergeResults(current: IEnrichmentResult, incoming: Partial<IEnrichmentResult>): IEnrichmentResult {
    const next: IEnrichmentResult = {
      ...current,
      company: { ...current.company },
      address: { ...current.address },
      contacts: {
        phones: [...current.contacts.phones],
        emails: [...current.contacts.emails],
        decisionMakers: [...current.contacts.decisionMakers],
      },
      social: { ...current.social },
      enrichment: {
        ...current.enrichment,
        confidence: { ...current.enrichment.confidence },
        sources: [...current.enrichment.sources],
      },
    };

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
            const contacts = [...next.contacts.decisionMakers, ...incoming.contacts.decisionMakers];
            const seen = new Set<string>();
            next.contacts.decisionMakers = contacts.filter((contact) => {
              const identity = [
                contact.email?.trim().toLowerCase(),
                contact.linkedin?.trim().toLowerCase(),
                contact.name.trim().toLowerCase(),
              ].filter(Boolean).join('|');
              if (seen.has(identity)) return false;
              seen.add(identity);
              return true;
            });
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
