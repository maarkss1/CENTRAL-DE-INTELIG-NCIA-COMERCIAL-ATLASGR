import { describe, expect, it } from 'vitest';
import {
    calculateSellerEconomics,
    censusAllowsWhiteSpace,
    clampScore,
} from '../../../src/features/market-intelligence/domain/MarketIntelligence';

describe('Market Intelligence domain', () => {
    it('bloqueia White Space sem CENSO_COMPLETO', () => {
        expect(censusAllowsWhiteSpace('NAO_PESQUISADO')).toBe(false);
        expect(censusAllowsWhiteSpace('PESQUISA_PARCIAL')).toBe(false);
        expect(censusAllowsWhiteSpace('CENSO_COMPLETO')).toBe(true);
    });

    it('mantem scores dentro de 0-100', () => {
        expect(clampScore(-15)).toBe(0);
        expect(clampScore(44.2)).toBe(44.2);
        expect(clampScore(140)).toBe(100);
    });

    it('calcula break-even apenas com premissas validas', () => {
        const result = calculateSellerEconomics({
            salary: 6000,
            payrollCharges: 3000,
            benefits: 1000,
            vehicle: 2000,
            fuel: 1500,
            lodging: 1000,
            tolls: 500,
            commission: 0,
            tools: 500,
            administration: 500,
            averageMrrTicket: 2500,
            grossMarginPct: 60,
            winRatePct: 25,
            penetrationPct: 5,
            monthlyChurnPct: 1,
            salesCycleDays: 60,
        });

        expect(result.monthlyCost).toBe(16000);
        expect(result.contributionPerContract).toBe(1500);
        expect(result.breakEvenContracts).toBe(11);
        expect(result.breakEvenMrr).toBe(27500);
        expect(result.requiredQualifiedOpportunities).toBe(44);
    });

    it('nao divide por zero quando ticket, margem ou win rate estiverem ausentes', () => {
        const result = calculateSellerEconomics({
            salary: 5000,
            payrollCharges: 0,
            benefits: 0,
            vehicle: 0,
            fuel: 0,
            lodging: 0,
            tolls: 0,
            commission: 0,
            tools: 0,
            administration: 0,
            averageMrrTicket: 0,
            grossMarginPct: 0,
            winRatePct: 0,
            penetrationPct: 0,
            monthlyChurnPct: 0,
            salesCycleDays: 0,
        });

        expect(result.breakEvenContracts).toBeNull();
        expect(result.breakEvenMrr).toBeNull();
        expect(result.requiredQualifiedOpportunities).toBeNull();
    });
});
