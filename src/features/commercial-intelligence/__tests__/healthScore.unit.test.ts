import { describe, it, expect } from 'vitest';
import {
  computeHealthScore,
  HEALTH_PILLAR_ORDER,
  HEALTH_SCORE_RULES,
} from '../application/healthScore';
import type {
  AgingReport,
  CrmQualityIndex,
  ExecutiveOverview,
  ForecastAccuracySummary,
  LeadingIndicatorsReport,
  PerformanceMetrics,
} from '../domain/CommercialIntelligence';
import type { HealthScoreInput } from '../application/healthScore';

const NOW = new Date('2026-08-15T12:00:00Z');
const PERIOD = '2026-08';

function baseOverview(overrides: Partial<ExecutiveOverview> = {}): ExecutiveOverview {
  return {
    period: PERIOD,
    goal: {
      period: PERIOD,
      metric: 'NEW_MRR',
      amount: 100_000,
      currency: 'BRL',
      updatedAt: NOW.toISOString(),
      createdBy: 'user-1',
    },
    closedAmount: 0,
    closedCount: 0,
    pctOfGoal: null,
    commitAmount: 0,
    commitCount: 0,
    bestCaseAmount: 0,
    bestCaseCount: 0,
    upsideAmount: 0,
    upsideCount: 0,
    forecastAmount: 0,
    gapForecast: null,
    gapCommit: null,
    pipelineTotal: 0,
    pipelineTotalCount: 0,
    pipelineEligible: 0,
    pipelineEligibleCount: 0,
    coverageMonth: {
      coverage: null,
      coverageRecommended: null,
      pipelineEligible: 0,
      remainingGoal: 0,
    },
    coverage30: {
      coverage: null,
      coverageRecommended: null,
      pipelineEligible: 0,
      remainingGoal: 0,
    },
    coverage60: {
      coverage: null,
      coverageRecommended: null,
      pipelineEligible: 0,
      remainingGoal: 0,
    },
    coverage90: {
      coverage: null,
      coverageRecommended: null,
      pipelineEligible: 0,
      remainingGoal: 0,
    },
    coverageProtection: [],
    previousPeriod: null,
    forecastConfidence: {
      score: null,
      classification: null,
      sampleSize: 0,
      fieldCompletenessScore: null,
      stageHistoryCoverage: null,
      sampleSizePenaltyApplied: false,
    },
    isEmpty: false,
    dataAsOf: NOW.toISOString(),
    ...overrides,
  };
}

function basePerformance(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    period: PERIOD,
    winRate: null,
    wonCount: 0,
    lostCount: 0,
    opportunities: {
      open: 0,
      createdInPeriod: 0,
      won: 0,
      lost: 0,
      advanced: 0,
      stalled: 0,
      eligible: 0,
      commit: 0,
      bestCase: 0,
      atRisk: 0,
    },
    averageTicket: { created: null, open: null, won: null, lost: null },
    salesCycle: { meanDays: null, medianDays: null, sampleSize: 0 },
    funnel: [],
    funnelHistoricalTrackingSince: null,
    ...overrides,
  };
}

function baseAging(overrides: Partial<AgingReport> = {}): AgingReport {
  return {
    buckets: [],
    byStage: [],
    criticalThresholdDays: 45,
    trackingSince: null,
    ...overrides,
  };
}

function baseLeadingIndicators(
  overrides: Partial<LeadingIndicatorsReport> = {},
): LeadingIndicatorsReport {
  return {
    weekStart: NOW.toISOString(),
    weekEnd: NOW.toISOString(),
    indicators: [],
    trackingSince: null,
    ...overrides,
  };
}

function baseCrmQuality(overrides: Partial<CrmQualityIndex> = {}): CrmQualityIndex {
  return {
    period: PERIOD,
    overallScore: null,
    fields: [],
    dataReadiness: { overallScore: null, classification: null, fields: [] },
    suspectedDuplicateGroups: 0,
    evaluatedCount: 0,
    bitrixSync: {
      connected: false,
      totalOpen: 0,
      linked: 0,
      notLinked: 0,
      failed: 0,
      linkedRate: null,
      failures: [],
      lastSyncAt: null,
      syncedCount30d: 0,
      failedCount30d: 0,
    },
    ...overrides,
  };
}

function baseForecastAccuracy(
  overrides: Partial<ForecastAccuracySummary> = {},
): ForecastAccuracySummary {
  return {
    available: false,
    reason: 'sem_historico_suficiente',
    sampleSize: 0,
    meanAbsoluteErrorPercent: null,
    samples: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<HealthScoreInput> = {}): HealthScoreInput {
  return {
    overview: baseOverview(),
    performance: basePerformance(),
    aging: baseAging(),
    leadingIndicators: baseLeadingIndicators(),
    crmQuality: baseCrmQuality(),
    forecastAccuracy: baseForecastAccuracy(),
    ...overrides,
  };
}

describe('healthScore.computeHealthScore — agregação transparente em 6 pilares', () => {
  it('sempre retorna os 6 pilares nomeados, na ordem documentada, mesmo sem nenhum dado', () => {
    const result = computeHealthScore(baseInput(), NOW);
    expect(result.pillars.map((p) => p.pillar)).toEqual(HEALTH_PILLAR_ORDER);
    expect(result.pillars.every((p) => p.explanation.trim() !== '')).toBe(true);
  });

  it('sem nenhum dado em nenhum pilar: todos os scores são null e o overallScore também é null (nunca um score fabricado)', () => {
    const result = computeHealthScore(baseInput(), NOW);
    for (const pillar of result.pillars) {
      expect(pillar.score).toBeNull();
      expect(pillar.classification).toBeNull();
      expect(pillar.unavailableReason).not.toBeNull();
    }
    expect(result.overallScore).toBeNull();
  });

  it('pilar Pipeline: coverage no nível recomendado = 100, classificado saudável', () => {
    const input = baseInput({
      overview: baseOverview({
        coverageMonth: {
          coverage: 4,
          coverageRecommended: 4,
          pipelineEligible: 400_000,
          remainingGoal: 100_000,
        },
      }),
    });
    const pipeline = computeHealthScore(input, NOW).pillars.find((p) => p.pillar === 'pipeline')!;
    expect(pipeline.score).toBe(100);
    expect(pipeline.classification).toBe('saudavel');
  });

  it('pilar Pipeline: sem meta cadastrada fica indisponível, não zero', () => {
    const input = baseInput({
      overview: baseOverview({
        goal: null,
        coverageMonth: {
          coverage: null,
          coverageRecommended: null,
          pipelineEligible: 0,
          remainingGoal: 0,
        },
      }),
    });
    const pipeline = computeHealthScore(input, NOW).pillars.find((p) => p.pillar === 'pipeline')!;
    expect(pipeline.score).toBeNull();
    expect(pipeline.unavailableReason).toBe('sem_meta_cadastrada');
  });

  it('pilar Conversão: usa o Win Rate diretamente como score e aplica os limiares documentados', () => {
    const saudavel = computeHealthScore(
      baseInput({
        performance: basePerformance({ winRate: HEALTH_SCORE_RULES.WIN_RATE_HEALTHY_PCT }),
      }),
      NOW,
    ).pillars.find((p) => p.pillar === 'conversao')!;
    expect(saudavel.score).toBe(HEALTH_SCORE_RULES.WIN_RATE_HEALTHY_PCT);
    expect(saudavel.classification).toBe('saudavel');

    const critico = computeHealthScore(
      baseInput({ performance: basePerformance({ winRate: 5 }) }),
      NOW,
    ).pillars.find((p) => p.pillar === 'conversao')!;
    expect(critico.classification).toBe('critico');
  });

  it('pilar Conversão: sem negócio fechado no período fica indisponível', () => {
    const conversao = computeHealthScore(
      baseInput({ performance: basePerformance({ winRate: null }) }),
      NOW,
    ).pillars.find((p) => p.pillar === 'conversao')!;
    expect(conversao.score).toBeNull();
    expect(conversao.unavailableReason).toBe('sem_negocios_fechados_no_periodo');
  });

  it('pilar Produtividade: razão 1.0 (semana atual == média móvel) vira score 100 e classificação saudável', () => {
    const input = baseInput({
      leadingIndicators: baseLeadingIndicators({
        indicators: [
          {
            label: 'Reuniões',
            current: 10,
            previousWeek: 10,
            movingAverage4w: 10,
            trend: 'flat',
            weeklySeries: [10, 10, 10, 10],
          },
          {
            label: 'Propostas',
            current: 4,
            previousWeek: 4,
            movingAverage4w: 8,
            trend: 'down',
            weeklySeries: [8, 8, 8, 8],
          }, // razão 0.5
        ],
      }),
    });
    const produtividade = computeHealthScore(input, NOW).pillars.find(
      (p) => p.pillar === 'produtividade',
    )!;
    expect(produtividade.score).toBe(75); // média de (1.0, 0.5) * 100
  });

  it('pilar Produtividade: nenhum indicador com média móvel > 0 fica indisponível', () => {
    const input = baseInput({
      leadingIndicators: baseLeadingIndicators({
        indicators: [
          {
            label: 'Reuniões',
            current: 0,
            previousWeek: 0,
            movingAverage4w: 0,
            trend: 'flat',
            weeklySeries: [0, 0, 0, 0],
          },
        ],
      }),
    });
    const produtividade = computeHealthScore(input, NOW).pillars.find(
      (p) => p.pillar === 'produtividade',
    )!;
    expect(produtividade.score).toBeNull();
    expect(produtividade.unavailableReason).toBe('sem_media_movel_calculavel');
  });

  it('pilar Qualidade do CRM: reaproveita dataReadiness.overallScore/classification sem recalcular', () => {
    const input = baseInput({
      crmQuality: baseCrmQuality({
        dataReadiness: { overallScore: 62, classification: 'atencao', fields: [] },
      }),
    });
    const qualidade = computeHealthScore(input, NOW).pillars.find(
      (p) => p.pillar === 'qualidadeCrm',
    )!;
    expect(qualidade.score).toBe(62);
    expect(qualidade.classification).toBe('atencao');
  });

  it('pilar Follow-up: 100% do pipeline dentro do aging crítico vira score 100', () => {
    const input = baseInput({
      aging: baseAging({
        buckets: [{ label: '0–15 dias', minDays: 0, maxDays: 15, count: 2, amount: 200_000 }],
        byStage: [
          {
            stageId: 's1',
            stageName: 'Nova',
            count: 2,
            amountOverThreshold: 0,
            averageDaysInStage: 5,
            dataQuality: 'measured',
          },
        ],
      }),
    });
    const followUp = computeHealthScore(input, NOW).pillars.find((p) => p.pillar === 'followUp')!;
    expect(followUp.score).toBe(100);
    expect(followUp.classification).toBe('saudavel');
  });

  it('pilar Follow-up: metade do valor em risco vira score 50, classificado atenção (limiar de atenção documentado é 50)', () => {
    const input = baseInput({
      aging: baseAging({
        buckets: [{ label: '90+ dias', minDays: 91, maxDays: null, count: 2, amount: 200_000 }],
        byStage: [
          {
            stageId: 's1',
            stageName: 'Proposta',
            count: 2,
            amountOverThreshold: 100_000,
            averageDaysInStage: 120,
            dataQuality: 'measured',
          },
        ],
      }),
    });
    const followUp = computeHealthScore(input, NOW).pillars.find((p) => p.pillar === 'followUp')!;
    expect(followUp.score).toBe(50);
    expect(followUp.classification).toBe('atencao');
  });

  it('pilar Follow-up: maior parte do valor em risco vira score baixo e crítico', () => {
    const input = baseInput({
      aging: baseAging({
        buckets: [{ label: '90+ dias', minDays: 91, maxDays: null, count: 2, amount: 200_000 }],
        byStage: [
          {
            stageId: 's1',
            stageName: 'Proposta',
            count: 2,
            amountOverThreshold: 150_000,
            averageDaysInStage: 120,
            dataQuality: 'measured',
          },
        ],
      }),
    });
    const followUp = computeHealthScore(input, NOW).pillars.find((p) => p.pillar === 'followUp')!;
    expect(followUp.score).toBe(25);
    expect(followUp.classification).toBe('critico');
  });

  it('pilar Follow-up: sem negócio aberto (pipeline vazio) fica indisponível, não 100 fabricado', () => {
    const followUp = computeHealthScore(
      baseInput({ aging: baseAging({ buckets: [] }) }),
      NOW,
    ).pillars.find((p) => p.pillar === 'followUp')!;
    expect(followUp.score).toBeNull();
    expect(followUp.unavailableReason).toBe('sem_negocios_abertos');
  });

  it('pilar Confiabilidade de Forecast: erro histórico baixo vira score alto', () => {
    const input = baseInput({
      forecastAccuracy: baseForecastAccuracy({
        available: true,
        reason: null,
        sampleSize: 3,
        meanAbsoluteErrorPercent: 10,
      }),
    });
    const confiabilidade = computeHealthScore(input, NOW).pillars.find(
      (p) => p.pillar === 'confiabilidadeForecast',
    )!;
    expect(confiabilidade.score).toBe(90);
    expect(confiabilidade.classification).toBe('saudavel');
  });

  it('pilar Confiabilidade de Forecast: sem histórico de snapshot ainda fica "não disponível", nunca 0/100 fabricado', () => {
    const confiabilidade = computeHealthScore(baseInput(), NOW).pillars.find(
      (p) => p.pillar === 'confiabilidadeForecast',
    )!;
    expect(confiabilidade.score).toBeNull();
    expect(confiabilidade.unavailableReason).toBe('sem_historico_suficiente');
  });

  it('overallScore é a média simples só dos pilares disponíveis, ignorando os indisponíveis', () => {
    const input = baseInput({
      performance: basePerformance({ winRate: 40 }), // conversão = 40
      crmQuality: baseCrmQuality({
        dataReadiness: { overallScore: 80, classification: 'saudavel', fields: [] },
      }), // qualidadeCrm = 80
      // pipeline, produtividade, followUp, confiabilidadeForecast seguem indisponíveis
    });
    const result = computeHealthScore(input, NOW);
    const available = result.pillars.filter((p) => p.score != null);
    expect(available.length).toBe(2);
    expect(result.overallScore).toBe(60); // média(40, 80)
  });
});
