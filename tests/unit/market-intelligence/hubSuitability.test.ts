import { describe, expect, it } from 'vitest';
import {
    assessHubSuitability,
    materializeHubSuitabilityComponents,
    type HubSuitabilityPolicy,
    type HubSuitabilityRawRow,
} from '../../../src/features/market-intelligence/domain/hubSuitability';

const rows: HubSuitabilityRawRow[] = [
    {
        ibgeCode: '1111111', name: 'Hub A', uf: 'SP',
        icpAccounts: 1000, rntrcTransporters: 500, cargoFleet: 800,
        regicHierarchyRank: 1, roadDistanceToReferenceCenterKm: 10, nearestPublicAirportKm: 20,
        evidenceIds: ['cnpj', 'rntrc', 'senatran', 'regic', 'regic-road', 'anac-airports'],
    },
    {
        ibgeCode: '2222222', name: 'Hub B', uf: 'SP',
        icpAccounts: 500, rntrcTransporters: 250, cargoFleet: 400,
        regicHierarchyRank: 3, roadDistanceToReferenceCenterKm: 50, nearestPublicAirportKm: 80,
        evidenceIds: ['cnpj', 'rntrc', 'senatran', 'regic', 'regic-road', 'anac-airports'],
    },
    {
        ibgeCode: '3333333', name: 'Hub C', uf: 'SP',
        icpAccounts: 100, rntrcTransporters: 50, cargoFleet: 80,
        regicHierarchyRank: 8, roadDistanceToReferenceCenterKm: 150, nearestPublicAirportKm: 250,
        evidenceIds: ['cnpj', 'rntrc', 'senatran', 'regic', 'regic-road', 'anac-airports'],
    },
];

const policy: HubSuitabilityPolicy = {
    version: 'hub-policy-test-v1',
    weights: {
        icpMateriality: 1,
        rntrcMateriality: 1,
        cargoFleetMateriality: 1,
        urbanCentrality: 1,
        roadAccessibility: 1,
        airportAccessibility: 1,
    },
    requiredComponents: ['urbanCentrality', 'roadAccessibility', 'airportAccessibility'],
    minAggregateConfidence: 0.8,
    minOverallScore: 70,
};

describe('Hub Suitability v1', () => {
    it('materializa componentes observados mas mantém o score agregado bloqueado sem política', () => {
        const result = materializeHubSuitabilityComponents(rows);
        expect(result).toHaveLength(3);
        expect(result[0].overall.value).toBeNull();
        expect(result[0].overall.availability).toBe('NAO_DISPONIVEL');
        expect(result[0].components.icpMateriality.value).toBe(100);
        expect(result[0].components.urbanCentrality.value).toBe(100);
    });

    it('inverte percentis de hierarquia e distância: menor valor observado é melhor', () => {
        const [best, middle, worst] = materializeHubSuitabilityComponents(rows);
        expect(best.components.roadAccessibility.value).toBeGreaterThan(middle.components.roadAccessibility.value ?? -1);
        expect(middle.components.roadAccessibility.value).toBeGreaterThan(worst.components.roadAccessibility.value ?? -1);
        expect(best.components.airportAccessibility.value).toBe(100);
        expect(worst.components.airportAccessibility.value).toBe(0);
    });

    it('só calcula recomendação quando recebe política explícita e todos os componentes exigidos', () => {
        const [best] = materializeHubSuitabilityComponents(rows);
        const assessed = assessHubSuitability(best, policy);
        expect(assessed.record.overall.availability).toBe('ESTIMADO');
        expect(assessed.record.overall.value).toBe(100);
        expect(assessed.decisionEligible).toBe(true);
        expect(assessed.blockers).toEqual([]);
    });

    it('falha fechado quando uma evidência ponderada está ausente', () => {
        const [best] = materializeHubSuitabilityComponents([
            { ...rows[0], nearestPublicAirportKm: null },
        ]);
        const assessed = assessHubSuitability(best, policy);
        expect(assessed.decisionEligible).toBe(false);
        expect(assessed.record.overall.value).toBeNull();
        expect(assessed.blockers.some((blocker) => blocker.includes('airportAccessibility'))).toBe(true);
    });

    it('rejeita política com todos os pesos zerados', () => {
        const [best] = materializeHubSuitabilityComponents(rows);
        expect(() => assessHubSuitability(best, {
            ...policy,
            weights: {
                icpMateriality: 0,
                rntrcMateriality: 0,
                cargoFleetMateriality: 0,
                urbanCentrality: 0,
                roadAccessibility: 0,
                airportAccessibility: 0,
            },
        })).toThrow(/ao menos um peso positivo/i);
    });
});
