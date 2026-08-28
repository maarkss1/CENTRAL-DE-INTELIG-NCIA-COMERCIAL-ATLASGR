/**
 * Tendências históricas — 6 meses (seção 23). Mês do filtro + 5 meses anteriores, mais antigo →
 * mais recente. Reaproveita `performanceReport`/`pipelineCreationReport` (já testados) em vez de
 * recalcular — o custo extra de repetir `loadScoredDeals` por mês é aceitável para um relatório
 * executivo de baixo tráfego. Cada ponto retorna `null` nos campos sem amostra suficiente daquele
 * mês (nunca interpolado).
 */

import type {
  CommercialIntelligenceFilter,
  CommercialIntelligenceRepository,
  HistoricalTrendPoint,
  HistoricalTrendsReport,
} from '../../domain/CommercialIntelligence';
import { monthLabelPt, shiftMonth } from '../executiveCalendar';
import { buildPerformance } from './performanceReport';
import { buildPipelineCreation } from './pipelineCreationReport';

export async function buildHistoricalTrends(
  repository: CommercialIntelligenceRepository,
  organizationId: string,
  filter: CommercialIntelligenceFilter,
  now: Date,
): Promise<HistoricalTrendsReport> {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(filter.month, i - 5));
  const points: HistoricalTrendPoint[] = await Promise.all(
    months.map(async (period) => {
      const monthFilter: CommercialIntelligenceFilter = { ...filter, month: period };
      const [perf, creation] = await Promise.all([
        buildPerformance(repository, organizationId, monthFilter, now),
        buildPipelineCreation(repository, organizationId, monthFilter, now),
      ]);
      return {
        period,
        label: monthLabelPt(period),
        winRate: perf.winRate,
        salesCycleMeanDays: perf.salesCycle.meanDays,
        averageTicketWon: perf.averageTicket.won,
        pipelineCreatedAmount: creation.amount,
        closedSampleSize: perf.wonCount + perf.lostCount,
      };
    }),
  );
  return { points };
}
