/**
 * Scoring de negócios (funil "Negócio") — carrega negócios + etapas + histórico e aplica o
 * Forecast Ponderado Explicável (`forecastEngine.scoreOpportunity`) a cada um, produzindo o
 * `ScoredDeal` que TODOS os relatórios de `application/queries/*` consomem como entrada comum.
 * Nenhum relatório chama o repositório para negócios/histórico diretamente — sempre por aqui, para
 * que o scoring (dias na etapa atual, forecast, aging) seja calculado uma única vez e de forma
 * idêntica em todo o módulo.
 */

import type {
  CommercialIntelligenceRepository,
  DealRow,
} from '../../domain/CommercialIntelligence';
import { scoreOpportunity, type ForecastResult } from '../forecastEngine';
import { agingInStageDays } from '../pipelineEligibility';
import { daysBetween } from '../shared/mathUtils';

export type StageHistoryRow = {
  leadId: string;
  stageId: string | null;
  stageName: string;
  enteredAt: Date;
  exitedAt: Date | null;
};

export interface ScoredDeal {
  deal: DealRow;
  forecast: ForecastResult;
  daysInCurrentStage: number | null;
  agingDays: number;
}

/** Duração média (dias) de segmentos JÁ CONCLUÍDOS (`exitedAt` preenchido) por etapa — usada tanto pelo forecast (estagnação) quanto pelo aging por etapa. */
export function buildStageDurationStats(history: StageHistoryRow[]): Map<string, number> {
  const byStage = new Map<string, number[]>();
  for (const row of history) {
    if (!row.stageId || !row.exitedAt) continue;
    const days = daysBetween(row.enteredAt, row.exitedAt);
    if (!byStage.has(row.stageId)) byStage.set(row.stageId, []);
    byStage.get(row.stageId)!.push(days);
  }
  const result = new Map<string, number>();
  for (const [stageId, durations] of byStage) {
    const avg = durations.reduce((s, v) => s + v, 0) / durations.length;
    result.set(stageId, avg);
  }
  return result;
}

/** Linha de histórico "em aberto" (exitedAt null) mais recente para um lead numa etapa específica — é a entrada na etapa atual. */
export function currentStageEntry(
  history: StageHistoryRow[],
  leadId: string,
  stageId: string | null,
): StageHistoryRow | null {
  if (!stageId) return null;
  const rows = history
    .filter((row) => row.leadId === leadId && row.stageId === stageId && row.exitedAt == null)
    .sort((a, b) => b.enteredAt.getTime() - a.enteredAt.getTime());
  return rows[0] ?? null;
}

/** Valor em risco = valor do negócio × probabilidade de NÃO fechar (Centro de Decisão). */
export function riskImpactValue(s: ScoredDeal): number {
  return s.deal.amount * (1 - s.forecast.probability / 100);
}

export interface ScoredDealsResult {
  scored: ScoredDeal[];
  stages: Awaited<ReturnType<CommercialIntelligenceRepository['findDealPipelineStages']>>;
  history: StageHistoryRow[];
}

/**
 * Filtro comum a quase todo relatório: só o funil "Negócio". `findDeals` já devolve só esse funil
 * (ver o repositório Prisma) — este carregamento é o ponto de entrada único de todos os relatórios.
 */
export async function loadScoredDeals(
  repository: CommercialIntelligenceRepository,
  organizationId: string,
  now: Date,
): Promise<ScoredDealsResult> {
  const [deals, stages, history] = await Promise.all([
    repository.findDeals(organizationId),
    repository.findDealPipelineStages(organizationId),
    repository.findStageHistory(organizationId),
  ]);

  const durationStats = buildStageDurationStats(history);

  const scored: ScoredDeal[] = deals.map((deal) => {
    const entry = currentStageEntry(history, deal.id, deal.pipelineStageId);
    const daysInCurrentStage = entry ? daysBetween(entry.enteredAt, now) : null;
    const stageAverageDurationDays = deal.pipelineStageId
      ? (durationStats.get(deal.pipelineStageId) ?? null)
      : null;

    const forecast = scoreOpportunity({
      amount: deal.amount,
      stageProbability: deal.stageProbability ?? 0,
      now,
      createdAt: deal.createdAt,
      expectedCloseAt: deal.expectedCloseAt,
      lastInteraction: deal.lastInteraction,
      nextAction: deal.nextAction,
      daysInCurrentStage,
      stageAverageDurationDays,
    });

    return {
      deal,
      forecast,
      daysInCurrentStage,
      agingDays: agingInStageDays(deal, now, daysInCurrentStage),
    };
  });

  return { scored, stages, history };
}
