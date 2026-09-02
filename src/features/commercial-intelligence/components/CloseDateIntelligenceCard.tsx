import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { KpiTile } from './KpiTile';
import { MetricInfo } from './MetricInfo';
import type { DrillDownQuery } from './DealDrillDownDrawer';
import {
  commercialIntelligenceApi,
  formatCurrency,
  type CloseDateBreakdown,
  type CloseDateIntelligenceReport,
  type CommercialFilter,
} from '../commercialIntelligence.api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function BreakdownTable({ title, rows }: { title: string; rows: CloseDateBreakdown[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <h4 className="mb-2 text-xs font-bold text-ink">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-[11px] text-ink-2">Nenhum adiamento registrado.</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-line text-ink-2">
              <th className="py-1 text-left font-semibold">Grupo</th>
              <th className="py-1 text-right font-semibold">Negócios</th>
              <th className="py-1 text-right font-semibold">Adiamentos</th>
              <th className="py-1 text-right font-semibold">Crônicos</th>
              <th className="py-1 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody className="[font-variant-numeric:tabular-nums]">
            {rows.slice(0, 8).map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <td className="py-1 text-ink">{row.label}</td>
                <td className="py-1 text-right text-ink-2">{row.dealsWithSlips}</td>
                <td className="py-1 text-right text-ink-2">{row.totalSlips}</td>
                <td
                  className={`py-1 text-right ${row.chronicDeals > 0 ? 'text-critical font-semibold' : 'text-ink-2'}`}
                >
                  {row.chronicDeals}
                </td>
                <td className="py-1 text-right text-ink-2">{formatCurrency(row.amountAtRisk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface CloseDateIntelligenceCardProps {
  filter: CommercialFilter;
  onOpenDrillDown: (query: DrillDownQuery) => void;
}

/**
 * CLOSEDATE Intelligence — o que aconteceu com a data prevista de fechamento de cada negócio
 * aberto, a partir do histórico real de mudanças (`LeadFieldChange`). Diferencia "sem histórico"
 * de "nunca adiado": o rastreamento começa na criação da tabela e a UI mostra desde quando.
 */
export function CloseDateIntelligenceCard({
  filter,
  onOpenDrillDown,
}: CloseDateIntelligenceCardProps) {
  const [data, setData] = useState<CloseDateIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    commercialIntelligenceApi
      .closeDateIntelligence(filter)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter]);

  if (loading) return <Skeleton className="h-64 rounded-2xl" />;
  if (error)
    return (
      <Card padding="sm">
        <div className="flex items-center gap-2 text-sm text-critical">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}
        </div>
      </Card>
    );
  if (!data) return null;

  const hasHistory = data.trackingSince != null;

  return (
    <Card padding="sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink">CLOSEDATE Intelligence</h3>
            <MetricInfo metricKey="closedate_intelligence" />
          </div>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-ink-2">
            {hasHistory
              ? `Adiamentos e antecipações da data prevista de fechamento rastreados desde ${formatDate(data.trackingSince)} — ${data.openDealsEvaluated} negócio(s) aberto(s) avaliado(s), ${data.dealsWithAnyChange} com alguma mudança.`
              : 'Ainda não há nenhuma mudança de data prevista registrada nesta organização. O histórico começa a partir de agora, a cada edição real da data no CRM — nada é inferido do estado atual.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label="Negócios adiados"
          value={hasHistory ? String(data.dealsWithSlips) : 'Sem histórico'}
          hint={
            hasHistory
              ? `${data.totalSlips} adiamento(s) · ${data.totalPullIns} antecipação(ões)`
              : undefined
          }
          tone={data.dealsWithSlips > 0 ? 'critical' : 'neutral'}
          onClick={
            data.deals.length > 0
              ? () =>
                  onOpenDrillDown({
                    title: 'Negócios com data prevista adiada',
                    ids: data.deals.map((d) => d.leadId),
                  })
              : undefined
          }
        />
        <KpiTile
          label="Constantemente empurrados"
          value={hasHistory ? String(data.chronicDeals) : 'Sem histórico'}
          hint="2+ adiamentos — risco de forecast"
          tone={data.chronicDeals > 0 ? 'critical' : 'neutral'}
          onClick={
            data.chronicDeals > 0
              ? () =>
                  onOpenDrillDown({
                    title: 'Negócios constantemente empurrados',
                    ids: data.deals.filter((d) => d.chronic).map((d) => d.leadId),
                  })
              : undefined
          }
        />
        <KpiTile
          label="Valor com adiamento"
          value={hasHistory ? formatCurrency(data.amountWithSlips) : 'Sem histórico'}
          hint={
            data.averageDaysSlippedPerSlip != null
              ? `Média de ${Math.round(data.averageDaysSlippedPerSlip)} dias por adiamento`
              : undefined
          }
        />
        <KpiTile
          label="Saiu do mês"
          value={hasHistory ? String(data.slippedOutOfPeriodCount) : 'Sem histórico'}
          hint={
            hasHistory
              ? `${formatCurrency(data.slippedOutOfPeriodAmount)} empurrado para depois de ${data.period} · ${data.slippedIntoPeriodCount} entrou no mês`
              : undefined
          }
          tone={data.slippedOutOfPeriodCount > 0 ? 'critical' : 'neutral'}
        />
      </div>

      {hasHistory && (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <BreakdownTable title="Por vendedor" rows={data.byOwner} />
            <BreakdownTable title="Por produto" rows={data.byProduct} />
            <BreakdownTable title="Por etapa" rows={data.byStage} />
          </div>

          {data.deals.length > 0 && (
            <div
              className="mt-4 overflow-x-auto"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável horizontal precisa ser focável por teclado (axe scrollable-region-focusable), mesmo padrão de CrmBoard.tsx
              tabIndex={0}
              role="region"
              aria-label="Tabela de negócios com data prevista adiada (rolável)"
            >
              <table className="w-full min-w-[820px] text-xs">
                <caption className="sr-only">Negócios abertos com data prevista adiada</caption>
                <thead>
                  <tr className="border-b border-line text-ink-2">
                    <th className="py-1.5 text-left font-semibold">Negócio</th>
                    <th className="py-1.5 text-left font-semibold">Responsável</th>
                    <th className="py-1.5 text-right font-semibold">Valor</th>
                    <th className="py-1.5 text-right font-semibold">Data original</th>
                    <th className="py-1.5 text-right font-semibold">Data atual</th>
                    <th className="py-1.5 text-right font-semibold">Dias deslocados</th>
                    <th className="py-1.5 text-right font-semibold">Adiamentos</th>
                    <th className="py-1.5 text-right font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody className="[font-variant-numeric:tabular-nums]">
                  {data.deals.slice(0, 20).map((row) => (
                    <tr key={row.leadId} className="border-b border-line last:border-0">
                      <td className="py-1.5">
                        <p className="font-semibold text-ink">
                          {row.title || row.companyName || row.leadId}
                        </p>
                        <p className="text-[10px] text-ink-2">
                          {row.companyName ?? '—'} · {row.stageName ?? 'Sem etapa'} · {row.tier}
                        </p>
                      </td>
                      <td className="py-1.5 text-ink-2">{row.owner ?? 'Sem responsável'}</td>
                      <td className="py-1.5 text-right text-ink-2">{formatCurrency(row.amount)}</td>
                      <td className="py-1.5 text-right text-ink-2">
                        {formatDate(row.originalCloseAt)}
                      </td>
                      <td className="py-1.5 text-right text-ink">
                        {formatDate(row.currentCloseAt)}
                      </td>
                      <td
                        className={`py-1.5 text-right ${row.netDaysShifted != null && row.netDaysShifted > 0 ? 'text-critical font-semibold' : 'text-ink-2'}`}
                      >
                        {row.netDaysShifted != null
                          ? `${row.netDaysShifted > 0 ? '+' : ''}${row.netDaysShifted}d`
                          : '—'}
                      </td>
                      <td className="py-1.5 text-right">
                        <span className={`font-bold ${row.chronic ? 'text-critical' : 'text-ink'}`}>
                          {row.slips}
                        </span>
                        {row.pullIns > 0 && (
                          <span className="text-[10px] text-ink-2"> (−{row.pullIns})</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onOpenDrillDown({ title: row.title || 'Negócio', ids: [row.leadId] })
                          }
                        >
                          Ver negócio
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
