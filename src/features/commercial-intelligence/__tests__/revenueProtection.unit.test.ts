import { describe, it, expect } from 'vitest';
import { deriveProtectionStatus, buildRevenueProtectionSnapshot } from '../application/revenueProtection';
import type { CommercialGoalDTO } from '../domain/CommercialIntelligence';

const GOAL: CommercialGoalDTO = { period: '2026-08', metric: 'NEW_MRR', amount: 100_000, currency: 'BRL', updatedAt: '2026-08-01T00:00:00Z', createdBy: 'user-1' };

describe('deriveProtectionStatus — status derivado de coverage vs. coverageRecommended (nunca o 2x/3x fixo do Cockpit legado)', () => {
    it('sem coverage ou sem coverageRecommended calculável: "unknown", nunca um status fabricado', () => {
        expect(deriveProtectionStatus(null, 4)).toBe('unknown');
        expect(deriveProtectionStatus(2, null)).toBe('unknown');
        expect(deriveProtectionStatus(2, 0)).toBe('unknown');
    });

    it('coverage abaixo de 70% do recomendado: crítico', () => {
        expect(deriveProtectionStatus(2, 4)).toBe('critical'); // 50% do recomendado
    });

    it('coverage entre 70% e 100% do recomendado: atenção', () => {
        expect(deriveProtectionStatus(3, 4)).toBe('attention'); // 75% do recomendado
    });

    it('coverage no ou acima do recomendado: saudável', () => {
        expect(deriveProtectionStatus(4, 4)).toBe('healthy'); // 100%
        expect(deriveProtectionStatus(8, 4)).toBe('healthy'); // 200%
    });
});

describe('buildRevenueProtectionSnapshot — um mês-calendário (M/M+1/M+2/M+3)', () => {
    it('sem meta cadastrada: remainingGoal=0, coverage null, status unknown mesmo com pipeline elegível', () => {
        const snap = buildRevenueProtectionSnapshot('2026-09', 'M+1', null, 0, 50_000, 4);
        expect(snap.goal).toBeNull();
        expect(snap.remainingGoal).toBe(0);
        expect(snap.coverage).toBeNull();
        expect(snap.status).toBe('unknown');
    });

    it('meta cadastrada, nada fechado ainda no mês: remainingGoal = meta cheia, coverage = pipeline/meta', () => {
        const snap = buildRevenueProtectionSnapshot('2026-08', 'M', GOAL, 0, 50_000, 2);
        expect(snap.remainingGoal).toBe(100_000);
        expect(snap.coverage).toBeCloseTo(0.5, 5);
        expect(snap.coverageRecommended).toBe(2);
        // coverage(0.5) / recomendado(2) = 25% -> crítico
        expect(snap.status).toBe('critical');
    });

    it('mês M com fechamento parcial: remainingGoal desconta o já fechado, nunca fica negativa mesmo se o fechado exceder a meta', () => {
        const snap = buildRevenueProtectionSnapshot('2026-08', 'M', GOAL, 40_000, 60_000, null);
        expect(snap.remainingGoal).toBe(60_000);
        const snapMetaBatida = buildRevenueProtectionSnapshot('2026-08', 'M', GOAL, 999_000, 60_000, null);
        expect(snapMetaBatida.remainingGoal).toBe(0);
        expect(snapMetaBatida.coverage).toBeNull(); // meta batida -> nunca divide por zero
    });

    it('pipeline elegível cobrindo 100%+ da meta restante e coverageRecommended baixo: saudável', () => {
        const snap = buildRevenueProtectionSnapshot('2026-10', 'M+2', GOAL, 0, 100_000, 1);
        expect(snap.coverage).toBe(1);
        expect(snap.status).toBe('healthy');
    });

    it('preserva period e label repassados', () => {
        const snap = buildRevenueProtectionSnapshot('2026-11', 'M+3', GOAL, 0, 10_000, 2);
        expect(snap.period).toBe('2026-11');
        expect(snap.label).toBe('M+3');
    });
});
