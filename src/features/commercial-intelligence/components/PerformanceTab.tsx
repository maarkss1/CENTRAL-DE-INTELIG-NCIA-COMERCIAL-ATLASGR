import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { KpiTile } from './KpiTile';
import { DealDrillDownDrawer, type DrillDownQuery } from './DealDrillDownDrawer';
import {
    commercialIntelligenceApi, formatCurrency, formatPercent,
    type CommercialFilter, type PerformanceMetrics, type HistoricalTrendsReport,
} from '../commercialIntelligence.api';

function DaysLabel(days: number | null): string {
    if (days == null) return 'Não disponível';
    return `${days} dia(s)`;
}

/**
 * Tendências — 6 meses (seção 23). Cada linha é uma métrica, cada coluna um mês — mesma
 * composição de barra inline já usada em "Completude por campo"/"Confiabilidade dos Dados",
 * reaproveitada em vez de introduzir uma biblioteca de gráfico nova para 6 pontos por métrica.
 */
function TrendsCard({ data }: { data: HistoricalTrendsReport }) {
    const maxTicket = Math.max(1, ...data.points.map((p) => p.averageTicketWon ?? 0));
    const maxPipeline = Math.max(1, ...data.points.map((p) => p.pipelineCreatedAmount ?? 0));

    return (
        <Card padding="sm">
            <h3 className="text-sm font-bold text-ink mb-1">Tendências — 6 meses</h3>
            <p className="text-[11px] text-ink-2 mb-3">Win Rate, Sales Cycle, Ticket Médio (ganho) e Pipeline Criado por mês. Meses sem amostra suficiente aparecem como &ldquo;Não disponível&rdquo;, nunca interpolados.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                    <thead>
                        <tr className="text-ink-2 border-b border-line">
                            <th className="text-left font-semibold py-1.5">Mês</th>
                            <th className="text-right font-semibold py-1.5">Win Rate</th>
                            <th className="text-right font-semibold py-1.5">Sales Cycle</th>
                            <th className="text-right font-semibold py-1.5">Ticket Médio</th>
                            <th className="text-right font-semibold py-1.5">Pipeline Criado</th>
                        </tr>
                    </thead>
                    <tbody className="[font-variant-numeric:tabular-nums]">
                        {data.points.map((p) => (
                            <tr key={p.period} className="border-b border-line last:border-0">
                                <td className="py-1.5 font-bold text-ink">{p.label}</td>
                                <td className="py-1.5 text-right text-ink-2">{formatPercent(p.winRate)}</td>
                                <td className="py-1.5 text-right text-ink-2">{DaysLabel(p.salesCycleMeanDays)}</td>
                                <td className="py-1.5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="w-16 h-2 rounded-full bg-surface-2 overflow-hidden">
                                            <div className="h-full bg-brand/70 rounded-full" style={{ width: `${p.averageTicketWon != null ? Math.max(4, (p.averageTicketWon / maxTicket) * 100) : 0}%` }} />
                                        </div>
                                        <span className="text-ink-2 w-20 text-right">{formatCurrency(p.averageTicketWon)}</span>
                                    </div>
                                </td>
                                <td className="py-1.5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="w-16 h-2 rounded-full bg-surface-2 overflow-hidden">
                                            <div className="h-full bg-brand/70 rounded-full" style={{ width: `${p.pipelineCreatedAmount != null ? Math.max(4, (p.pipelineCreatedAmount / maxPipeline) * 100) : 0}%` }} />
                                        </div>
                                        <span className="text-ink-2 w-20 text-right">{formatCurrency(p.pipelineCreatedAmount)}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

export function PerformanceTab({ filter }: { filter: CommercialFilter }) {
    const [data, setData] = useState<PerformanceMetrics | null>(null);
    const [trends, setTrends] = useState<HistoricalTrendsReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drillDown, setDrillDown] = useState<DrillDownQuery | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([commercialIntelligenceApi.performance(filter), commercialIntelligenceApi.trends(filter)])
            .then(([perf, trendsResult]) => {
                if (cancelled) return;
                setData(perf);
                setTrends(trendsResult);
            })
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [filter]);

    if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
    if (error) return <div className="flex items-center gap-2 text-sm text-critical py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
    if (!data) return null;

    const hasHistoricalFunnel = data.funnelHistoricalTrackingSince != null;
    const firstStageBase = hasHistoricalFunnel ? data.funnel[0]?.historicalReachedCount : data.funnel[0]?.count;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile label="Win Rate" value={formatPercent(data.winRate)} hint={`${data.wonCount} ganhos / ${data.lostCount} perdidos`} tone={data.winRate != null && data.winRate >= 50 ? 'good' : undefined} metricKey="win_rate" />
                <KpiTile label="Sales Cycle (mediana)" value={DaysLabel(data.salesCycle.medianDays)} hint={`Amostra: ${data.salesCycle.sampleSize}`} metricKey="sales_cycle" />
                <KpiTile label="Sales Cycle (média)" value={DaysLabel(data.salesCycle.meanDays)} metricKey="sales_cycle" />
                <KpiTile
                    label="Oportunidades abertas"
                    value={String(data.opportunities.open)}
                    hint={`${data.opportunities.eligible} elegível(is)`}
                    onClick={() => setDrillDown({ title: 'Negócios em aberto' })}
                />
                <KpiTile label="Ticket médio (aberto)" value={formatCurrency(data.averageTicket.open)} metricKey="ticket_medio" />
                <KpiTile label="Ticket médio (ganho)" value={formatCurrency(data.averageTicket.won)} tone="good" metricKey="ticket_medio" />
                <KpiTile label="Oportunidades em risco" value={String(data.opportunities.atRisk)} tone={data.opportunities.atRisk > 0 ? 'critical' : undefined} />
                <KpiTile
                    label="Paradas (aging crítico)"
                    value={String(data.opportunities.stalled)}
                    tone={data.opportunities.stalled > 0 ? 'critical' : undefined}
                    onClick={data.opportunities.stalled > 0 ? () => setDrillDown({ title: 'Negócios parados (aging crítico)', agingCritical: true }) : undefined}
                />
            </div>

            <Card padding="sm">
                <h3 className="text-sm font-bold text-ink mb-1">Conversão por etapa — funil Negócio</h3>
                <p className="text-[11px] text-ink-2 mb-3">
                    {hasHistoricalFunnel
                        ? 'Baseado em movimentação real registrada (LeadStageHistory) — quantos negócios de fato chegaram a cada etapa, não só onde estão agora.'
                        : 'Ainda sem histórico de movimentação suficiente — mostrando o snapshot atual (onde os negócios estão agora).'}
                </p>
                {data.funnel.length === 0 ? (
                    <p className="text-xs text-ink-2">Nenhuma etapa configurada no pipeline de Negócios ainda.</p>
                ) : (
                    <div className="space-y-2">
                        {data.funnel.map((stage) => {
                            const primaryCount = hasHistoricalFunnel ? stage.historicalReachedCount : stage.count;
                            const primaryConversion = hasHistoricalFunnel ? stage.historicalConversionFromPrevious : stage.conversionFromPrevious;
                            return (
                                <div key={stage.stageId} className="flex items-center gap-3">
                                    <div className="w-40 shrink-0 text-xs font-semibold text-ink truncate" title={stage.label}>{stage.label}</div>
                                    <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                                        <div
                                            className="h-full bg-brand/70 rounded-md"
                                            style={{ width: `${Math.max(4, Math.min(100, firstStageBase && firstStageBase > 0 ? (primaryCount / firstStageBase) * 100 : 0))}%` }}
                                        />
                                    </div>
                                    <div className="w-16 shrink-0 text-right text-xs [font-variant-numeric:tabular-nums] text-ink">{primaryCount}</div>
                                    <div className="w-20 shrink-0 text-right text-[11px] text-ink-2">{primaryConversion != null ? formatPercent(primaryConversion) : '—'}</div>
                                    <div className="w-24 shrink-0 text-right text-[11px] text-ink-2" title="Dias médios na etapa">
                                        {stage.averageDaysInStage != null ? `${stage.averageDaysInStage}d na etapa` : 'Sem histórico'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {trends && <TrendsCard data={trends} />}

            <DealDrillDownDrawer filter={filter} query={drillDown} onClose={() => setDrillDown(null)} />
        </div>
    );
}
