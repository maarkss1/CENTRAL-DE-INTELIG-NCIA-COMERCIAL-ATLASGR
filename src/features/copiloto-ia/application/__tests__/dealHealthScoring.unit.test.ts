import { describe, it, expect } from 'vitest';
import { computeDealHealthScore } from '../dealHealthScoring';

describe('computeDealHealthScore', () => {
  it('usa 50 como base neutra quando sentimento é desconhecido, sem sinal nenhum', () => {
    const result = computeDealHealthScore({
      sentimentScore: null,
      unresolvedObjectionsCount: 0,
      buyingSignalsCount: 0,
      competitorMentionsCount: 0,
    });
    expect(result.score).toBe(50);
    expect(result.factors.sentimentBase).toBe(50);
  });

  it('sentimento Muito Positivo sem ruído nenhum dá o score mais alto', () => {
    const result = computeDealHealthScore({
      sentimentScore: 'Muito Positivo',
      unresolvedObjectionsCount: 0,
      buyingSignalsCount: 0,
      competitorMentionsCount: 0,
    });
    expect(result.score).toBe(90);
  });

  it('objeções não resolvidas penalizam, respeitando o teto de -30', () => {
    const result = computeDealHealthScore({
      sentimentScore: 'Positivo',
      unresolvedObjectionsCount: 10, // 10*8=80, mas o teto é 30
      buyingSignalsCount: 0,
      competitorMentionsCount: 0,
    });
    expect(result.factors.objectionPenalty).toBe(30);
    expect(result.score).toBe(70 - 30);
  });

  it('buying signals bonificam, respeitando o teto de +20', () => {
    const result = computeDealHealthScore({
      sentimentScore: 'Neutro / Cauteloso',
      unresolvedObjectionsCount: 0,
      buyingSignalsCount: 10, // 10*5=50, mas o teto é 20
      competitorMentionsCount: 0,
    });
    expect(result.factors.buyingSignalBonus).toBe(20);
    expect(result.score).toBe(50 + 20);
  });

  it('menção a concorrente penaliza menos que objeção, respeitando o teto de -15', () => {
    const result = computeDealHealthScore({
      sentimentScore: 'Positivo',
      unresolvedObjectionsCount: 0,
      buyingSignalsCount: 0,
      competitorMentionsCount: 10, // 10*5=50, mas o teto é 15
    });
    expect(result.factors.competitorPenalty).toBe(15);
    expect(result.score).toBe(70 - 15);
  });

  it('nunca sai do intervalo [0, 100] mesmo no pior cenário possível', () => {
    const result = computeDealHealthScore({
      sentimentScore: 'Negativo',
      unresolvedObjectionsCount: 999,
      buyingSignalsCount: 0,
      competitorMentionsCount: 999,
    });
    expect(result.score).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('combina todos os fatores de forma aditiva e reproduzível', () => {
    const result = computeDealHealthScore({
      sentimentScore: 'Positivo', // 70
      unresolvedObjectionsCount: 1, // -8
      buyingSignalsCount: 2, // +10
      competitorMentionsCount: 1, // -5
    });
    expect(result.score).toBe(70 - 8 + 10 - 5);
  });
});
