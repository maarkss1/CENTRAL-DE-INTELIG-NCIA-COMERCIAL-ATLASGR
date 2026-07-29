import { IDataProvider } from './IDataProvider';
import { IProspectingFilter } from '../../../types/prospecting';
import { IEnrichmentResult } from '../../../types/enrichment';
import { searchGooglePlace } from '../../../features/prospecting/services/places.service';

export class GooglePlacesAdapter implements IDataProvider {
  providerName = 'Google Places';

  async search(_filters: IProspectingFilter): Promise<Partial<IEnrichmentResult>[]> {
    return [];
  }

  async enrich(query: { cnpj?: string; name?: string; domain?: string; location?: string }): Promise<Partial<IEnrichmentResult>> {
    const startTime = Date.now();
    
    if (!query.name) {
      return {};
    }

    try {
      const place = await searchGooglePlace(query.name, query.location || '');
      if (!place) {
        return {};
      }

      return {
        address: {
           fullAddress: place.formattedAddress,
        },
        contacts: {
          phones: place.nationalPhoneNumber ? [place.nationalPhoneNumber] : [],
          emails: [],
          decisionMakers: []
        },
        social: {
          website: place.websiteUri
        },
        company: {
          googleRating: place.rating,
          googleReviewsCount: place.userRatingCount,
          businessHours: place.businessHours,
        },
        enrichment: {
          sources: [{ sourceName: this.providerName, extractedAt: new Date().toISOString() }],
          confidence: {
            company: 0,
            address: 85,
            contacts: 90, // Telefones do Google tendem a ser muito precisos/atualizados
            social: 100 // O site no GMB costuma ser exato
          },
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startTime
        }
      };

    } catch (error: unknown) {
       console.error(`[GooglePlacesAdapter] Request failed for ${query.name}:`, error);
       return {};
    }
  }
}
