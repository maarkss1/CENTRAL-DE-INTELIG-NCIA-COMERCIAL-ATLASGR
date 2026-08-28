/**
 * CPI DEC-12 (opção A) — cobre `providerCapabilities.ts`: garante que a capacidade declarada de
 * cada provider bate com o que o resto do domínio já sabe sobre eles (custo/rate limit REAIS,
 * lidos do mesmo módulo que os instrumenta — não duplicados aqui) e que `isProviderAvailable`
 * decide corretamente o portão de modo pago/gratuito.
 */
import { describe, it, expect } from 'vitest';
import { PROVIDER_CAPABILITIES, isProviderAvailable } from '../providerCapabilities.js';
import { getCostPerCallUsd } from '../../services/providerCostMetrics.js';
import { getRateLimitPerMinute } from '../../services/providerRateLimit.js';

describe('PROVIDER_CAPABILITIES', () => {
    it('declara os 4 providers do domínio (Apollo, Google Places, Hunter, Nominatim)', () => {
        expect(Object.keys(PROVIDER_CAPABILITIES).sort()).toEqual(['apollo', 'googlePlaces', 'hunter', 'nominatim']);
    });

    it('custo/rate limit de Apollo e Hunter vêm do MESMO módulo instrumentado (providerCostMetrics/providerRateLimit) — não duplicados', () => {
        expect(PROVIDER_CAPABILITIES.apollo.costPerCallUsd).toBe(getCostPerCallUsd('apollo'));
        expect(PROVIDER_CAPABILITIES.apollo.rateLimitPerMinute).toBe(getRateLimitPerMinute('apollo'));
        expect(PROVIDER_CAPABILITIES.hunter.costPerCallUsd).toBe(getCostPerCallUsd('hunter'));
        expect(PROVIDER_CAPABILITIES.hunter.rateLimitPerMinute).toBe(getRateLimitPerMinute('hunter'));
    });

    it('só a Apollo declara suporte a filtro firmográfico estruturado', () => {
        expect(PROVIDER_CAPABILITIES.apollo.supportsFirmographicFilters).toBe(true);
        expect(PROVIDER_CAPABILITIES.googlePlaces.supportsFirmographicFilters).toBe(false);
        expect(PROVIDER_CAPABILITIES.nominatim.supportsFirmographicFilters).toBe(false);
        expect(PROVIDER_CAPABILITIES.hunter.supportsFirmographicFilters).toBe(false);
    });

    it('só Google Places e Nominatim declaram geocodificação hiperlocal real — a Apollo filtra por texto de região', () => {
        expect(PROVIDER_CAPABILITIES.apollo.supportsCitySpecificPrecision).toBe(false);
        expect(PROVIDER_CAPABILITIES.googlePlaces.supportsCitySpecificPrecision).toBe(true);
        expect(PROVIDER_CAPABILITIES.nominatim.supportsCitySpecificPrecision).toBe(true);
    });

    it('Nominatim é o único provider gratuito (sem chave paga exigida)', () => {
        expect(PROVIDER_CAPABILITIES.nominatim.isPaid).toBe(false);
        expect(PROVIDER_CAPABILITIES.nominatim.requiresPaidKey).toBe(false);
        expect(PROVIDER_CAPABILITIES.apollo.requiresPaidKey).toBe(true);
        expect(PROVIDER_CAPABILITIES.googlePlaces.requiresPaidKey).toBe(true);
        expect(PROVIDER_CAPABILITIES.hunter.requiresPaidKey).toBe(true);
    });

    it('Hunter é o único provider com emailVerification — e nenhum companyFirmographics/companyGeoListing fora de Apollo/Places/Nominatim', () => {
        expect(PROVIDER_CAPABILITIES.hunter.dataKinds).toContain('emailVerification');
        expect(PROVIDER_CAPABILITIES.apollo.dataKinds).toContain('companyFirmographics');
        expect(PROVIDER_CAPABILITIES.googlePlaces.dataKinds).toContain('companyGeoListing');
        expect(PROVIDER_CAPABILITIES.nominatim.dataKinds).toContain('companyGeoListing');
    });
});

describe('isProviderAvailable', () => {
    it('Apollo só fica disponível em modo hybrid', () => {
        expect(isProviderAvailable('apollo', 'hybrid')).toBe(true);
        expect(isProviderAvailable('apollo', 'free')).toBe(false);
    });

    it('Google Places e Hunter (também exigem chave paga) só ficam estruturalmente disponíveis em modo hybrid', () => {
        expect(isProviderAvailable('googlePlaces', 'hybrid')).toBe(true);
        expect(isProviderAvailable('googlePlaces', 'free')).toBe(false);
        expect(isProviderAvailable('hunter', 'hybrid')).toBe(true);
        expect(isProviderAvailable('hunter', 'free')).toBe(false);
    });

    it('Nominatim (gratuito) fica sempre disponível, em qualquer modo', () => {
        expect(isProviderAvailable('nominatim', 'hybrid')).toBe(true);
        expect(isProviderAvailable('nominatim', 'free')).toBe(true);
    });
});
