import { IDataProvider } from './IDataProvider';
import { IEnrichedLead, IProspectingFilter, ISourceData } from '../../../types/prospecting';

export class BrasilApiAdapter implements IDataProvider {
  providerName = 'BrasilAPI';

  async search(filters: IProspectingFilter): Promise<Partial<IEnrichedLead>[]> {
    // BrasilAPI não possui endpoint de search aberto por filtros (segmento/cidade). 
    // Usualmente usado apenas para enrichment via CNPJ.
    return [];
  }

  async enrich(lead: Partial<IEnrichedLead>): Promise<Partial<IEnrichedLead>> {
    if (!lead.cnpj) return lead;

    // TODO: Implementar chamada GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}
    const source: ISourceData = {
      sourceName: this.providerName,
      extractedAt: new Date().toISOString(),
      confidence: 'Alto',
    };

    return {
      ...lead,
      // socialReason: "Exemplo S/A",
      // cadastralSituation: "ATIVA",
      // socialCapital: 100000,
      sources: [...(lead.sources || []), source],
    };
  }
}
