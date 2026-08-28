/**
 * Erro histórico do Forecast (previsto vs. realizado) — item "backtest" da auditoria CPI. Puro e
 * testável em isolamento: recebe o snapshot e o realizado já resolvidos por quem chama (nenhum
 * I/O aqui), mesmo espírito de `forecastEngine.ts`/`predictiveForecast.ts`.
 *
 * Honestidade sobre a ausência de dado é o requisito central: `computeForecastAccuracy` só declara
 * `available: true` quando o período de referência já fechou, existe um snapshot desse período e o
 * valor realizado é conhecido. Fora isso, `reason` explica exatamente qual das três condições
 * faltou — nunca um erro fabricado.
 */
import type {
  ForecastAccuracyResult,
  ForecastAccuracySummary,
  ForecastSnapshotRecord,
  PeriodMonth,
} from '../domain/CommercialIntelligence';
import { roundMoney } from './shared/mathUtils';
import { monthRange } from './shared/period';

/** `true` quando o período (mês de calendário) já terminou por completo em relação a `now`. */
export function hasPeriodClosed(period: PeriodMonth, now: Date): boolean {
  return monthRange(period).end <= now;
}

function unavailable(
  period: PeriodMonth,
  reason: ForecastAccuracyResult['reason'],
): ForecastAccuracyResult {
  return {
    available: false,
    period,
    reason,
    snapshotAt: null,
    rulesVersion: null,
    predictedForecastAmount: null,
    realizedClosedAmount: null,
    errorAmount: null,
    errorPercent: null,
    direction: null,
  };
}

/**
 * Compara o Forecast previsto por UM snapshot com o valor realmente fechado no período. Quem
 * chama decide qual snapshot usar (ex.: o mais antigo do período — a previsão feita com mais
 * antecedência — ou o mais recente antes do fechamento; `summarizeForecastAccuracy` aceita uma
 * amostra por período, não decide isso por conta própria).
 */
export function computeForecastAccuracy(
  period: PeriodMonth,
  snapshot: ForecastSnapshotRecord | null,
  realizedClosedAmount: number | null,
  now: Date,
): ForecastAccuracyResult {
  if (!hasPeriodClosed(period, now)) return unavailable(period, 'periodo_nao_fechou');
  if (!snapshot) return unavailable(period, 'sem_snapshot');
  if (realizedClosedAmount == null) return unavailable(period, 'sem_realizado');

  const errorAmount = roundMoney(snapshot.forecastAmount - realizedClosedAmount);
  const errorPercent =
    realizedClosedAmount > 0
      ? roundMoney((Math.abs(errorAmount) / realizedClosedAmount) * 100)
      : null;
  const direction: ForecastAccuracyResult['direction'] =
    errorAmount > 0 ? 'superestimou' : errorAmount < 0 ? 'subestimou' : 'acertou';

  return {
    available: true,
    period,
    reason: null,
    snapshotAt: snapshot.snapshotAt,
    rulesVersion: snapshot.rulesVersion,
    predictedForecastAmount: snapshot.forecastAmount,
    realizedClosedAmount,
    errorAmount,
    errorPercent,
    direction,
  };
}

/**
 * Agrega o erro histórico de vários períodos já fechados em um único número (erro percentual
 * absoluto médio) — o insumo do pilar "Confiabilidade de Forecast" em `healthScore.ts`.
 * `available: false` com amostra vazia é o resultado ESPERADO logo após esta implementação (ainda
 * não existe snapshot antigo o bastante para ter fechado) — nunca um erro inventado.
 */
export function summarizeForecastAccuracy(
  samples: ForecastAccuracyResult[],
): ForecastAccuracySummary {
  const usable = samples.filter(
    (s): s is ForecastAccuracyResult & { errorPercent: number } =>
      s.available && s.errorPercent != null,
  );
  if (usable.length === 0) {
    return {
      available: false,
      reason: 'sem_historico_suficiente',
      sampleSize: 0,
      meanAbsoluteErrorPercent: null,
      samples,
    };
  }
  const meanAbsoluteErrorPercent = roundMoney(
    usable.reduce((sum, s) => sum + s.errorPercent, 0) / usable.length,
  );
  return {
    available: true,
    reason: null,
    sampleSize: usable.length,
    meanAbsoluteErrorPercent,
    samples,
  };
}
