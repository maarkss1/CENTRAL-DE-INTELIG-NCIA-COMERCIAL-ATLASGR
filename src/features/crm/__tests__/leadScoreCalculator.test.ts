import { describe, it, expect } from 'vitest';
import { calculateLeadScore } from '../domain/leadScoreCalculator';

describe('Lead Score Calculator (BANT / SPIN)', () => {
    it('calculates perfect score (100) for ideal BANT qualification', () => {
        const result = calculateLeadScore({
            budget: 'aprovado',
            authority: 'decisor_clevel',
            need: 'critica_urgente',
            timing: 'imediato_30d',
            fuelCostPain: true,
        });

        expect(result.score).toBe(100);
        expect(result.temperature).toBe('Quente');
        expect(result.breakdown.budgetScore).toBe(25);
        expect(result.breakdown.authorityScore).toBe(25);
        expect(result.breakdown.needScore).toBe(25);
        expect(result.breakdown.timingScore).toBe(25);
        expect(result.recommendation).toContain('Alta propensão');
    });

    it('calculates warm score (Morno, 40-69) for partially qualified lead', () => {
        const result = calculateLeadScore({
            budget: 'em_planejamento', // 15
            authority: 'influenciador_gerente', // 18
            need: 'moderada_otimizacao', // 15
            timing: 'medio_90d', // 10
        });

        expect(result.score).toBe(58);
        expect(result.temperature).toBe('Morno');
        expect(result.recommendation).toContain('Lead qualificado');
    });

    it('calculates cold score (Frio, < 40) for unqualified lead', () => {
        const result = calculateLeadScore({
            budget: 'sem_verba', // 0
            authority: 'usuario_operacional', // 10
            need: 'curiosidade_benchmarking', // 5
            timing: 'longo_prazo', // 0
        });

        expect(result.score).toBe(15);
        expect(result.temperature).toBe('Frio');
        expect(result.recommendation).toContain('Qualificar dores');
    });

    it('handles empty input gracefully', () => {
        const result = calculateLeadScore({});

        expect(result.score).toBe(0);
        expect(result.temperature).toBe('Frio');
        expect(result.breakdown.budgetScore).toBe(0);
        expect(result.breakdown.authorityScore).toBe(0);
        expect(result.breakdown.needScore).toBe(0);
        expect(result.breakdown.timingScore).toBe(0);
    });

    it('supports legacy string values from CRM select', () => {
        const result = calculateLeadScore({
            authority: 'Decisor', // 25
            need: 'Alto', // 25
        });

        expect(result.score).toBe(50);
        expect(result.temperature).toBe('Morno');
        expect(result.breakdown.authorityScore).toBe(25);
        expect(result.breakdown.needScore).toBe(25);
    });
});
