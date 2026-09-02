import { describe, it, expect } from 'vitest';
import { CommercialIntelligenceUseCases } from '../application/CommercialIntelligenceUseCases';
import {
  scoreOpportunity,
  FORECAST_RULES,
  FORECAST_RULES_VERSION,
} from '../application/forecastEngine';
import { summarizeCloseDateChanges } from '../application/scoring/dealScoring';
import { diffTrackedFields } from '../../../shared/services/leadFieldChangeHistory.service';
import { InMemoryForecastSnapshotStore } from '../infra/InMemoryForecastSnapshotStore';
import type {
  CommercialIntelligenceRepository,
  DealRow,
  StageDefinition,
  CommercialGoalDTO,
  GoalMetric,
  LeadFieldChangeRow,
} from '../domain/CommercialIntelligence';

const NOW = new Date('2026-08-15T12:00:00Z');
const PERIOD = '2026-08';
const ORG = 'org-1';

const STAGES: StageDefinition[] = [
  {
    id: 'stage-nova',
    name: 'Nova Oportunidade',
    code: 'nova',
    sortOrder: 0,
    probability: 15,
    isWon: false,
    isLost: false,
  },
  {
    id: 'stage-proposta',
    name: 'Proposta Enviada',
    code: 'proposta',
    sortOrder: 1,
    probability: 45,
    isWon: false,
    isLost: false,
  },
  {
    id: 'stage-ganho',
    name: 'Negócios Ganhos',
    code: 'ganho',
    sortOrder: 2,
    probability: 100,
    isWon: true,
    isLost: false,
  },
  {
    id: 'stage-perdido',
    name: 'Negócios Perdidos',
    code: 'perdido',
    sortOrder: 3,
    probability: 0,
    isWon: false,
    isLost: true,
  },
];

function deal(overrides: Partial<DealRow> & { id: string }): DealRow {
  return {
    title: overrides.id,
    amount: 10_000,
    owner: 'ana',
    source: 'Indicação',
    companyId: 'company-1',
    companyName: 'Empresa Teste',
    companyCnpj: null,
    contactId: null,
    createdAt: new Date('2026-07-01T03:00:00Z'),
    updatedAt: new Date('2026-08-05T00:00:00Z'),
    closedAt: null,
    expectedCloseAt: new Date('2026-08-20T00:00:00Z'),
    lastInteraction: new Date('2026-08-13T00:00:00Z'),
    nextAction: new Date('2026-08-18T00:00:00Z'),
    lossReason: null,
    lossObservation: null,
    status: 'Nova_Oportunidade',
    bitrixLeadId: null,
    bitrixDealId: null,
    bitrixSyncStatus: null,
    bitrixSyncError: null,
    bitrixSyncedAt: null,
    pipelineId: 'pipeline-1',
    pipelineStageId: 'stage-nova',
    stageName: 'Nova Oportunidade',
    stageSortOrder: 0,
    stageProbability: 15,
    stageIsWon: false,
    stageIsLost: false,
    productSkus: [],
    icp: null,
    ...overrides,
  };
}

type HistoryRow = {
  leadId: string;
  stageId: string | null;
  stageName: string;
  enteredAt: Date;
  exitedAt: Date | null;
  isWon?: boolean;
  isLost?: boolean;
};

class FakeRepository implements CommercialIntelligenceRepository {
  goals = new Map<string, CommercialGoalDTO>();
  constructor(
    public deals: DealRow[] = [],
    public history: HistoryRow[] = [],
    public fieldChanges: LeadFieldChangeRow[] = [],
  ) {}
  async findDeals() {
    return this.deals;
  }
  async findDealPipelineStages() {
    return STAGES;
  }
  async countCompletedMeetings() {
    return 0;
  }
  async countTimelineEventsByType() {
    return 0;
  }
  async findCompletedMeetingDates() {
    return [];
  }
  async findTimelineEventDatesByType() {
    return [];
  }
  async findStageHistory() {
    return this.history;
  }
  async findFieldChanges(_org: string, field?: 'expectedCloseAt' | 'owner') {
    return field ? this.fieldChanges.filter((c) => c.field === field) : this.fieldChanges;
  }
  async countDuplicateCompanyGroupsAmongOpenDeals() {
    return 0;
  }
  async hasBitrixConnection() {
    return false;
  }
  async getBitrixSyncActivity() {
    return { lastSyncAt: null, syncedCount: 0, failedCount: 0 };
  }
  async getFilterOptions() {
    return { owners: [], products: [], sources: [], icps: [], companies: [] };
  }
  async getGoal(org: string, period: string, metric: GoalMetric) {
    return this.goals.get(`${org}:${period}:${metric}`) ?? null;
  }
  async getGoals(org: string, periods: string[], metric: GoalMetric) {
    const result = new Map<string, CommercialGoalDTO>();
    for (const p of periods) {
      const g = this.goals.get(`${org}:${p}:${metric}`);
      if (g) result.set(p, g);
    }
    return result;
  }
  async upsertGoal(
    org: string,
    period: string,
    metric: GoalMetric,
    amount: number,
    currency: string,
    createdBy: string,
  ) {
    const goal: CommercialGoalDTO = {
      period,
      metric,
      amount,
      currency,
      updatedAt: NOW.toISOString(),
      createdBy,
    };
    this.goals.set(`${org}:${period}:${metric}`, goal);
    return goal;
  }
}

function change(
  leadId: string,
  field: 'expectedCloseAt' | 'owner',
  previousValue: string | null,
  newValue: string | null,
  changedAt: string,
  source = 'crm',
): LeadFieldChangeRow {
  return {
    leadId,
    field,
    previousValue,
    newValue,
    changedBy: null,
    source,
    changedAt: new Date(changedAt),
  };
}

describe('forecastEngine v2 — adiamentos de data prevista (CLOSEDATE)', () => {
  const base = {
    amount: 100_000,
    stageProbability: 60,
    now: NOW,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    expectedCloseAt: new Date('2026-08-25T00:00:00Z'),
    lastInteraction: new Date('2026-08-14T00:00:00Z'),
    nextAction: new Date('2026-08-18T00:00:00Z'),
    daysInCurrentStage: null,
    stageAverageDurationDays: null,
  };

  it('a versão das regras subiu para v2 junto com o novo fator', () => {
    expect(FORECAST_RULES_VERSION).toBe('v2');
  });

  it('sem histórico rastreado (null/undefined) o fator não se aplica — nunca estimado', () => {
    const withoutSignal = scoreOpportunity({ ...base });
    const withNull = scoreOpportunity({ ...base, closeDateSlips: null });
    const withZero = scoreOpportunity({ ...base, closeDateSlips: 0 });
    expect(withNull.probability).toBe(withoutSignal.probability);
    expect(withZero.probability).toBe(withoutSignal.probability);
    expect(withZero.negativeFactors.some((f) => f.includes('adiad'))).toBe(false);
  });

  it('um adiamento desconta CLOSE_DATE_SLIP_PENALTY e explica o fator', () => {
    const reference = scoreOpportunity({ ...base });
    const result = scoreOpportunity({ ...base, closeDateSlips: 1 });
    expect(result.probability).toBe(reference.probability - FORECAST_RULES.CLOSE_DATE_SLIP_PENALTY);
    expect(result.negativeFactors).toContain('Data prevista de fechamento já foi adiada uma vez');
  });

  it('adiamentos crônicos respeitam o teto de penalidade e são rotulados como "constantemente empurrada"', () => {
    const reference = scoreOpportunity({ ...base });
    const result = scoreOpportunity({ ...base, closeDateSlips: 7 });
    expect(result.probability).toBe(
      reference.probability - FORECAST_RULES.CLOSE_DATE_SLIP_MAX_PENALTY,
    );
    expect(result.negativeFactors.some((f) => f.includes('constantemente empurrada'))).toBe(true);
  });
});

describe('fieldChangeHistory.diffTrackedFields — só grava mudança real', () => {
  it('campo ausente no payload (undefined) não é mudança; null é limpeza real', () => {
    expect(
      diffTrackedFields({ expectedCloseAt: new Date('2026-08-01T00:00:00Z'), owner: 'ana' }, {}),
    ).toEqual([]);
    expect(
      diffTrackedFields(
        { expectedCloseAt: new Date('2026-08-01T00:00:00Z'), owner: 'ana' },
        { owner: null },
      ),
    ).toEqual([{ field: 'owner', previousValue: 'ana', newValue: null }]);
  });

  it('mesma data em representações diferentes (Date vs ISO) não é mudança', () => {
    expect(
      diffTrackedFields(
        { expectedCloseAt: new Date('2026-08-01T00:00:00.000Z') },
        { expectedCloseAt: '2026-08-01T00:00:00.000Z' },
      ),
    ).toEqual([]);
  });

  it('data adiada e owner trocado geram uma linha por campo, com valores serializados', () => {
    const diff = diffTrackedFields(
      { expectedCloseAt: new Date('2026-08-01T00:00:00Z'), owner: ' ana ' },
      { expectedCloseAt: new Date('2026-09-15T00:00:00Z'), owner: 'bruno' },
    );
    expect(diff).toEqual([
      {
        field: 'expectedCloseAt',
        previousValue: '2026-08-01T00:00:00.000Z',
        newValue: '2026-09-15T00:00:00.000Z',
      },
      { field: 'owner', previousValue: 'ana', newValue: 'bruno' },
    ]);
  });
});

describe('summarizeCloseDateChanges', () => {
  it('conta adiamentos/antecipações só quando as duas datas existem; guarda a data original', () => {
    const stats = summarizeCloseDateChanges([
      change('d1', 'expectedCloseAt', null, '2026-08-10T00:00:00.000Z', '2026-07-01T00:00:00Z'), // preenchimento inicial
      change(
        'd1',
        'expectedCloseAt',
        '2026-08-10T00:00:00.000Z',
        '2026-08-25T00:00:00.000Z',
        '2026-07-10T00:00:00Z',
      ), // adiou
      change(
        'd1',
        'expectedCloseAt',
        '2026-08-25T00:00:00.000Z',
        '2026-09-30T00:00:00.000Z',
        '2026-07-20T00:00:00Z',
      ), // adiou
      change(
        'd1',
        'expectedCloseAt',
        '2026-09-30T00:00:00.000Z',
        '2026-09-20T00:00:00.000Z',
        '2026-08-01T00:00:00Z',
      ), // antecipou
      change('d1', 'owner', 'ana', 'bruno', '2026-08-02T00:00:00Z'), // ignorado aqui
    ]);
    const d1 = stats.get('d1')!;
    expect(d1.slips).toBe(2);
    expect(d1.pullIns).toBe(1);
    expect(d1.originalCloseAt?.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    expect(d1.lastChangedAt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('CLOSEDATE Intelligence (closeDateIntelligence)', () => {
  it('sem nenhum histórico: trackingSince null, zero mudanças, e o forecast do negócio não é penalizado', async () => {
    const repo = new FakeRepository([deal({ id: 'd1' })]);
    const useCases = new CommercialIntelligenceUseCases(repo);
    const report = await useCases.closeDateIntelligence(ORG, { month: PERIOD }, NOW);
    expect(report.trackingSince).toBeNull();
    expect(report.openDealsEvaluated).toBe(1);
    expect(report.dealsWithSlips).toBe(0);
    expect(report.deals).toEqual([]);
    const explain = await useCases.forecastExplain(ORG, 'd1', NOW);
    expect(explain?.negativeFactors.some((f) => f.includes('adiad'))).toBe(false);
  });

  it('mede adiamentos por negócio, crônicos, dias deslocados, "saiu do mês", e penaliza o forecast', async () => {
    const deals = [
      deal({
        id: 'chronic',
        amount: 50_000,
        owner: 'ana',
        expectedCloseAt: new Date('2026-10-05T00:00:00Z'),
        productSkus: ['SKU-A'],
      }),
      deal({
        id: 'once',
        amount: 20_000,
        owner: 'bruno',
        expectedCloseAt: new Date('2026-08-28T00:00:00Z'),
      }),
      deal({ id: 'clean', amount: 5_000, owner: 'ana' }),
      deal({
        id: 'closed',
        amount: 99_000,
        owner: 'ana',
        stageIsWon: true,
        pipelineStageId: 'stage-ganho',
        closedAt: new Date('2026-08-01T00:00:00Z'),
      }),
    ];
    const fieldChanges = [
      // chronic: 08/10 → 08/30 (saiu do mês) → 10/05 (adiou de novo)
      change(
        'chronic',
        'expectedCloseAt',
        '2026-08-10T00:00:00.000Z',
        '2026-09-05T00:00:00.000Z',
        '2026-07-10T00:00:00Z',
      ),
      change(
        'chronic',
        'expectedCloseAt',
        '2026-09-05T00:00:00.000Z',
        '2026-10-05T00:00:00.000Z',
        '2026-08-01T00:00:00Z',
      ),
      // once: 08/20 → 08/28 (ficou no mês)
      change(
        'once',
        'expectedCloseAt',
        '2026-08-20T00:00:00.000Z',
        '2026-08-28T00:00:00.000Z',
        '2026-08-03T00:00:00Z',
      ),
      // closed: adiado, mas fechado — não entra (só negócios abertos)
      change(
        'closed',
        'expectedCloseAt',
        '2026-07-01T00:00:00.000Z',
        '2026-07-20T00:00:00.000Z',
        '2026-06-20T00:00:00Z',
      ),
    ];
    const repo = new FakeRepository(deals, [], fieldChanges);
    const useCases = new CommercialIntelligenceUseCases(repo);
    const report = await useCases.closeDateIntelligence(ORG, { month: PERIOD }, NOW);

    expect(report.trackingSince).toBe('2026-06-20T00:00:00.000Z');
    expect(report.openDealsEvaluated).toBe(3);
    expect(report.dealsWithAnyChange).toBe(2);
    expect(report.dealsWithSlips).toBe(2);
    expect(report.totalSlips).toBe(3);
    expect(report.chronicDeals).toBe(1);
    expect(report.amountWithSlips).toBe(70_000);
    expect(report.slippedOutOfPeriodCount).toBe(1);
    expect(report.slippedOutOfPeriodAmount).toBe(50_000);
    // média de dias por adiamento: (26 + 30 + 8) / 3
    expect(report.averageDaysSlippedPerSlip).toBeCloseTo((26 + 30 + 8) / 3, 1);

    const chronic = report.deals[0];
    expect(chronic.leadId).toBe('chronic');
    expect(chronic.slips).toBe(2);
    expect(chronic.chronic).toBe(true);
    expect(chronic.originalCloseAt).toBe('2026-08-10T00:00:00.000Z');
    expect(chronic.netDaysShifted).toBe(56);

    expect(report.byOwner.find((b) => b.label === 'ana')?.totalSlips).toBe(2);
    expect(report.byOwner.find((b) => b.label === 'bruno')?.totalSlips).toBe(1);
    expect(report.byProduct.find((b) => b.label === 'SKU-A')?.chronicDeals).toBe(1);
    expect(report.byProduct.find((b) => b.label === 'Não informado')?.dealsWithSlips).toBe(1);
    expect(report.rulesVersion).toBe('v2');

    // O forecast ponderado do negócio crônico expõe o fator — "por que este negócio tem esse score?"
    const explain = await useCases.forecastExplain(ORG, 'chronic', NOW);
    expect(explain?.negativeFactors).toContain(
      'Data prevista adiada 2 vezes (oportunidade constantemente empurrada)',
    );
    // Filtro por vendedor recorta o relatório
    const onlyBruno = await useCases.closeDateIntelligence(
      ORG,
      { month: PERIOD, owner: 'bruno' },
      NOW,
    );
    expect(onlyBruno.dealsWithSlips).toBe(1);
    expect(onlyBruno.deals[0].leadId).toBe('once');
  });
});

describe('Pipeline Carryover (pipelineCreation.carryover)', () => {
  it('separa o que já estava aberto no início do mês do que foi criado no mês', async () => {
    const deals = [
      deal({ id: 'new', createdAt: new Date('2026-08-03T03:00:00Z'), amount: 30_000 }),
      deal({ id: 'carry-open', createdAt: new Date('2026-06-10T03:00:00Z'), amount: 40_000 }),
      deal({
        id: 'carry-won',
        createdAt: new Date('2026-05-10T03:00:00Z'),
        amount: 20_000,
        stageIsWon: true,
        pipelineStageId: 'stage-ganho',
        closedAt: new Date('2026-08-10T00:00:00Z'),
      }),
      deal({
        id: 'closed-before',
        createdAt: new Date('2026-05-10T03:00:00Z'),
        amount: 70_000,
        stageIsLost: true,
        pipelineStageId: 'stage-perdido',
        closedAt: new Date('2026-07-20T00:00:00Z'),
      }),
    ];
    const useCases = new CommercialIntelligenceUseCases(new FakeRepository(deals));
    const creation = await useCases.pipelineCreation(ORG, { month: PERIOD }, NOW);
    expect(creation.count).toBe(1);
    expect(creation.amount).toBe(30_000);
    expect(creation.carryover.count).toBe(2);
    expect(creation.carryover.amount).toBe(60_000);
    expect(creation.carryover.stillOpenCount).toBe(1);
    expect(creation.carryover.stillOpenAmount).toBe(40_000);
    expect(creation.carryover.closedInPeriodCount).toBe(1);
    expect(creation.carryover.wonInPeriodAmount).toBe(20_000);
    expect(creation.carryover.lostInPeriodAmount).toBe(0);
    expect(creation.carryover.shareOfPeriodPipeline).toBeCloseTo((60_000 / 90_000) * 100, 2);
  });

  it('sem nenhum pipeline no mês, a participação é "Não disponível" (null)', async () => {
    const useCases = new CommercialIntelligenceUseCases(new FakeRepository([]));
    const creation = await useCases.pipelineCreation(ORG, { month: PERIOD }, NOW);
    expect(creation.carryover.count).toBe(0);
    expect(creation.carryover.shareOfPeriodPipeline).toBeNull();
  });
});

describe('Jornada (journey)', () => {
  it('sem histórico algum: trackingSince null, contagens zero, sem interação avaliada só sobre abertos', async () => {
    const useCases = new CommercialIntelligenceUseCases(
      new FakeRepository([deal({ id: 'd1', lastInteraction: null })]),
    );
    const report = await useCases.journey(ORG, { month: PERIOD }, NOW);
    expect(report.handoffs.trackingSince).toBeNull();
    expect(report.handoffs.countInPeriod).toBe(0);
    expect(report.reentries.trackingSince).toBeNull();
    expect(report.reentries.totalTracked).toBe(0);
    expect(report.transitions.totalTransitions).toBe(0);
    expect(report.noInteraction.count).toBe(1);
    expect(report.noInteraction.neverInteractedCount).toBe(1);
    expect(report.noInteraction.thresholdDays).toBe(FORECAST_RULES.STALE_INTERACTION_DAYS);
  });

  it('handoffs: conta trocas do mês, pares de→para e negócios abertos com múltiplas trocas', async () => {
    const deals = [deal({ id: 'd1', owner: 'carla' }), deal({ id: 'd2', owner: 'bruno' })];
    const fieldChanges = [
      change('d1', 'owner', null, 'ana', '2026-06-01T00:00:00Z', 'round_robin'),
      change('d1', 'owner', 'ana', 'bruno', '2026-08-02T00:00:00Z'),
      change('d1', 'owner', 'bruno', 'carla', '2026-08-09T00:00:00Z', 'batch'),
      change('d2', 'owner', 'ana', 'bruno', '2026-07-15T00:00:00Z'),
    ];
    const useCases = new CommercialIntelligenceUseCases(
      new FakeRepository(deals, [], fieldChanges),
    );
    const report = await useCases.journey(ORG, { month: PERIOD }, NOW);
    expect(report.handoffs.trackingSince).toBe('2026-06-01T00:00:00.000Z');
    expect(report.handoffs.countInPeriod).toBe(2);
    expect(report.handoffs.dealsWithHandoffInPeriod).toBe(1);
    expect(report.handoffs.openDealsWithMultipleHandoffs).toBe(1);
    expect(report.handoffs.byPair).toEqual([
      { fromOwner: 'ana', toOwner: 'bruno', count: 1 },
      { fromOwner: 'bruno', toOwner: 'carla', count: 1 },
    ]);
    expect(report.handoffs.recent[0]).toMatchObject({
      leadId: 'd1',
      toOwner: 'carla',
      source: 'batch',
      isOpen: true,
    });
  });

  it('reentradas: detecta saída de etapa terminal para etapa aberta e classifica recuperado/reativado', async () => {
    const deals = [
      deal({
        id: 'recovered',
        amount: 15_000,
        stageIsWon: true,
        pipelineStageId: 'stage-ganho',
        closedAt: new Date('2026-08-12T00:00:00Z'),
      }),
      deal({
        id: 'reactivated',
        amount: 8_000,
        pipelineStageId: 'stage-proposta',
        stageName: 'Proposta Enviada',
      }),
      deal({ id: 'normal', amount: 1_000 }),
    ];
    const history: HistoryRow[] = [
      {
        leadId: 'recovered',
        stageId: 'stage-perdido',
        stageName: 'Negócios Perdidos',
        enteredAt: new Date('2026-06-01T00:00:00Z'),
        exitedAt: new Date('2026-08-03T00:00:00Z'),
        isLost: true,
      },
      {
        leadId: 'recovered',
        stageId: 'stage-proposta',
        stageName: 'Proposta Enviada',
        enteredAt: new Date('2026-08-03T00:00:00Z'),
        exitedAt: new Date('2026-08-12T00:00:00Z'),
      },
      {
        leadId: 'recovered',
        stageId: 'stage-ganho',
        stageName: 'Negócios Ganhos',
        enteredAt: new Date('2026-08-12T00:00:00Z'),
        exitedAt: null,
        isWon: true,
      },
      {
        leadId: 'reactivated',
        stageId: 'stage-perdido',
        stageName: 'Negócios Perdidos',
        enteredAt: new Date('2026-05-01T00:00:00Z'),
        exitedAt: new Date('2026-07-10T00:00:00Z'),
        isLost: true,
      },
      {
        leadId: 'reactivated',
        stageId: 'stage-proposta',
        stageName: 'Proposta Enviada',
        enteredAt: new Date('2026-07-10T00:00:00Z'),
        exitedAt: null,
      },
      {
        leadId: 'normal',
        stageId: 'stage-nova',
        stageName: 'Nova Oportunidade',
        enteredAt: new Date('2026-07-01T00:00:00Z'),
        exitedAt: null,
      },
    ];
    const useCases = new CommercialIntelligenceUseCases(new FakeRepository(deals, history));
    const report = await useCases.journey(ORG, { month: PERIOD }, NOW);
    expect(report.reentries.totalTracked).toBe(2);
    expect(report.reentries.countInPeriod).toBe(1);
    expect(report.reentries.recoveredCount).toBe(1);
    expect(report.reentries.recoveredAmount).toBe(15_000);
    expect(report.reentries.reactivatedOpenCount).toBe(1);
    expect(report.reentries.reactivatedOpenAmount).toBe(8_000);
    expect(report.reentries.rows[0]).toMatchObject({
      leadId: 'recovered',
      fromTerminalStage: 'Negócios Perdidos',
      toStage: 'Proposta Enviada',
      currentStatus: 'ganho',
    });

    // Mapa de transições: perdido→proposta (regressão: sortOrder 3 → 1) ×2, proposta→ganho ×1
    const lostToProposal = report.transitions.edges.find(
      (e) => e.fromStage === 'Negócios Perdidos',
    );
    expect(lostToProposal?.count).toBe(2);
    expect(lostToProposal?.backward).toBe(true);
    expect(lostToProposal?.medianDaysInFrom).toBe(66.5);
    expect(report.transitions.backwardTransitions).toBe(2);
    expect(report.transitions.totalTransitions).toBe(3);
  });

  it('sem interação: aplica o limiar e ordena por valor', async () => {
    const deals = [
      deal({ id: 'fresh', amount: 100, lastInteraction: new Date('2026-08-14T00:00:00Z') }),
      deal({ id: 'stale', amount: 500, lastInteraction: new Date('2026-06-01T00:00:00Z') }),
      deal({ id: 'never', amount: 900, lastInteraction: null }),
      deal({
        id: 'closed',
        amount: 5_000,
        lastInteraction: null,
        stageIsLost: true,
        pipelineStageId: 'stage-perdido',
        closedAt: new Date('2026-07-01T00:00:00Z'),
      }),
    ];
    const useCases = new CommercialIntelligenceUseCases(new FakeRepository(deals));
    const report = await useCases.journey(ORG, { month: PERIOD }, NOW);
    expect(report.noInteraction.openDealsEvaluated).toBe(3);
    expect(report.noInteraction.count).toBe(2);
    expect(report.noInteraction.amount).toBe(1_400);
    expect(report.noInteraction.rows.map((r) => r.leadId)).toEqual(['never', 'stale']);
    expect(report.noInteraction.rows[1].daysSinceInteraction).toBe(76); // 75,5 dias arredondados (daysBetween)
  });
});

describe('Forecast Accuracy a partir de snapshots reais (forecastAccuracy / healthScore)', () => {
  it('sem store injetado ou sem snapshot: sem histórico suficiente, e o pilar do Health Score fica indisponível', async () => {
    const useCases = new CommercialIntelligenceUseCases(new FakeRepository([deal({ id: 'd1' })]));
    const summary = await useCases.forecastAccuracy(ORG, NOW);
    expect(summary.available).toBe(false);
    expect(summary.reason).toBe('sem_historico_suficiente');
    const health = await useCases.healthScore(ORG, { month: PERIOD }, NOW);
    const pillar = health.pillars.find((p) => p.pillar === 'confiabilidadeForecast')!;
    expect(pillar.score).toBeNull();
    expect(pillar.unavailableReason).toBe('sem_historico_suficiente');
  });

  it('usa o snapshot MAIS ANTIGO de cada mês já encerrado e compara com o Fechado realizado', async () => {
    const deals = [
      deal({
        id: 'won-jul',
        amount: 80_000,
        stageIsWon: true,
        pipelineStageId: 'stage-ganho',
        closedAt: new Date('2026-07-20T12:00:00Z'),
      }),
      deal({
        id: 'lost-jul',
        amount: 30_000,
        stageIsLost: true,
        pipelineStageId: 'stage-perdido',
        closedAt: new Date('2026-07-25T12:00:00Z'),
      }),
      deal({ id: 'open-aug', amount: 10_000 }),
    ];
    const store = new InMemoryForecastSnapshotStore();
    const base = {
      organizationId: ORG,
      rulesVersion: 'v1',
      commitAmount: 0,
      bestCaseAmount: 0,
      currency: 'BRL',
    };
    await store.save({
      ...base,
      id: 's1',
      period: '2026-07',
      snapshotAt: '2026-07-14T06:00:00.000Z',
      forecastAmount: 120_000,
    });
    await store.save({
      ...base,
      id: 's0',
      period: '2026-07',
      snapshotAt: '2026-07-07T06:00:00.000Z',
      forecastAmount: 100_000,
    }); // mais antigo
    await store.save({
      ...base,
      id: 's2',
      period: '2026-08',
      snapshotAt: '2026-08-04T06:00:00.000Z',
      forecastAmount: 50_000,
    }); // mês ainda aberto
    await store.save({
      ...base,
      id: 's3',
      period: '2026-06',
      snapshotAt: '2026-06-02T06:00:00.000Z',
      forecastAmount: 40_000,
    }); // sem fechado → realizado 0

    const useCases = new CommercialIntelligenceUseCases(new FakeRepository(deals), store);
    const summary = await useCases.forecastAccuracy(ORG, NOW);
    expect(summary.samples.map((s) => s.period)).toEqual(['2026-06', '2026-07', '2026-08']);

    const july = summary.samples.find((s) => s.period === '2026-07')!;
    expect(july.available).toBe(true);
    expect(july.snapshotAt).toBe('2026-07-07T06:00:00.000Z');
    expect(july.predictedForecastAmount).toBe(100_000);
    expect(july.realizedClosedAmount).toBe(80_000);
    expect(july.errorAmount).toBe(20_000);
    expect(july.errorPercent).toBe(25);
    expect(july.direction).toBe('superestimou');

    const august = summary.samples.find((s) => s.period === '2026-08')!;
    expect(august.available).toBe(false);
    expect(august.reason).toBe('periodo_nao_fechou');

    const june = summary.samples.find((s) => s.period === '2026-06')!;
    expect(june.available).toBe(true);
    expect(june.realizedClosedAmount).toBe(0);
    expect(june.errorPercent).toBeNull(); // nunca divide por zero

    expect(summary.available).toBe(true);
    expect(summary.sampleSize).toBe(1);
    expect(summary.meanAbsoluteErrorPercent).toBe(25);

    const health = await useCases.healthScore(ORG, { month: PERIOD }, NOW);
    const pillar = health.pillars.find((p) => p.pillar === 'confiabilidadeForecast')!;
    expect(pillar.score).toBe(75);
    expect(pillar.classification).toBe('atencao');
  });
});
