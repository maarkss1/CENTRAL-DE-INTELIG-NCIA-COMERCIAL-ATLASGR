import { describe, it, expect } from 'vitest';
import { calculateLeadScore } from '../../src/features/crm/domain/leadScoreCalculator';

describe('Onda 2 — Captura e Inteligência de Contas', () => {
    describe('1. Matriz de Qualificação & Lead Score (BANT / SPIN)', () => {
        it('calculates perfect score (100) for hot qualified lead', () => {
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
        });

        it('calculates warm score (Morno) for medium qualification', () => {
            const result = calculateLeadScore({
                budget: 'em_planejamento',
                authority: 'influenciador_gerente',
                need: 'moderada_otimizacao',
                timing: 'medio_90d',
            });

            expect(result.score).toBe(58);
            expect(result.temperature).toBe('Morno');
        });

        it('calculates cold score (Frio) for low qualification', () => {
            const result = calculateLeadScore({
                budget: 'sem_verba',
                authority: 'usuario_operacional',
                need: 'curiosidade_benchmarking',
                timing: 'longo_prazo',
            });

            expect(result.score).toBe(15);
            expect(result.temperature).toBe('Frio');
        });
    });

    describe('2. Agrupamento Matriz/Filiais por CNPJ Raiz', () => {
        it('identifies CNPJ root (first 8 digits) and filial identifier', () => {
            const cnpj = '00.360.305/0001-04';
            const clean = cnpj.replace(/\D/g, '');
            const root = clean.slice(0, 8);
            const branchNumber = clean.slice(8, 12);

            expect(root).toBe('00360305');
            expect(branchNumber).toBe('0001');
        });
    });
});
