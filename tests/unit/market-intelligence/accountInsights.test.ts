import { describe, expect, it } from 'vitest';
import {
  computeAccountScore,
  decideNextBestAction,
  ACCOUNT_SCORE_VERSION,
} from '@/features/market-intelligence/domain/accountInsights.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');

describe('computeAccountScore — nunca fabrica dimensão sem dado real', () => {
  it('devolve tudo zerado, explicado, quando não há nenhum dado real', () => {
    const result = computeAccountScore({ lookalikeScore: null, activeSignals: [], decisionMakers: [] }, NOW);

    expect(result).toMatchObject({ fit: 0, timing: 0, intent: 0, relationship: 0, total: 0 });
    expect(result.calculation.scoreVersion).toBe(ACCOUNT_SCORE_VERSION);
    expect(result.negativeReasons).toHaveLength(4);
    expect(result.positiveReasons).toHaveLength(0);
    // Nenhum motivo pode ser um texto canônico fixo desacoplado do dado — cada um cita a ausência
    // real observada (sem lookalike, sem sinal, sem decisor), não um "não disponível" genérico.
    expect(result.negativeReasons.join(' ')).toMatch(/lookalike/i);
    expect(result.negativeReasons.join(' ')).toMatch(/sinal ativo/i);
    expect(result.negativeReasons.join(' ')).toMatch(/decisor/i);
  });

  it('usa o lookalikeScore real como fit, sem reinterpretar o número', () => {
    const result = computeAccountScore({ lookalikeScore: 72, activeSignals: [], decisionMakers: [] }, NOW);

    expect(result.fit).toBe(72);
    expect(result.calculation.fit.reason).toContain('72');
    expect(result.positiveReasons).toContain(result.calculation.fit.reason);
  });

  it('escala timing pela recência real do sinal ativo mais recente', () => {
    const fresh = computeAccountScore(
      { lookalikeScore: null, activeSignals: [{ type: 'news_mention', detectedAt: new Date('2026-08-25T12:00:00.000Z') }], decisionMakers: [] },
      NOW,
    );
    const stale = computeAccountScore(
      { lookalikeScore: null, activeSignals: [{ type: 'news_mention', detectedAt: new Date('2026-05-01T12:00:00.000Z') }], decisionMakers: [] },
      NOW,
    );

    expect(fresh.timing).toBe(100);
    expect(stale.timing).toBeLessThan(fresh.timing);
    expect(stale.timing).toBeGreaterThan(0);
  });

  it('usa o sinal mais recente entre vários, não o mais antigo nem uma média', () => {
    const result = computeAccountScore(
      {
        lookalikeScore: null,
        activeSignals: [
          { type: 'news_mention', detectedAt: new Date('2026-05-01T12:00:00.000Z') },
          { type: 'expansion', detectedAt: new Date('2026-08-26T12:00:00.000Z') },
        ],
        decisionMakers: [],
      },
      NOW,
    );

    expect(result.timing).toBe(100);
  });

  it('escala intent pela quantidade de tipos distintos de sinal ativo, não pela contagem bruta', () => {
    const sameType = computeAccountScore(
      {
        lookalikeScore: null,
        activeSignals: [
          { type: 'news_mention', detectedAt: NOW },
          { type: 'news_mention', detectedAt: NOW },
          { type: 'news_mention', detectedAt: NOW },
        ],
        decisionMakers: [],
      },
      NOW,
    );
    const distinctTypes = computeAccountScore(
      {
        lookalikeScore: null,
        activeSignals: [
          { type: 'news_mention', detectedAt: NOW },
          { type: 'expansion', detectedAt: NOW },
        ],
        decisionMakers: [],
      },
      NOW,
    );

    expect(distinctTypes.intent).toBeGreaterThan(sameType.intent);
  });

  it('pondera relationship por confiança média e quantidade real de decisores ativos, ignora inativos', () => {
    const oneWeak = computeAccountScore(
      { lookalikeScore: null, activeSignals: [], decisionMakers: [{ status: 'Active', confidence: 0.4 }] },
      NOW,
    );
    const oneStrong = computeAccountScore(
      { lookalikeScore: null, activeSignals: [], decisionMakers: [{ status: 'Active', confidence: 0.9 }] },
      NOW,
    );
    const ignoresInactive = computeAccountScore(
      { lookalikeScore: null, activeSignals: [], decisionMakers: [{ status: 'Inactive', confidence: 0.9 }] },
      NOW,
    );

    expect(oneStrong.relationship).toBeGreaterThan(oneWeak.relationship);
    expect(ignoresInactive.relationship).toBe(0);
  });

  it('total nunca excede 100 nem fica negativo mesmo no melhor caso possível', () => {
    const result = computeAccountScore(
      {
        lookalikeScore: 100,
        activeSignals: [
          { type: 'news_mention', detectedAt: NOW },
          { type: 'expansion', detectedAt: NOW },
          { type: 'hiring', detectedAt: NOW },
        ],
        decisionMakers: [
          { status: 'Active', confidence: 1 },
          { status: 'Active', confidence: 1 },
          { status: 'Active', confidence: 1 },
        ],
      },
      NOW,
    );

    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});

describe('decideNextBestAction — decisão determinística citando os números reais que a motivaram', () => {
  it('recomenda RESEARCH_MORE quando não há absolutamente nenhuma evidência', () => {
    const decision = decideNextBestAction({
      fit: 0,
      hasLookalikeScore: false,
      activeSignalCount: 0,
      activeDecisionMakerCount: 0,
    });

    expect(decision.actionType).toBe('RESEARCH_MORE');
  });

  it('recomenda DISQUALIFY só quando fit é conhecido, muito baixo, e não há sinal nem decisor', () => {
    const decision = decideNextBestAction({
      fit: 5,
      hasLookalikeScore: true,
      activeSignalCount: 0,
      activeDecisionMakerCount: 0,
    });

    expect(decision.actionType).toBe('DISQUALIFY');
    expect(decision.rationale).toContain('5');
  });

  it('nunca desqualifica quando o fit simplesmente não foi calculado (hasLookalikeScore=false)', () => {
    const decision = decideNextBestAction({
      fit: 0,
      hasLookalikeScore: false,
      activeSignalCount: 1,
      activeDecisionMakerCount: 0,
    });

    expect(decision.actionType).not.toBe('DISQUALIFY');
  });

  it('prioriza CREATE_BITRIX_TASK quando há decisor ativo e sinal ativo ao mesmo tempo', () => {
    const decision = decideNextBestAction({
      fit: 40,
      hasLookalikeScore: true,
      activeSignalCount: 2,
      activeDecisionMakerCount: 1,
    });

    expect(decision.actionType).toBe('CREATE_BITRIX_TASK');
    expect(decision.priority).toBe(1);
    expect(decision.rationale).toContain('2');
    expect(decision.rationale).toContain('1');
  });

  it('recomenda CONTACT_DECISION_MAKER quando há decisor mas nenhum sinal recente', () => {
    const decision = decideNextBestAction({
      fit: 10,
      hasLookalikeScore: true,
      activeSignalCount: 0,
      activeDecisionMakerCount: 1,
    });

    expect(decision.actionType).toBe('CONTACT_DECISION_MAKER');
  });

  it('recomenda START_SDR_CADENCE quando há sinal mas nenhum decisor identificado', () => {
    const decision = decideNextBestAction({
      fit: 10,
      hasLookalikeScore: true,
      activeSignalCount: 3,
      activeDecisionMakerCount: 0,
    });

    expect(decision.actionType).toBe('START_SDR_CADENCE');
  });

  it('recomenda START_SDR_CADENCE por fit alto mesmo sem nenhum sinal ou decisor', () => {
    const decision = decideNextBestAction({
      fit: 80,
      hasLookalikeScore: true,
      activeSignalCount: 0,
      activeDecisionMakerCount: 0,
    });

    expect(decision.actionType).toBe('START_SDR_CADENCE');
    expect(decision.rationale).toContain('80');
  });

  it('recomenda WAIT_AND_MONITOR quando fit é baixo/moderado e não há nenhum gatilho', () => {
    const decision = decideNextBestAction({
      fit: 35,
      hasLookalikeScore: true,
      activeSignalCount: 0,
      activeDecisionMakerCount: 0,
    });

    expect(decision.actionType).toBe('WAIT_AND_MONITOR');
  });

  it('toda decisão inclui rationale, priority e expectedImpact não vazios', () => {
    const decision = decideNextBestAction({
      fit: 50,
      hasLookalikeScore: true,
      activeSignalCount: 1,
      activeDecisionMakerCount: 0,
    });

    expect(decision.rationale.length).toBeGreaterThan(10);
    expect(decision.expectedImpact.length).toBeGreaterThan(10);
    expect(decision.priority).toBeGreaterThan(0);
  });
});
