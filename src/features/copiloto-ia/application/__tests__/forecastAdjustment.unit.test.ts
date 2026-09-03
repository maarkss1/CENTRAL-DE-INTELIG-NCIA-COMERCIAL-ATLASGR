import { describe, it, expect } from 'vitest';
import { computeAiProbabilityAdjustment } from '../forecastAdjustment';

describe('computeAiProbabilityAdjustment', () => {
  it('usa 50% como ponto de partida quando o CRM não tem probabilidade preenchida', () => {
    const result = computeAiProbabilityAdjustment({ crmProbability: null, dealHealthScore: 50 });
    expect(result.probabilityAi).toBe(50);
    expect(result.reasons[0]).toContain('50%');
  });

  it('parte da probabilidade real do CRM, nunca a ignora', () => {
    const result = computeAiProbabilityAdjustment({ crmProbability: 30, dealHealthScore: 50 });
    expect(result.probabilityAi).toBe(30);
    expect(result.reasons[0]).toContain('30%');
  });

  it('Health Score acima da média ajusta a probabilidade PARA CIMA, com motivo explícito', () => {
    const result = computeAiProbabilityAdjustment({ crmProbability: 50, dealHealthScore: 100 });
    // (100-50)*0.3 = 15, exatamente o teto
    expect(result.probabilityAi).toBe(65);
    expect(result.reasons.some((r) => r.includes('+15pp'))).toBe(true);
  });

  it('Health Score abaixo da média ajusta a probabilidade PARA BAIXO, com motivo explícito', () => {
    const result = computeAiProbabilityAdjustment({ crmProbability: 50, dealHealthScore: 0 });
    expect(result.probabilityAi).toBe(35);
    expect(result.reasons.some((r) => r.includes('-15pp'))).toBe(true);
  });

  it('nunca sai do intervalo [0, 100] mesmo em extremos', () => {
    const high = computeAiProbabilityAdjustment({ crmProbability: 95, dealHealthScore: 100 });
    expect(high.probabilityAi).toBeLessThanOrEqual(100);

    const low = computeAiProbabilityAdjustment({ crmProbability: 5, dealHealthScore: 0 });
    expect(low.probabilityAi).toBeGreaterThanOrEqual(0);
  });

  it('sempre devolve pelo menos uma razão — nunca um ajuste sem explicação', () => {
    const result = computeAiProbabilityAdjustment({ crmProbability: 60, dealHealthScore: 50 });
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
