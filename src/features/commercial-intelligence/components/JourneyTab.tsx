import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, RotateCcw, Route, UserX } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { KpiTile } from './KpiTile';
import { MetricInfo } from './MetricInfo';
import { DealDrillDownDrawer, type DrillDownQuery } from './DealDrillDownDrawer';
import {
  commercialIntelligenceApi,
  formatCurrency,
  type CommercialFilter,
  type JourneyReport,
} from '../commercialIntelligence.api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function SectionHeader({
  icon: Icon,
  title,
  metricKey,
  description,
}: {
  icon: typeof Route;
  title: string;
  metricKey: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <MetricInfo metricKey={metricKey} />
        </div>
        <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-ink-2">{description}</p>
      </div>
    </div>
  );
}

const STATUS_LABEL = { aberto: 'Aberto', ganho: 'Ganho', perdido: 'Perdido' } as const;
const SOURCE_LABEL: Record<string, string> = {
  crm: 'Edição no CRM',
  crm360: 'Cockpit CRM',
  batch: 'Em lote',
  round_robin: 'Atribuição automática',
};

/**
 * Jornada — handoffs, reentradas (recuperados/reativados), clientes sem interação e mapa de
 * transições, sempre a partir de histórico real (LeadFieldChange/LeadStageHistory). Cada bloco diz
 * desde quando o histórico existe; sem histórico, o estado é explícito, nunca uma jornada inferida.
 */
export function JourneyTab({ filter }: { filter: CommercialFilter }) {
  const [data, setData] = useState<JourneyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownQuery | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    commercialIntelligenceApi
      .journey(filter)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter]);

  if (loading)
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  if (error)
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-critical">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}
      </div>
    );
  if (!data) return null;

  const { handoffs, reentries, noInteraction, transitions } = data;

  return (
    <div className="space-y-5">
      {/* ─── Clientes parados / sem interação ─────────────────────────────── */}
      <Card padding="sm" accentBar>
        <SectionHeader
          icon={UserX}
          title="Clientes parados (sem interação)"
          metricKey="sem_interacao"
          description={`Negócios abertos sem interação há mais de ${noInteraction.thresholdDays} dias ou sem nenhuma interação registrada — ${noInteraction.openDealsEvaluated} aberto(s) avaliado(s).`}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiTile
            label="Parados"
            value={String(noInteraction.count)}
            hint={`${noInteraction.neverInteractedCount} nunca tiveram interação`}
            tone={noInteraction.count > 0 ? 'critical' : 'good'}
            onClick={
              noInteraction.rows.length > 0
                ? () =>
                    setDrillDown({
                      title: 'Negócios parados (sem interação)',
                      ids: noInteraction.rows.map((r) => r.leadId),
                    })
                : undefined
            }
          />
          <KpiTile label="Valor parado" value={formatCurrency(noInteraction.amount)} />
          <KpiTile
            label="% do pipeline aberto"
            value={
              noInteraction.openDealsEvaluated > 0
                ? `${Math.round((noInteraction.count / noInteraction.openDealsEvaluated) * 100)}%`
                : 'Não disponível'
            }
            hint="Em quantidade de negócios"
          />
        </div>
        {noInteraction.rows.length > 0 && (
          <div
            className="mt-4 overflow-x-auto"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável horizontal precisa ser focável por teclado (axe scrollable-region-focusable), mesmo padrão de CrmBoard.tsx
            tabIndex={0}
            role="region"
            aria-label="Tabela de negócios sem interação (rolável)"
          >
            <table className="w-full min-w-[640px] text-xs">
              <caption className="sr-only">Negócios abertos sem interação recente</caption>
              <thead>
                <tr className="border-b border-line text-ink-2">
                  <th className="py-1.5 text-left font-semibold">Negócio</th>
                  <th className="py-1.5 text-left font-semibold">Responsável</th>
                  <th className="py-1.5 text-left font-semibold">Etapa</th>
                  <th className="py-1.5 text-right font-semibold">Valor</th>
                  <th className="py-1.5 text-right font-semibold">Sem interação há</th>
                  <th className="py-1.5 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="[font-variant-numeric:tabular-nums]">
                {noInteraction.rows.slice(0, 15).map((row) => (
                  <tr key={row.leadId} className="border-b border-line last:border-0">
                    <td className="py-1.5">
                      <p className="font-semibold text-ink">
                        {row.title || row.companyName || row.leadId}
                      </p>
                      <p className="text-[10px] text-ink-2">
                        {row.companyName ?? '—'} · {row.tier}
                      </p>
                    </td>
                    <td className="py-1.5 text-ink-2">{row.owner ?? 'Sem responsável'}</td>
                    <td className="py-1.5 text-ink-2">{row.stageName ?? '—'}</td>
                    <td className="py-1.5 text-right text-ink">{formatCurrency(row.amount)}</td>
                    <td className="py-1.5 text-right text-critical font-semibold">
                      {row.daysSinceInteraction != null
                        ? `${row.daysSinceInteraction} dias`
                        : 'Nunca'}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDrillDown({ title: row.title || 'Negócio', ids: [row.leadId] })
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
      </Card>

      {/* ─── Handoffs ─────────────────────────────────────────────────────── */}
      <Card padding="sm">
        <SectionHeader
          icon={ArrowRightLeft}
          title="Handoffs e trocas de responsável"
          metricKey="handoffs"
          description={
            handoffs.trackingSince
              ? `Trocas de responsável rastreadas desde ${formatDate(handoffs.trackingSince)}.`
              : 'Nenhuma troca de responsável registrada ainda — o histórico começa a partir de agora, a cada troca real feita no CRM.'
          }
        />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiTile
            label="Trocas no mês"
            value={String(handoffs.countInPeriod)}
            hint={`${handoffs.dealsWithHandoffInPeriod} negócio(s) trocaram de mão`}
          />
          <KpiTile
            label="Abertos com 2+ trocas"
            value={String(handoffs.openDealsWithMultipleHandoffs)}
            hint="Retrabalho de relacionamento"
            tone={handoffs.openDealsWithMultipleHandoffs > 0 ? 'critical' : 'neutral'}
          />
          <KpiTile label="Pares de→para no mês" value={String(handoffs.byPair.length)} />
        </div>
        {handoffs.byPair.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Trocas por par de responsáveis">
            {handoffs.byPair.slice(0, 10).map((pair) => (
              <li
                key={`${pair.fromOwner}-${pair.toOwner}`}
                className="rounded-full border border-line bg-surface-2/60 px-3 py-1 text-[11px] text-ink"
              >
                {pair.fromOwner ?? 'Sem responsável'} → {pair.toOwner ?? 'Sem responsável'}{' '}
                <span className="font-bold">×{pair.count}</span>
              </li>
            ))}
          </ul>
        )}
        {handoffs.recent.length > 0 && (
          <div
            className="mt-4 overflow-x-auto"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável horizontal precisa ser focável por teclado (axe scrollable-region-focusable), mesmo padrão de CrmBoard.tsx
            tabIndex={0}
            role="region"
            aria-label="Tabela de trocas de responsável (rolável)"
          >
            <table className="w-full min-w-[640px] text-xs">
              <caption className="sr-only">Trocas de responsável recentes</caption>
              <thead>
                <tr className="border-b border-line text-ink-2">
                  <th className="py-1.5 text-left font-semibold">Quando</th>
                  <th className="py-1.5 text-left font-semibold">Negócio</th>
                  <th className="py-1.5 text-left font-semibold">De → Para</th>
                  <th className="py-1.5 text-left font-semibold">Origem</th>
                  <th className="py-1.5 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="[font-variant-numeric:tabular-nums]">
                {handoffs.recent.slice(0, 15).map((row) => (
                  <tr
                    key={`${row.leadId}-${row.changedAt}`}
                    className="border-b border-line last:border-0"
                  >
                    <td className="py-1.5 text-ink-2">{formatDate(row.changedAt)}</td>
                    <td className="py-1.5">
                      <p className="font-semibold text-ink">
                        {row.title || row.companyName || row.leadId}
                      </p>
                      <p className="text-[10px] text-ink-2">{row.isOpen ? 'Aberto' : 'Fechado'}</p>
                    </td>
                    <td className="py-1.5 text-ink">
                      {row.fromOwner ?? 'Sem responsável'} → {row.toOwner ?? 'Sem responsável'}
                    </td>
                    <td className="py-1.5 text-ink-2">{SOURCE_LABEL[row.source] ?? row.source}</td>
                    <td className="py-1.5 text-right text-ink-2">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── Reentradas ───────────────────────────────────────────────────── */}
      <Card padding="sm">
        <SectionHeader
          icon={RotateCcw}
          title="Reentradas — recuperados e reativados"
          metricKey="reentradas"
          description={
            reentries.trackingSince
              ? `Negócios que saíram de uma etapa terminal (ganho/perdido/cancelado) e voltaram ao funil, segundo o histórico de etapa desde ${formatDate(reentries.trackingSince)}.`
              : 'Nenhum histórico de etapa registrado ainda — reentradas passam a ser detectadas a cada movimentação real no Kanban.'
          }
        />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            label="Reentradas no mês"
            value={String(reentries.countInPeriod)}
            hint={`${reentries.totalTracked} em todo o histórico`}
          />
          <KpiTile
            label="Recuperados (ganhos)"
            value={String(reentries.recoveredCount)}
            hint={formatCurrency(reentries.recoveredAmount)}
            tone={reentries.recoveredCount > 0 ? 'good' : 'neutral'}
          />
          <KpiTile
            label="Reativados (abertos)"
            value={String(reentries.reactivatedOpenCount)}
            hint={formatCurrency(reentries.reactivatedOpenAmount)}
            onClick={
              reentries.reactivatedOpenCount > 0
                ? () =>
                    setDrillDown({
                      title: 'Negócios reativados em andamento',
                      ids: reentries.rows
                        .filter((r) => r.currentStatus === 'aberto')
                        .map((r) => r.leadId),
                    })
                : undefined
            }
          />
          <KpiTile
            label="Voltaram a perder"
            value={String(reentries.rows.filter((r) => r.currentStatus === 'perdido').length)}
            hint="Reentrada que terminou perdida de novo"
          />
        </div>
        {reentries.rows.length > 0 && (
          <div
            className="mt-4 overflow-x-auto"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável horizontal precisa ser focável por teclado (axe scrollable-region-focusable), mesmo padrão de CrmBoard.tsx
            tabIndex={0}
            role="region"
            aria-label="Tabela de reentradas (rolável)"
          >
            <table className="w-full min-w-[640px] text-xs">
              <caption className="sr-only">Reentradas recentes</caption>
              <thead>
                <tr className="border-b border-line text-ink-2">
                  <th className="py-1.5 text-left font-semibold">Quando</th>
                  <th className="py-1.5 text-left font-semibold">Negócio</th>
                  <th className="py-1.5 text-left font-semibold">Saiu de → Voltou para</th>
                  <th className="py-1.5 text-left font-semibold">Hoje</th>
                  <th className="py-1.5 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="[font-variant-numeric:tabular-nums]">
                {reentries.rows.slice(0, 15).map((row) => (
                  <tr
                    key={`${row.leadId}-${row.reenteredAt}`}
                    className="border-b border-line last:border-0"
                  >
                    <td className="py-1.5 text-ink-2">{formatDate(row.reenteredAt)}</td>
                    <td className="py-1.5">
                      <p className="font-semibold text-ink">
                        {row.title || row.companyName || row.leadId}
                      </p>
                      <p className="text-[10px] text-ink-2">{row.owner ?? 'Sem responsável'}</p>
                    </td>
                    <td className="py-1.5 text-ink">
                      {row.fromTerminalStage} → {row.toStage}
                    </td>
                    <td
                      className={`py-1.5 font-semibold ${row.currentStatus === 'ganho' ? 'text-success-active dark:text-success' : row.currentStatus === 'perdido' ? 'text-critical' : 'text-ink'}`}
                    >
                      {STATUS_LABEL[row.currentStatus]}
                    </td>
                    <td className="py-1.5 text-right text-ink-2">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── Mapa de transições ───────────────────────────────────────────── */}
      <Card padding="sm">
        <SectionHeader
          icon={Route}
          title="Mapa de transições (etapa → etapa)"
          metricKey="mapa_transicoes"
          description={
            transitions.trackingSince
              ? `${transitions.totalTransitions} transição(ões) registrada(s) desde ${formatDate(transitions.trackingSince)} — ${transitions.backwardTransitions} regressão(ões) para etapa anterior.`
              : 'Nenhuma transição de etapa registrada ainda no escopo selecionado.'
          }
        />
        {transitions.edges.length > 0 && (
          <div
            className="mt-4 overflow-x-auto"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável horizontal precisa ser focável por teclado (axe scrollable-region-focusable), mesmo padrão de CrmBoard.tsx
            tabIndex={0}
            role="region"
            aria-label="Tabela de transições entre etapas (rolável)"
          >
            <table className="w-full min-w-[560px] text-xs">
              <caption className="sr-only">Transições entre etapas</caption>
              <thead>
                <tr className="border-b border-line text-ink-2">
                  <th className="py-1.5 text-left font-semibold">De</th>
                  <th className="py-1.5 text-left font-semibold">Para</th>
                  <th className="py-1.5 text-right font-semibold">Vezes</th>
                  <th className="py-1.5 text-right font-semibold">Mediana de dias na origem</th>
                  <th className="py-1.5 text-right font-semibold">Sentido</th>
                </tr>
              </thead>
              <tbody className="[font-variant-numeric:tabular-nums]">
                {transitions.edges.slice(0, 25).map((edge) => (
                  <tr
                    key={`${edge.fromStage}-${edge.toStage}`}
                    className="border-b border-line last:border-0"
                  >
                    <td className="py-1.5 text-ink">{edge.fromStage}</td>
                    <td className="py-1.5 text-ink">{edge.toStage}</td>
                    <td className="py-1.5 text-right font-semibold text-ink">{edge.count}</td>
                    <td className="py-1.5 text-right text-ink-2">
                      {edge.medianDaysInFrom != null ? `${edge.medianDaysInFrom} d` : '—'}
                    </td>
                    <td
                      className={`py-1.5 text-right ${edge.backward ? 'text-critical font-semibold' : 'text-ink-2'}`}
                    >
                      {edge.backward ? 'Regressão' : 'Avanço'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DealDrillDownDrawer filter={filter} query={drillDown} onClose={() => setDrillDown(null)} />
    </div>
  );
}
