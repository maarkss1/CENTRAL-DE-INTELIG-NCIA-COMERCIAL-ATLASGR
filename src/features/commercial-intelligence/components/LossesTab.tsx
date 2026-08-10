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
    if (error) return <div className="flex items-center gap-2 text-sm text-[#d03b3b] py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
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
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-ink-2 border-b border-line">
                            <th className="text-left font-semibold py-1.5">Motivo</th>
                            <th className="text-right font-semibold py-1.5">Qtd.</th>
                            <th className="text-right font-semibold py-1.5">Valor</th>
                        </tr>
                    </thead>
                    <tbody className="[font-variant-numeric:tabular-nums]">
                        {data.byReason.map((row) => (
                            <tr key={row.reason} className="border-b border-line last:border-0">
                                <td className="py-1.5 text-ink">{row.reason}</td>
                                <td className="py-1.5 text-right text-ink-2">{row.count}</td>
                                <td className="py-1.5 text-right text-ink-2">{formatCurrency(row.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
