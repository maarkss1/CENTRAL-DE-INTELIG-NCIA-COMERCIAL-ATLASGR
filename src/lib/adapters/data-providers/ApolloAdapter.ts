import { IDataProvider } from './IDataProvider';
import { IEnrichedLead, IProspectingFilter, ISourceData } from '../../../types/prospecting';

export class ApolloAdapter implements IDataProvider {
  providerName = 'Apollo.io';

  async search(filters: IProspectingFilter): Promise<Partial<IEnrichedLead>[]> {
    // TODO: Implementar POST https://api.apollo.io/v1/mixed_people/search
    // Mapear ICP e Persona filters para Organization e Person filters no Apollo
    return [];
  }

  async enrich(lead: Partial<IEnrichedLead>): Promise<Partial<IEnrichedLead>> {
    // Se tivermos dominio/site ou nome exato, buscamos a organization via Apollo
    const source: ISourceData = {
      sourceName: this.providerName,
      extractedAt: new Date().toISOString(),
      confidence: 'Alto',
    };

    return {
      ...lead,
      // technologies: ['React', 'Node'],
      // decisionMakers: [...],
      sources: [...(lead.sources || []), source],
    };
  }
}
