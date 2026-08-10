import { describe, it, expect } from 'vitest';
import { scoreOpportunity, FORECAST_RULES } from '../application/forecastEngine';

const NOW = new Date('2026-08-10T12:00:00Z');

function baseSignals(overrides: Partial<Parameters<typeof scoreOpportunity>[0]> = {}) {
    return {
        amount: 100_000,
        stageProbability: 50,
        now: NOW,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        expectedCloseAt: null,
        lastInteraction: null,
        nextAction: null,
        daysInCurrentStage: null,
        stageAverageDurationDays: null,
        ...overrides,
    };
}

describe('forecastEngine.scoreOpportunity — motor determinístico (não-IA)', () => {
    it('parte sempre da probabilidade da etapa quando não há nenhum outro sinal', () => {
        // Sem next action, sem interação, sem data prevista: só os descontos correspondentes.
        const result = scoreOpportunity(baseSignals({ stageProbability: 50 }));
        expect(result.probability).toBe(50 - 15 - 10 - 5); // sem próxima ação, sem interação, sem data prevista
    });

    it('soma pontos positivos com próxima ação próxima e interação recente', () => {
        const result = scoreOpportunity(
            baseSignals({
                stageProbability: 50,
                nextAction: new Date('2026-08-15T00:00:00Z'), // 5 dias à frente
                lastInteraction: new Date('2026-08-08T00:00:00Z'), // 2 dias atrás
                expectedCloseAt: new Date('2026-08-20T00:00:00Z'), // 10 dias à frente
            })
        );
        expect(result.probability).toBe(50 + 10 + 5 + 5);
        expect(result.positiveFactors).toContain('Próxima ação agendada nos próximos dias');
        expect(result.positiveFactors).toContain('Interação recente (últimos 7 dias)');
        expect(result.positiveFactors).toContain('Fechamento previsto para os próximos 30 dias');
        expect(result.negativeFactors).toEqual([]);
    });

    it('penaliza próxima ação vencida há mais de uma semana', () => {
        const result = scoreOpportunity(
            baseSignals({
                stageProbability: 50,
                nextAction: new Date('2026-07-20T00:00:00Z'), // ~21 dias atrás
                lastInteraction: new Date('2026-08-05T00:00:00Z'),
                expectedCloseAt: new Date('2026-08-25T00:00:00Z'),
            })
        );
        expect(result.negativeFactors).toContain('Próxima ação vencida há mais de uma semana');
    });

    it('penaliza data prevista de fechamento vencida', () => {
        const result = scoreOpportunity(
            baseSignals({
                stageProbability: 60,
                nextAction: new Date('2026-08-12T00:00:00Z'),
                lastInteraction: new Date('2026-08-09T00:00:00Z'),
                expectedCloseAt: new Date('2026-08-01T00:00:00Z'), // já passou
            })
        );
        expect(result.negativeFactors).toContain('Data prevista de fechamento vencida');
    });

    it('penaliza estagnação só quando há histórico real (daysInCurrentStage e média ambos não-nulos)', () => {
        const withHistory = scoreOpportunity(
            baseSignals({
                stageProbability: 60,
                nextAction: new Date('2026-08-12T00:00:00Z'),
                lastInteraction: new Date('2026-08-09T00:00:00Z'),
                expectedCloseAt: new Date('2026-08-20T00:00:00Z'),
                daysInCurrentStage: 40,
                stageAverageDurationDays: 10, // 40 > 10 * 2
            })
        );
        expect(withHistory.negativeFactors).toContain('Parado na etapa há mais que o dobro do tempo médio histórico');

        const withoutHistory = scoreOpportunity(
            baseSignals({
                stageProbability: 60,
                nextAction: new Date('2026-08-12T00:00:00Z'),
                lastInteraction: new Date('2026-08-09T00:00:00Z'),
                expectedCloseAt: new Date('2026-08-20T00:00:00Z'),
                daysInCurrentStage: null, // sem LeadStageHistory ainda — nunca inventa o fator
                stageAverageDurationDays: null,
            })
        );
        expect(withoutHistory.negativeFactors).not.toContain('Parado na etapa há mais que o dobro do tempo médio histórico');
    });

    it('nunca sai do intervalo [0, 100]', () => {
        const veryLow = scoreOpportunity(baseSignals({ stageProbability: 0 }));
        expect(veryLow.probability).toBeGreaterThanOrEqual(0);

        const veryHigh = scoreOpportunity(
            baseSignals({
                stageProbability: 100,
                nextAction: new Date('2026-08-11T00:00:00Z'),
                lastInteraction: new Date('2026-08-09T00:00:00Z'),
                expectedCloseAt: new Date('2026-08-15T00:00:00Z'),
            })
        );
        expect(veryHigh.probability).toBeLessThanOrEqual(100);
    });

    it('classifica em Commit/BestCase/Pipeline/Upside conforme os limiares documentados', () => {
        expect(scoreOpportunity(baseSignals({ stageProbability: FORECAST_RULES.COMMIT_THRESHOLD, nextAction: new Date('2026-08-11'), lastInteraction: new Date('2026-08-09'), expectedCloseAt: new Date('2026-08-15') })).tier).toBe('Commit');
        expect(scoreOpportunity(baseSignals({ stageProbability: 45 })).tier).toBe('Pipeline'); // 45 - 15 - 10 - 5 = 15, ainda dentro de Pipeline
        expect(scoreOpportunity(baseSignals({ stageProbability: 5 })).tier).toBe('Upside');
    });

    it('valor ponderado = valor * probabilidade final', () => {
        const result = scoreOpportunity(baseSignals({ amount: 200_000, stageProbability: 80, nextAction: new Date('2026-08-11'), lastInteraction: new Date('2026-08-09'), expectedCloseAt: new Date('2026-08-15') }));
        expect(result.weightedValue).toBeCloseTo(200_000 * (result.probability / 100), 2);
    });
});
