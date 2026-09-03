import { logger } from '../../../lib/logger';
import { getPaidProspectingKey } from '../../../config/prospecting-integrations.js';
import { fetchWithProviderRetry } from '../../../lib/enrichment/providerFetch.js';

export interface PlaceCandidate {
  tradeName: string;
  address?: string;
  city?: string;
  state?: string;
  rating?: number;
  userRatingCount?: number;
  phone?: string;
  website?: string;
}

interface GooglePlaceAddressComponent {
  types?: string[];
  longText?: string;
  shortText?: string;
}

interface GooglePlaceResult {
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GooglePlaceAddressComponent[];
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

interface GooglePlacesTextSearchResponse {
  places?: GooglePlaceResult[];
}

/** Busca candidatos reais de empresas por categoria+região (ex: "Transportadora em Rio de Janeiro") via Google Places (New) Text Search. */
export async function searchGooglePlacesCandidates(
  query: string,
  count: number,
): Promise<PlaceCandidate[]> {
  const apiKey = getPaidProspectingKey('GOOGLE_MAPS_API_KEY');
  if (!apiKey || !query.trim()) return [];

  try {
    const res = await fetchWithProviderRetry(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.addressComponents',
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'pt-BR',
          maxResultCount: Math.min(Math.max(count, 1), 20),
        }),
      },
      {
        timeoutMs: 12_000,
        providerName: 'GooglePlaces-TextSearch',
        billable: true,
        allowedHosts: ['places.googleapis.com'],
      },
    );

    if (!res.ok) {
      logger.error(
        { status: res.status, body: await res.text() },
        'Google Places (discovery) error',
      );
      return [];
    }

    const data = (await res.json()) as GooglePlacesTextSearchResponse;
    const places = data.places || [];

    return places.map((p) => {
      const components = p.addressComponents || [];
      const city = components.find((c) =>
        c.types?.includes('administrative_area_level_2'),
      )?.longText;
      const state = components.find((c) =>
        c.types?.includes('administrative_area_level_1'),
      )?.shortText;
      return {
        tradeName: p.displayName?.text || 'Empresa sem nome',
        address: p.formattedAddress,
        city,
        state,
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        phone: p.nationalPhoneNumber,
        website: p.websiteUri,
      } satisfies PlaceCandidate;
    });
  } catch (error) {
    logger.error({ err: error, query }, 'Error searching Google Places candidates');
    return [];
  }
}

export interface PlaceSearchResult {
  id: string;
  displayName: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  businessHours?: unknown;
  error?: string;
}

export interface PlaceSearchOutcome {
  place: PlaceSearchResult | null;
  /** Preenchido só quando a chamada de fato falhou (HTTP não-ok após retry, timeout, rede) —
   * distingue "provider respondeu que não existe esse lugar" de "provider quebrou/não respondeu",
   * que `searchGooglePlace` (mantido por compatibilidade com os chamadores existentes) não
   * consegue expressar porque devolve `null` nos dois casos. */
  error?: string;
}

/**
 * Mesma busca de `searchGooglePlace`, mas nunca faz o chamador confundir "não achamos esse lugar"
 * com "a Google Places quebrou" — usado por `enrichmentCascade.service.ts`, que precisa registrar
 * essa diferença no `EnrichmentLog` em vez de tratar as duas como sucesso silencioso.
 */
export async function searchGooglePlaceDetailed(
  companyName: string,
  locationStr: string,
): Promise<PlaceSearchOutcome> {
  const apiKey = getPaidProspectingKey('GOOGLE_MAPS_API_KEY');
  if (!apiKey) return { place: null };

  const query = `${companyName} ${locationStr}`.trim();
  if (!query) return { place: null };

  try {
    const res = await fetchWithProviderRetry(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours',
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'pt-BR',
        }),
      },
      {
        timeoutMs: 12_000,
        providerName: 'GooglePlaces-Search',
        billable: true,
        allowedHosts: ['places.googleapis.com'],
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ status: res.status, body: text }, 'Google Places API error');
      return { place: null, error: `Google Places respondeu ${res.status}: ${text.slice(0, 150)}` };
    }

    const data = await res.json();
    const places = data.places || [];

    if (places.length === 0) {
      return { place: null };
    }

    // Retorna o primeiro resultado (maior relevância)
    const p = places[0];

    return {
      place: {
        id: p.id,
        displayName: p.displayName?.text || companyName,
        formattedAddress: p.formattedAddress,
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        nationalPhoneNumber: p.nationalPhoneNumber,
        websiteUri: p.websiteUri,
        businessHours: p.regularOpeningHours,
      },
    };
  } catch (error) {
    logger.error({ err: error, companyName, locationStr }, 'Error fetching Google Place');
    return {
      place: null,
      error: error instanceof Error ? error.message : 'Falha ao consultar Google Places',
    };
  }
}

/** Mantido para os chamadores existentes (`enrichment.service.ts`) que só precisam do resultado
 * (não distinguem "não achou" de "provider falhou") — ver `searchGooglePlaceDetailed` acima para
 * quem precisa dessa distinção. */
export async function searchGooglePlace(
  companyName: string,
  locationStr: string,
): Promise<PlaceSearchResult | null> {
  const { place } = await searchGooglePlaceDetailed(companyName, locationStr);
  return place;
}
