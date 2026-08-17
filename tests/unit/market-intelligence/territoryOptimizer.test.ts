import { describe, expect, it } from 'vitest';
import { haversineKm, optimizeTerritories, type OptimizerMunicipality } from '../../../src/features/market-intelligence/domain/territoryOptimizer';

const city = (
    ibgeCode: string,
    latitude: number,
    longitude: number,
    score: number,
    accounts: number,
): OptimizerMunicipality => ({
    ibgeCode,
    name: ibgeCode,
    uf: 'SP',
    latitude,
    longitude,
    adjustedOpportunityScore: score,
    icpAccounts: accounts,
    tierABAccounts: Math.round(accounts * 0.4),
    confidence: 0.9,
});

describe('Territory Optimizer', () => {
    it('calcula distancia geodesica em faixa plausivel', () => {
        const distance = haversineKm(
            city('A', -23.5505, -46.6333, 80, 100),
            city('B', -22.9068, -43.1729, 80, 100),
        );
        expect(distance).toBeGreaterThan(350);
        expect(distance).toBeLessThan(380);
    });

    it('nao usa municipio bloqueado na otimizacao', () => {
        const rows = [
            city('A', -23, -46, 90, 100),
            { ...city('B', -23.1, -46.1, 100, 1000), decisionBlocked: true },
        ];
        const result = optimizeTerritories(rows, 1);
        expect(result.territories).toHaveLength(1);
        expect(result.uniqueAccounts).toBe(100);
    });

    it('escolhe segundo territorio pelo valor incremental e evita duplicar cobertura', () => {
        const rows = [
            city('A', -10.0, -50.0, 95, 100),
            city('B', -10.3, -50.2, 92, 100),
            city('C', -20.0, -40.0, 88, 120),
            city('D', -20.2, -40.2, 84, 80),
        ];
        const result = optimizeTerritories(rows, 2, 1);
        expect(result.territories).toHaveLength(2);
        expect(new Set(result.territories.map((item) => item.base.ibgeCode)).size).toBe(2);
        expect(result.uniqueAccounts).toBe(400);
        expect(result.coverageEfficiency).toBeGreaterThan(0.5);
    });

    it('retorna cenario vazio sem vendedores', () => {
        const result = optimizeTerritories([], 0);
        expect(result.territories).toEqual([]);
        expect(result.coverageEfficiency).toBe(0);
    });
});
