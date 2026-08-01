import { logger } from '../../../lib/logger';
import { getPaidProspectingKey } from '../../../config/prospecting-integrations.js';
import { fetchWithTimeout } from '../../../lib/http.js';

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

/** Busca candidatos reais de empresas por categoria+região (ex: "Transportadora em Rio de Janeiro") via Google Places (New) Text Search. */
export async function searchGooglePlacesCandidates(query: string, count: number): Promise<PlaceCandidate[]> {
    const apiKey = getPaidProspectingKey('GOOGLE_MAPS_API_KEY');
    if (!apiKey || !query.trim()) return [];

    try {
        const res = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
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
        }, 12_000);

        if (!res.ok) {
            logger.error({ status: res.status, body: await res.text() }, 'Google Places (discovery) error');
            return [];
        }

        const data = await res.json();
        const places = data.places || [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return places.map((p: any) => {
            const components = p.addressComponents || [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const city = components.find((c: any) => c.types?.includes('administrative_area_level_2'))?.longText;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const state = components.find((c: any) => c.types?.includes('administrative_area_level_1'))?.shortText;
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

export async function searchGooglePlace(
    companyName: string,
    locationStr: string
): Promise<PlaceSearchResult | null> {
    const apiKey = getPaidProspectingKey('GOOGLE_MAPS_API_KEY');
    if (!apiKey) return null;

    const query = `${companyName} ${locationStr}`.trim();
    if (!query) return null;

    try {
        const res = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours',
            },
            body: JSON.stringify({
                textQuery: query,
                languageCode: 'pt-BR'
            }),
        }, 12_000);

        if (!res.ok) {
            logger.error({ status: res.status, body: await res.text() }, 'Google Places API error');
            return null;
        }

        const data = await res.json();
        const places = data.places || [];
        
        if (places.length === 0) {
            return null;
        }

        // Retorna o primeiro resultado (maior relevância)
        const p = places[0];
        
        return {
            id: p.id,
            displayName: p.displayName?.text || companyName,
            formattedAddress: p.formattedAddress,
            rating: p.rating,
            userRatingCount: p.userRatingCount,
            nationalPhoneNumber: p.nationalPhoneNumber,
            websiteUri: p.websiteUri,
            businessHours: p.regularOpeningHours
        };
    } catch (error) {
        logger.error({ err: error, companyName, locationStr }, 'Error fetching Google Place');
        return null;
    }
}
