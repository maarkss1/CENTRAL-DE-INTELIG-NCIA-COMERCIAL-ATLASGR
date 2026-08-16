import { describe, it, expect } from 'vitest';
import { classifyCompleteness, weightedCompletenessScore, DEAL_FIELD_TESTS } from '../application/dataReadiness';

describe('dataReadiness', () => {
    describe('classifyCompleteness', () => {
        it('null quando o percentual é null (população vazia — nunca vira "crítico" por ausência de dado)', () => {
            expect(classifyCompleteness(null)).toBeNull();
        });

        it('saudavel a partir de 80%', () => {
            expect(classifyCompleteness(80)).toBe('saudavel');
            expect(classifyCompleteness(100)).toBe('saudavel');
        });

        it('atencao entre 50% e 79%', () => {
            expect(classifyCompleteness(50)).toBe('atencao');
            expect(classifyCompleteness(79)).toBe('atencao');
        });

        it('critico abaixo de 50%', () => {
            expect(classifyCompleteness(0)).toBe('critico');
            expect(classifyCompleteness(49)).toBe('critico');
        });
    });

    describe('weightedCompletenessScore', () => {
        it('null quando não há nenhuma entrada avaliável', () => {
            expect(weightedCompletenessScore([])).toBeNull();
            expect(weightedCompletenessScore([{ weight: 10, completeness: null }])).toBeNull();
        });

        it('ignora entradas com completeness null (população vazia daquele campo) em vez de contar como 0', () => {
            const score = weightedCompletenessScore([
                { weight: 10, completeness: 100 },
                { weight: 10, completeness: null },
            ]);
            expect(score).toBe(100);
        });

        it('pondera pelo peso relativo de cada campo', () => {
            // peso 30 em 100% + peso 10 em 0% = (30*100 + 10*0) / 40 = 75
            const score = weightedCompletenessScore([
                { weight: 30, completeness: 100 },
                { weight: 10, completeness: 0 },
            ]);
            expect(score).toBe(75);
        });
    });

    describe('DEAL_FIELD_TESTS', () => {
        it('amount: só considera preenchido quando > 0', () => {
            expect(DEAL_FIELD_TESTS.amount({ amount: 100 } as never)).toBe(true);
            expect(DEAL_FIELD_TESTS.amount({ amount: 0 } as never)).toBe(false);
        });

        it('productSkus: só considera preenchido quando o array não está vazio', () => {
            expect(DEAL_FIELD_TESTS.productSkus({ productSkus: ['SKU-1'] } as never)).toBe(true);
            expect(DEAL_FIELD_TESTS.productSkus({ productSkus: [] } as never)).toBe(false);
        });

        it('lossReason: verifica presença de texto', () => {
            expect(DEAL_FIELD_TESTS.lossReason({ lossReason: 'Preço' } as never)).toBe(true);
            expect(DEAL_FIELD_TESTS.lossReason({ lossReason: null } as never)).toBe(false);
        });
    });
});
