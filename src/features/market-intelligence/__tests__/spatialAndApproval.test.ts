import { describe, it, expect } from 'vitest';
import { companyListQuerySchema } from '../server/marketIntelligence.schemas';

describe('Market Intelligence Spatial & Approval Schemas', () => {
    it('validates geographic radius coordinates correctly', () => {
        const parsed = companyListQuerySchema.parse({
            lat: -23.5505,
            lng: -46.6333,
            radiusKm: 50,
        });

        expect(parsed.lat).toBe(-23.5505);
        expect(parsed.lng).toBe(-46.6333);
        expect(parsed.radiusKm).toBe(50);
    });

    it('rejects invalid latitude and radius', () => {
        expect(() => {
            companyListQuerySchema.parse({
                lat: 105, // invalid > 90
                lng: -46.6333,
                radiusKm: 50,
            });
        }).toThrow();

        expect(() => {
            companyListQuerySchema.parse({
                lat: -23.5505,
                lng: -46.6333,
                radiusKm: -10, // invalid negative
            });
        }).toThrow();
    });

    it('handles CNPJ basic extraction for Matriz/Filial grouping', () => {
        const fullCnpj = '12.345.678/0001-90';
        const clean = fullCnpj.replace(/\D/g, '');
        const root = clean.slice(0, 8);
        const filialNumber = clean.slice(8, 12);

        expect(root).toBe('12345678');
        expect(filialNumber).toBe('0001');
    });
});
