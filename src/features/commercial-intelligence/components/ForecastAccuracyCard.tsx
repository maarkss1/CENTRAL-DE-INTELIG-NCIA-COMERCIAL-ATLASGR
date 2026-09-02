import { useEffect, useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { MetricInfo } from './MetricInfo';
import {
  commercialIntelligenceApi,
  formatCurrency,
  formatPercent,
  type ForecastAccuracyResult,
  type ForecastAccuracySummary,
} from '../commercialIntelligence.api';

const REASON_LABEL: Record<NonNullable<ForecastAccuracyResult['reason']>, string> = {
  periodo_nao_fechou: 'Mês ainda em andamento',
  sem_snapshot: 'Sem snapshot deste mês',
  sem_realizado: 'Realizado desconhecido',
};

const DIRECTION_LABEL: Record<NonNullable<ForecastAccuracyResult['direction']>, string> = {
  superestimou: 'Superestimou',
  subestimou: 'Subestimou',
  acertou: 'Acertou',
};

function monthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Erro histórico do Forecast — compara o que o motor previa (snapshot semanal real, o mais
 * antigo de cada mês) com o que de fato fechou. Sem histórico suficiente, diz isso; nunca
 * fabrica períodos anteriores.
 */
export function ForecastAccuracyCard() {
  const [data, setData] = useState<ForecastAccuracySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commercialIntelligenceApi
      .forecastAccuracy()
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton className="h-40 rounded-2xl" />;
  if (error)
    return (
      <Card padding="sm">
        <div className="flex items-center gap-2 text-sm text-critical">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}
        </div>
      </Card>
    );
  if (!data) return null;

  return (
    <Card padding="sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2">
            <History className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">Forecast Accuracy (erro histórico)</h3>
              <MetricInfo metricKey="forecast_erro_historico" />
            </div>
            <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-ink-2">
              Previsto pelo snapshot mais antigo de cada mês vs. Fechado realizado depois que o mês
              encerrou. Snapshots são gravados toda segunda-feira pelo job semanal — nenhum mês
              anterior à primeira gravação é inventado.
            </p>
          </div>
        </div>
        <div className="md:text-right">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-2">
            Erro absoluto médio
          </p>
          <p className="text-2xl font-black tracking-tight text-ink [font-variant-numeric:tabular-nums]">
            {data.available
              ? formatPercent(data.meanAbsoluteErrorPercent)
              : 'Histórico insuficiente'}
          </p>
          {data.available && (
            <p className="text-[11px] text-ink-2">
              {data.sampleSize} mês(es) encerrado(s) com snapshot
            </p>
          )}
        </div>
      </div>

      {data.samples.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-surface-2/40 p-3 text-xs text-ink-2">
          Nenhum snapshot de forecast gravado ainda. O primeiro é criado automaticamente na próxima
          segunda-feira 06:00 (job semanal); o erro passa a ser medido quando um mês com snapshot
          encerrar.
        </p>
      ) : (
        <div
          className="mt-4 overflow-x-auto"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável horizontal precisa ser focável por teclado (axe scrollable-region-focusable), mesmo padrão de CrmBoard.tsx
          tabIndex={0}
          role="region"
          aria-label="Tabela de erro histórico do forecast (rolável)"
        >
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-line text-ink-2">
                <th className="py-1.5 text-left font-semibold">Mês previsto</th>
                <th className="py-1.5 text-left font-semibold">Snapshot em</th>
                <th className="py-1.5 text-right font-semibold">Forecast previsto</th>
                <th className="py-1.5 text-right font-semibold">Fechado realizado</th>
                <th className="py-1.5 text-right font-semibold">Erro</th>
                <th className="py-1.5 text-right font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {data.samples.map((sample) => (
                <tr key={sample.period} className="border-b border-line last:border-0">
                  <td className="py-1.5 font-bold text-ink">{monthLabel(sample.period)}</td>
                  <td className="py-1.5 text-ink-2">
                    {sample.snapshotAt
                      ? `${new Date(sample.snapshotAt).toLocaleDateString('pt-BR')} (${sample.rulesVersion})`
                      : '—'}
                  </td>
                  <td className="py-1.5 text-right text-ink-2">
                    {sample.predictedForecastAmount != null
                      ? formatCurrency(sample.predictedForecastAmount)
                      : '—'}
                  </td>
                  <td className="py-1.5 text-right text-ink-2">
                    {sample.realizedClosedAmount != null
                      ? formatCurrency(sample.realizedClosedAmount)
                      : '—'}
                  </td>
                  <td className="py-1.5 text-right font-semibold text-ink">
                    {sample.available
                      ? `${formatCurrency(sample.errorAmount)}${sample.errorPercent != null ? ` (${formatPercent(sample.errorPercent)})` : ''}`
                      : '—'}
                  </td>
                  <td className="py-1.5 text-right text-ink-2">
                    {sample.available
                      ? DIRECTION_LABEL[sample.direction ?? 'acertou']
                      : REASON_LABEL[sample.reason ?? 'sem_snapshot']}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
