import { IDataProvider } from './IDataProvider';
import { IEnrichedLead, IProspectingFilter, ISourceData } from '../../../types/prospecting';

export class GooglePlacesAdapter implements IDataProvider {
  providerName = 'Google Places';

  async search(filters: IProspectingFilter): Promise<Partial<IEnrichedLead>[]> {
    // TODO: Implementar integração com Google Places API (TextSearch / NearbySearch)
    // Retorna resultados baseados no filter.segment e filter.city/state
    return [];
  }

  async enrich(lead: Partial<IEnrichedLead>): Promise<Partial<IEnrichedLead>> {
    // TODO: Implementar Google Place Details API (extrair reviews, rating, url, website)
    const source: ISourceData = {
      sourceName: this.providerName,
      extractedAt: new Date().toISOString(),
      confidence: 'Alto',
    };
    
    return {
      ...lead,
      // googleRating: 4.5,
      // googleReviewsCount: 100,
      sources: [...(lead.sources || []), source],
    };
  }
}
