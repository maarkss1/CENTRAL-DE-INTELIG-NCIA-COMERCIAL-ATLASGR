import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GooglePlacesAdapter } from '../GooglePlacesAdapter';
import * as placesService from '../../../../features/prospecting/services/places.service';

vi.mock('../../../../features/prospecting/services/places.service', () => ({
    searchGooglePlace: vi.fn()
}));

describe('GooglePlacesAdapter', () => {
    let adapter: GooglePlacesAdapter;

    beforeEach(() => {
        adapter = new GooglePlacesAdapter();
        vi.clearAllMocks();
    });

    it('deve retornar empty se o query name for vazio', async () => {
        const result = await adapter.enrich({ domain: 'google.com' });
        expect(result).toEqual({});
    });

    it('deve chamar searchGooglePlace com os dados preenchidos', async () => {
        (placesService.searchGooglePlace as any).mockResolvedValue({
            id: 'ChIJ123',
            displayName: 'Place Teste',
            formattedAddress: 'Rua das Flores 123',
            nationalPhoneNumber: '11 9999-9999',
            websiteUri: 'https://place.com'
        });

        const result = await adapter.enrich({ name: 'Place Teste', location: 'SP' });

        expect(placesService.searchGooglePlace).toHaveBeenCalledWith('Place Teste', 'SP');
        expect(result.address?.fullAddress).toBe('Rua das Flores 123');
        expect(result.contacts?.phones).toContain('11 9999-9999');
        expect(result.social?.website).toBe('https://place.com');
        expect(result.enrichment?.confidence.social).toBe(100);
        expect(result.enrichment?.confidence.contacts).toBe(90);
    });

    it('deve falhar graciosamente se searchGooglePlace der erro', async () => {
        (placesService.searchGooglePlace as any).mockRejectedValue(new Error('Network Error'));
        const result = await adapter.enrich({ name: 'Erro Teste' });
        expect(result).toEqual({});
    });
});
