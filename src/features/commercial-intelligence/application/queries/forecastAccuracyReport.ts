/**
 * Erro histórico do Forecast (previsto vs. realizado) a partir dos snapshots REAIS persistidos
 * (`ForecastSnapshotStore`, alimentado pelo job semanal `jobs/forecastSnapshotWeekly.worker.ts`).
 *
 * Regra de escolha do snapshot por período: o snapshot MAIS ANTIGO de cada mês — a previsão feita
 * com mais antecedência, que é a que interessa para medir "quanto o motor costuma acertar quando
 * ainda dá tempo de agir". `snapshotAt` é devolvido para a UI mostrar a antecedência. Períodos
 * ainda não encerrados, sem snapshot, ou sem realizado conhecido são reportados como
 * indisponíveis com o motivo — nunca um erro fabricado (ver `forecastAccuracy.ts`).
 */

import type {
  CommercialIntelligenceRepository,
  ForecastAccuracyResult,
  ForecastAccuracySummary,
  ForecastSnapshotStore,
} from '../../domain/CommercialIntelligence';
import {
  computeForecastAccuracy,
  hasPeriodClosed,
  summarizeForecastAccuracy,
} from '../forecastAccuracy';
import { roundMoney } from '../shared/mathUtils';
import { monthRange } from '../shared/period';
import { loadScoredDeals } from '../scoring/dealScoring';

export async function buildForecastAccuracy(
  repository: CommercialIntelligenceRepository,
  store: ForecastSnapshotStore | null,
  organizationId: string,
  now: Date,
): Promise<ForecastAccuracySummary> {
  if (!store) return summarizeForecastAccuracy([]);

  const snapshots = await store.findAll(organizationId);
  if (snapshots.length === 0) return summarizeForecastAccuracy([]);

  const earliestByPeriod = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    const current = earliestByPeriod.get(snapshot.period);
    if (!current || snapshot.snapshotAt < current.snapshotAt) {
      earliestByPeriod.set(snapshot.period, snapshot);
    }
  }

  const { scored } = await loadScoredDeals(repository, organizationId, now);

  const samples: ForecastAccuracyResult[] = [...earliestByPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, snapshot]) => {
      if (!hasPeriodClosed(period, now)) {
        return computeForecastAccuracy(period, snapshot, null, now);
      }
      const { start, end } = monthRange(period);
      const realized = roundMoney(
        scored
          .filter(
            (s) =>
              s.deal.stageIsWon &&
              s.deal.closedAt &&
              s.deal.closedAt >= start &&
              s.deal.closedAt < end,
          )
          .reduce((sum, s) => sum + s.deal.amount, 0),
      );
      return computeForecastAccuracy(period, snapshot, realized, now);
    });

  return summarizeForecastAccuracy(samples);
}
