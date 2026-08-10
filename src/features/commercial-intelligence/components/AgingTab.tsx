import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { DealDrillDownDrawer, type DrillDownQuery } from './DealDrillDownDrawer';
import { commercialIntelligenceApi, formatCurrency, type AgingReport, type CommercialFilter } from '../commercialIntelligence.api';

const DATA_QUALITY_LABEL = { measured: 'Medido', estimated: 'Estimado', unknown: 'Não disponível' } as const;

export function AgingTab({ filter }: { filter: CommercialFilter }) {
    const [data, setData] = useState<AgingReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drillDown, setDrillDown] = useState<DrillDownQuery | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .aging()
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, []);

    if (loading) return <Skeleton className="h-64 rounded-2xl" />;
    if (error) return <div className="flex items-center gap-2 text-sm text-[#d03b3b] py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
    if (!data) return null;

    const totalOpen = data.buckets.reduce((sum, b) => sum + b.count, 0);
    if (totalOpen === 0) {
        return <EmptyState title="Nenhum negócio aberto" description="Aging é calculado sobre negócios abertos do funil Negócio." />;
    }

    return (
        <div className="space-y-6">
            <Card padding="sm">
                <h3 className="text-sm font-bold text-ink mb-3">Aging de oportunidades (desde a criação)</h3>
                <div className="space-y-2">
                    {data.buckets.map((bucket) => (
                        <div key={bucket.label} className="flex items-center gap-3">
                            <div className="w-24 shrink-0 text-xs font-semibold text-ink">{bucket.label}</div>
                            <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                                <div
                                    className={`h-full rounded-md ${bucket.minDays >= 61 ? 'bg-[#d03b3b]/70' : 'bg-brand/70'}`}
                                    style={{ width: `${totalOpen > 0 ? Math.max(bucket.count > 0 ? 4 : 0, (bucket.count / totalOpen) * 100) : 0}%` }}
                                />
                            </div>
                            <div className="w-12 shrink-0 text-right text-xs [font-variant-numeric:tabular-nums] text-ink">{bucket.count}</div>
                            <div className="w-24 shrink-0 text-right text-[11px] text-ink-2 [font-variant-numeric:tabular-nums]">{formatCurrency(bucket.amount)}</div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card padding="sm">
                <h3 className="text-sm font-bold text-ink mb-1">Aging por etapa</h3>
                <p className="text-[11px] text-ink-2 mb-3">
                    Limiar crítico: {data.criticalThresholdDays} dias na etapa atual.
                    {data.trackingSince ? ` Rastreado desde ${new Date(data.trackingSince).toLocaleDateString('pt-BR')}.` : ' Ainda sem histórico de transição registrado — dados abaixo são estimados.'}
                </p>
                {data.byStage.length === 0 ? (
                    <p className="text-xs text-ink-2">Nenhum negócio aberto em etapa configurada.</p>
                ) : (
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-ink-2 border-b border-line">
                                <th className="text-left font-semibold py-1.5">Etapa</th>
                                <th className="text-right font-semibold py-1.5">Qtd.</th>
                                <th className="text-right font-semibold py-1.5">Dias médios</th>
                                <th className="text-right font-semibold py-1.5">Acima do crítico</th>
                                <th className="text-right font-semibold py-1.5">Qualidade</th>
                            </tr>
                        </thead>
                        <tbody className="[font-variant-numeric:tabular-nums]">
                            {data.byStage.map((stage) => (
                                <tr key={stage.stageId} className="border-b border-line last:border-0">
                                    <td className="py-1.5 text-ink font-semibold">{stage.stageName}</td>
                                    <td className="py-1.5 text-right text-ink-2">{stage.count}</td>
                                    <td className="py-1.5 text-right text-ink-2">{stage.averageDaysInStage ?? '—'}</td>
                                    <td className="py-1.5 text-right">
                                        {stage.amountOverThreshold > 0 ? (
                                            <button
                                                type="button"
                                                className="text-[#d03b3b] font-semibold underline decoration-dotted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                                                onClick={() => setDrillDown({ title: `Acima do aging crítico — ${stage.stageName}`, stageId: stage.stageId, agingCritical: true })}
                                            >
                                                {formatCurrency(stage.amountOverThreshold)}
                                            </button>
                                        ) : (
                                            <span className="text-ink-2">—</span>
                                        )}
                                    </td>
                                    <td className="py-1.5 text-right">
                                        <Badge variant={stage.dataQuality === 'measured' ? 'success' : stage.dataQuality === 'estimated' ? 'warning' : 'default'}>
                                            {DATA_QUALITY_LABEL[stage.dataQuality]}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>

            <DealDrillDownDrawer filter={filter} query={drillDown} onClose={() => setDrillDown(null)} />
        </div>
    );
}
