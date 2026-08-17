import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { KpiTile } from './KpiTile';
import { commercialIntelligenceApi, formatCurrency, type CommercialFilter, type LossAnalysis } from '../commercialIntelligence.api';

export function LossesTab({ filter }: { filter: CommercialFilter }) {
    const [data, setData] = useState<LossAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .losses(filter)
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [filter]);

    if (loading) return <Skeleton className="h-64 rounded-2xl" />;
    if (error) return <div className="flex items-center gap-2 text-sm text-critical py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
    if (!data) return null;

    if (data.totalCount === 0) {
        return <EmptyState title="Nenhum negócio perdido neste período" description="Motivos de perda são classificados a partir de negócios com status Negócios Perdidos fechados no mês selecionado." />;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
                <KpiTile label="Total perdido" value={formatCurrency(data.totalAmount)} hint={`${data.totalCount} negócio(s)`} tone="critical" metricKey="motivos_perda" />
                <KpiTile label="Motivo mais frequente" value={data.byReason[0]?.reason ?? 'Não disponível'} hint={data.byReason[0] ? `${data.byReason[0].count} negócio(s)` : undefined} />
            </div>

            <Card padding="sm">
                <h3 className="text-sm font-bold text-ink mb-3">Por motivo</h3>
                <div className="space-y-2">
                    {data.byReason.map((row) => (
                        <div key={row.reason} className="flex items-center gap-3">
                            <div className="w-32 shrink-0 text-xs font-semibold text-ink truncate" title={row.reason}>{row.reason}</div>
                            <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                                <div
                                    className="h-full rounded-md bg-critical/70"
                                    style={{ width: `${data.totalAmount > 0 ? Math.max(4, (row.amount / data.totalAmount) * 100) : 0}%` }}
                                />
                            </div>
                            <div className="w-12 shrink-0 text-right text-xs [font-variant-numeric:tabular-nums] text-ink">{row.count}</div>
                            <div className="w-24 shrink-0 text-right text-[11px] text-ink-2 [font-variant-numeric:tabular-nums]">{formatCurrency(row.amount)}</div>
                        </div>
                    ))}
                </div>
            </Card>

            {data.sampleObservations.length > 0 && (
                <Card padding="sm">
                    <h3 className="text-sm font-bold text-ink mb-3">Observações (amostra)</h3>
                    <ul className="space-y-2 text-xs">
                        {data.sampleObservations.map((obs) => (
                            <li key={obs.leadId} className="border-b border-line last:border-0 pb-2">
                                <p className="font-semibold text-ink">{obs.title || 'Sem título'} <span className="text-ink-2 font-normal">— {obs.reason}</span></p>
                                <p className="text-ink-2">{obs.observation || 'Sem observação registrada'}</p>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}
