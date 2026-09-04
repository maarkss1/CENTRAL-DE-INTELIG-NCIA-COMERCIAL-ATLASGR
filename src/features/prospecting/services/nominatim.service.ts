import { logger } from '../../../lib/logger';
import type { PlaceCandidate, PlaceSearchResult } from './places.service';
import { fetchWithTimeout } from '../../../lib/http.js';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_HEADERS = {
  'User-Agent': 'ProspectorAtlas/1.0 (commercial-prospecting; contact=local-app)',
  Accept: 'application/json',
};

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
}

interface NominatimPlace {
  address?: NominatimAddress;
  extratags?: Record<string, string>;
  namedetails?: { name?: string };
  name?: string;
  display_name?: string;
  osm_type?: string;
  osm_id?: number;
  place_id?: number;
}

async function fetchNominatim(query: string, count: number): Promise<NominatimPlace[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    limit: String(Math.min(Math.max(count, 1), 20)),
  });
  const res = await fetchWithTimeout(
    `${NOMINATIM_BASE_URL}?${params.toString()}`,
    {
      method: 'GET',
      headers: NOMINATIM_HEADERS,
    },
    10_000,
    ['nominatim.openstreetmap.org'],
  );

  if (!res.ok) {
    logger.error({ status: res.status, body: await res.text() }, 'Nominatim error');
    return [];
  }

  return res.json();
}

/** Busca candidatos reais de empresas por categoria+região via OpenStreetMap Nominatim. */
export async function searchNominatimCandidates(
  query: string,
  count: number,
): Promise<PlaceCandidate[]> {
  if (!query.trim()) return [];

  try {
    const data = await fetchNominatim(query, count);

    return data.map((p) => {
      const addr = p.address || {};
      const city = addr.city || addr.town || addr.village;
      const state = addr.state;
      const tags = p.extratags || {};

      const tradeName =
        p.namedetails?.name || p.name || p.display_name?.split(',')[0] || 'Empresa sem nome';

      return {
        tradeName,
        address: p.display_name,
        city,
        state,
        rating: undefined,
        userRatingCount: undefined,
        phone: tags.phone || tags['contact:phone'],
        website: tags.website || tags['contact:website'],
      } satisfies PlaceCandidate;
    });
  } catch (error) {
    logger.error({ err: error, query }, 'Error searching Nominatim candidates');
    return [];
  }
}

/** Busca um estabelecimento específico usando somente dados abertos do OpenStreetMap. */
export async function searchNominatimPlace(
  companyName: string,
  locationStr: string,
): Promise<PlaceSearchResult | null> {
  const query = `${companyName} ${locationStr}`.trim();
  if (!query) return null;

  try {
    const [place] = await fetchNominatim(query, 1);
    if (!place) return null;

    const tags = place.extratags || {};
    return {
      id: `osm:${place.osm_type || 'place'}:${place.osm_id || place.place_id}`,
      displayName:
        place.namedetails?.name || place.name || place.display_name?.split(',')[0] || companyName,
      formattedAddress: place.display_name,
      nationalPhoneNumber: tags.phone || tags['contact:phone'],
      websiteUri: tags.website || tags['contact:website'],
    };
  } catch (error) {
    logger.error({ err: error, companyName, locationStr }, 'Error searching Nominatim place');
    return null;
  }
}
