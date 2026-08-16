import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { KpiTile } from './KpiTile';
import {
    commercialIntelligenceApi, formatCurrency, formatMultiple, formatPercent,
    type CommercialFilter, type PipelineCreation,
} from '../commercialIntelligence.api';

function BreakdownTable({ title, rows }: { title: string; rows: Array<{ label: string; count: number; amount: number }> }) {
    return (
        <Card padding="sm">
            <h3 className="text-sm font-bold text-ink mb-3">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-xs text-ink-2">Nenhum registro no período.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-ink-2 border-b border-line">
                            <th className="text-left font-semibold py-1.5">Grupo</th>
                            <th className="text-right font-semibold py-1.5">Qtd.</th>
                            <th className="text-right font-semibold py-1.5">Valor</th>
                        </tr>
                    </thead>
                    <tbody className="[font-variant-numeric:tabular-nums]">
                        {rows.map((row) => (
                            <tr key={row.label} className="border-b border-line last:border-0">
                                <td className="py-1.5 text-ink">{row.label}</td>
                                <td className="py-1.5 text-right text-ink-2">{row.count}</td>
                                <td className="py-1.5 text-right text-ink-2">{formatCurrency(row.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Card>
    );
}

export function PipelineForecastTab({ filter }: { filter: CommercialFilter }) {
    const [data, setData] = useState<PipelineCreation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .pipelineCreation(filter)
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [filter]);

    if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
    if (error) return <div className="flex items-center gap-2 text-sm text-[#d03b3b] py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
    if (!data) return null;

    if (data.count === 0) {
        return <EmptyState title="Nenhum negócio criado neste período" description="Pipeline Criado só conta negócios do funil Negócio efetivamente CRIADOS no mês selecionado — não os apenas movimentados." />;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile label="Pipeline Criado" value={formatCurrency(data.amount)} hint={`${data.count} negócio(s)`} metricKey="pipeline_criado" />
                <KpiTile label="Ticket Médio Criado" value={formatCurrency(data.averageTicket)} metricKey="ticket_medio" />
                <KpiTile label="Pipeline Necessário" value={formatCurrency(data.pipelineNeeded)} hint="Meta futura / Win Rate esperado" />
                <KpiTile
                    label="Creation Coverage"
                    value={formatMultiple(data.creationCoverage)}
                    tone={data.creationCoverage != null ? (data.creationCoverage >= 1 ? 'good' : 'critical') : undefined}
                    hint="Pipeline criado / Pipeline necessário"
                />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KpiTile
                    label="Ritmo de Criação"
                    value={formatPercent(data.pacePercent)}
                    tone={data.pacePercent != null ? (data.pacePercent >= 100 ? 'good' : 'critical') : undefined}
                    hint="Criado até hoje / ritmo necessário até hoje"
                    metricKey="pipeline_creation_pace"
                />
                <KpiTile
                    label="Gap de Ritmo"
                    value={data.paceGapAmount != null ? formatCurrency(data.paceGapAmount) : 'Não disponível'}
                    tone={data.paceGapAmount != null ? (data.paceGapAmount <= 0 ? 'good' : 'critical') : undefined}
                    hint={data.paceGapAmount != null && data.paceGapAmount < 0 ? 'À frente do ritmo' : 'Positivo = atrás do ritmo'}
                />
                <KpiTile
                    label="Dias úteis decorridos"
                    value={`${data.elapsedBusinessDays} / ${data.totalBusinessDays}`}
                    hint="No mês selecionado"
                />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
                <BreakdownTable title="Por origem" rows={data.bySource} />
                <BreakdownTable title="Por responsável" rows={data.byOwner} />
            </div>
        </div>
    );
}
