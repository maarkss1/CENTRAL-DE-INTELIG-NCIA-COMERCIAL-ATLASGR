import { describe, expect, it } from 'vitest';
import {
    analyzeWeightSensitivity,
    calculateOpportunityScore,
    calculateWhiteSpace,
    type OpportunityInputs,
} from '../../../src/features/market-intelligence/domain/scoreEngine';

const component = (value: number | null, confidence = 1) => ({ value, confidence });

function opportunity(seed: number): OpportunityInputs {
    return {
        icp: component(seed),
        rntrc: component(seed),
        mdfe: component(seed),
        need: component(seed),
        whiteSpace: component(seed),
        territorialEfficiency: component(seed),
    };
}

describe('Market Intelligence score engine', () => {
    it('bloqueia White Space sem censo completo', () => {
        const result = calculateWhiteSpace({
            demand: component(90),
            need: component(80),
            logistics: component(90),
            competitionPressure: component(10),
            censusStatus: 'PESQUISA_PARCIAL',
        });
        expect(result.value).toBeNull();
        expect(result.confidence).toBe(0);
        expect(result.blockedReason).toContain('PESQUISA_PARCIAL');
    });

    it('penaliza mercado saturado mesmo com demanda muito alta', () => {
        const open = calculateWhiteSpace({
            demand: component(95), need: component(85), logistics: component(90),
            competitionPressure: component(10), censusStatus: 'CENSO_COMPLETO',
        });
        const saturated = calculateWhiteSpace({
            demand: component(95), need: component(85), logistics: component(90),
            competitionPressure: component(99), censusStatus: 'CENSO_COMPLETO',
        });
        expect(open.value).not.toBeNull();
        expect(saturated.value).not.toBeNull();
        expect(saturated.value!).toBeLessThan(open.value! * 0.6);
    });

    it('separa score bruto de score ajustado por confiança', () => {
        const inputs = opportunity(80);
        Object.values(inputs).forEach((item) => { item.confidence = 0.5; });
        const result = calculateOpportunityScore(inputs);
        expect(result.raw).toBeCloseTo(80, 5);
        expect(result.aggregateConfidence).toBeCloseTo(0.5, 5);
        expect(result.adjusted).toBeCloseTo(40, 5);
    });

    it('bloqueia Opportunity quando componente ponderado está ausente', () => {
        const inputs = opportunity(80);
        inputs.mdfe = component(null, 0);
        const result = calculateOpportunityScore(inputs);
        expect(result.raw).toBeNull();
        expect(result.adjusted).toBeNull();
        expect(result.blockedReasons.some((reason) => reason.startsWith('mdfe:'))).toBe(true);
    });

    it('mede estabilidade do ranking sob perturbação de pesos', () => {
        const result = analyzeWeightSensitivity([
            { id: 'A', inputs: opportunity(90) },
            { id: 'B', inputs: opportunity(70) },
            { id: 'C', inputs: opportunity(50) },
        ]);
        expect(result.map((row) => row.id)).toEqual(['A', 'B', 'C']);
        expect(result.every((row) => row.stability === 'ALTA')).toBe(true);
        expect(result.every((row) => row.scenarios === 13)).toBe(true);
    });
});
