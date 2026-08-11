import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { KpiTile } from './KpiTile';
import { DealDrillDownDrawer, type DrillDownQuery } from './DealDrillDownDrawer';
import {
    commercialIntelligenceApi, formatCurrency, formatPercent,
    type CommercialFilter, type PerformanceMetrics,
} from '../commercialIntelligence.api';

function DaysLabel(days: number | null): string {
    if (days == null) return 'Não disponível';
    return `${days} dia(s)`;
}

export function PerformanceTab({ filter }: { filter: CommercialFilter }) {
    const [data, setData] = useState<PerformanceMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drillDown, setDrillDown] = useState<DrillDownQuery | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .performance(filter)
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [filter]);

    if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
    if (error) return <div className="flex items-center gap-2 text-sm text-[#d03b3b] py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
    if (!data) return null;

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
                <h3 className="text-sm font-bold text-ink mb-3">Conversão por etapa — funil Negócio</h3>
                {data.funnel.length === 0 ? (
                    <p className="text-xs text-ink-2">Nenhuma etapa configurada no pipeline de Negócios ainda.</p>
                ) : (
                    <div className="space-y-2">
                        {data.funnel.map((stage) => (
                            <div key={stage.stageId} className="flex items-center gap-3">
                                <div className="w-40 shrink-0 text-xs font-semibold text-ink truncate" title={stage.label}>{stage.label}</div>
                                <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                                    <div
                                        className="h-full bg-brand/70 rounded-md"
                                        style={{ width: `${Math.max(4, Math.min(100, data.funnel[0].count > 0 ? (stage.count / data.funnel[0].count) * 100 : 0))}%` }}
                                    />
                                </div>
                                <div className="w-16 shrink-0 text-right text-xs [font-variant-numeric:tabular-nums] text-ink">{stage.count}</div>
                                <div className="w-20 shrink-0 text-right text-[11px] text-ink-2">{stage.conversionFromPrevious != null ? formatPercent(stage.conversionFromPrevious) : '—'}</div>
                                <div className="w-24 shrink-0 text-right text-[11px] text-ink-2" title="Dias médios na etapa">
                                    {stage.averageDaysInStage != null ? `${stage.averageDaysInStage}d na etapa` : 'Sem histórico'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <DealDrillDownDrawer filter={filter} query={drillDown} onClose={() => setDrillDown(null)} />
        </div>
    );
}
