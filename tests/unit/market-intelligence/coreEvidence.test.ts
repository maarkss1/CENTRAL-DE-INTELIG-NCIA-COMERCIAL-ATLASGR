import { describe, expect, it } from 'vitest';
import type { MunicipalityRecord } from '../../../src/features/market-intelligence/domain/MarketIntelligence';
import {
    buildCoreTerritories,
    CORE_DECISION_MAX_RADIUS_KM,
    hydrateCoreEvidence,
} from '../../../src/features/market-intelligence/domain/coreEvidence';

function municipality(overrides: Partial<MunicipalityRecord> & Pick<MunicipalityRecord, 'ibgeCode' | 'name' | 'uf'>): MunicipalityRecord {
    return {
        ibgeCode: overrides.ibgeCode,
        name: overrides.name,
        uf: overrides.uf,
        region: 'Sudeste',
        latitude: -21.17,
        longitude: -47.81,
        icp: { total: 100, tierA: 20, tierB: 30, tierC: 50 },
        rntrc: { transporters: 100, etc: 30, tac: 60, ctc: 10, etcEquiparada: 0, activeVehicles: 300, tractionVehicles: 180, implements: 120 },
        mdfe: { trips: null, manifests: null, tonnes: null, tku: null, interstateShare: null },
        risk: { cargoRobbery: 10, vehicleRobbery: 20, vehicleTheft: 30, geography: 'PROXY_UF' },
        competition: { censusStatus: 'PESQUISA_PARCIAL', verifiedPresences: 1, directRiskManagement: 0, tracking: 0, monitoring: 0, readyResponse: 0, nationalRemoteCoverage: 0 },
        scores: {
            demand: { value: 80, confidence: 0.9, availability: 'OBSERVADO' },
            risk: { value: 70, confidence: 0.5, availability: 'PROXY', reason: 'Sinesp por UF' },
            competitionPressure: { value: null, confidence: 0, availability: 'NAO_DISPONIVEL' },
            whiteSpace: { value: null, confidence: 0, availability: 'NAO_DISPONIVEL' },
            territorialEfficiency: { value: null, confidence: 0, availability: 'NAO_DISPONIVEL' },
            rawOpportunity: { value: null, confidence: 0, availability: 'NAO_DISPONIVEL' },
            confidenceAdjustedOpportunity: { value: null, confidence: 0, availability: 'NAO_DISPONIVEL' },
        },
        economics: { tamAccounts: 100, samAccounts: null, somAccounts: null, potentialMrr: null, breakEvenContracts: null, requiredPipeline: null },
        evidenceIds: ['ibge-bcim', 'cnpj', 'rntrc', 'sinesp-vde-uf'],
        ...overrides,
    };
}

describe('Market Intelligence Core Evidence v1.1', () => {
    it('libera score territorial sem fabricar White Space ou eficiência territorial', () => {
        const rows = [
            municipality({ ibgeCode: '1', name: 'A', uf: 'SP', rntrc: { transporters: 100, etc: 30, tac: 60, ctc: 10, etcEquiparada: 0, activeVehicles: 300, tractionVehicles: 180, implements: 120 } }),
            municipality({ ibgeCode: '2', name: 'B', uf: 'MG', rntrc: { transporters: 50, etc: 10, tac: 35, ctc: 5, etcEquiparada: 0, activeVehicles: 150, tractionVehicles: 90, implements: 60 }, scores: {
                ...municipality({ ibgeCode: 'x', name: 'x', uf: 'MG' }).scores,
                demand: { value: 40, confidence: 0.9, availability: 'OBSERVADO' },
                risk: { value: 30, confidence: 0.5, availability: 'PROXY' },
            } }),
        ];

        const hydrated = hydrateCoreEvidence(
            rows,
            [{ ibgeCode: '1', trips: 1000 }, { ibgeCode: '2', trips: 100 }],
            [{ ibgeCode: '1', trips: 500 }, { ibgeCode: '2', trips: 50 }],
        );

        expect(hydrated[0].mdfe.trips).toBe(1500);
        expect(hydrated[0].scores.confidenceAdjustedOpportunity.value).not.toBeNull();
        expect(hydrated[0].scores.confidenceAdjustedOpportunity.availability).toBe('ESTIMADO');
        expect(hydrated[0].scores.whiteSpace.value).toBeNull();
        expect(hydrated[0].scores.territorialEfficiency.value).toBeNull();
        expect(hydrated[0].evidenceIds).toContain('mdfe-ciot');
        expect(hydrated[0].scores.confidenceAdjustedOpportunity.value!)
            .toBeGreaterThan(hydrated[1].scores.confidenceAdjustedOpportunity.value!);
    });

    it('continua bloqueado quando um componente Core Evidence obrigatório não existe', () => {
        const row = municipality({
            ibgeCode: '1', name: 'A', uf: 'SP',
            scores: {
                ...municipality({ ibgeCode: 'x', name: 'x', uf: 'SP' }).scores,
                risk: { value: null, confidence: 0, availability: 'NAO_DISPONIVEL' },
            },
        });
        const [hydrated] = hydrateCoreEvidence([row], [{ ibgeCode: '1', trips: 100 }], []);
        expect(hydrated.scores.confidenceAdjustedOpportunity.value).toBeNull();
        expect(hydrated.scores.confidenceAdjustedOpportunity.reason).toContain('need:');
    });

    it('gera territórios decisórios sem ultrapassar o raio conservador enquanto eficiência viária não está calibrada', () => {
        const rows = hydrateCoreEvidence([
            municipality({ ibgeCode: '1', name: 'Ribeirão Preto', uf: 'SP', latitude: -21.17, longitude: -47.81, icp: { total: 500, tierA: 120, tierB: 180, tierC: 200 } }),
            municipality({ ibgeCode: '2', name: 'Sertãozinho', uf: 'SP', latitude: -21.13, longitude: -47.99, icp: { total: 150, tierA: 30, tierB: 50, tierC: 70 } }),
        ], [{ ibgeCode: '1', trips: 2000 }, { ibgeCode: '2', trips: 500 }], []);

        const territories = buildCoreTerritories(rows);
        expect(territories.length).toBeGreaterThan(0);
        expect(territories[0].opportunityScore).not.toBeNull();
        expect(territories[0].icp.total).toBeGreaterThan(0);
        expect(territories[0].evidenceIds).toContain('mdfe-ciot');
        expect(territories.every((territory) => territory.radiusKm <= CORE_DECISION_MAX_RADIUS_KM)).toBe(true);
    });
});
