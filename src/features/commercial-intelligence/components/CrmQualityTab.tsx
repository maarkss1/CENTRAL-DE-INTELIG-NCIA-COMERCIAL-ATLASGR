import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { KpiTile } from './KpiTile';
import { commercialIntelligenceApi, formatPercent, type CommercialFilter, type CrmQualityIndex } from '../commercialIntelligence.api';

export function CrmQualityTab({ filter }: { filter: CommercialFilter }) {
    const [data, setData] = useState<CrmQualityIndex | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .crmQuality(filter)
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [filter]);

    if (loading) return <Skeleton className="h-64 rounded-2xl" />;
    if (error) return <div className="flex items-center gap-2 text-sm text-[#d03b3b] py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
    if (!data) return null;

    if (data.evaluatedCount === 0) {
        return <EmptyState title="Nenhum negócio aberto para avaliar" description="A qualidade do CRM é medida sobre os negócios abertos do funil Negócio." />;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
                <KpiTile label="Índice geral de completude" value={formatPercent(data.overallScore)} tone={data.overallScore != null && data.overallScore >= 80 ? 'good' : data.overallScore != null && data.overallScore < 50 ? 'critical' : undefined} metricKey="qualidade_crm" />
                <KpiTile label="Grupos com duplicidade suspeita" value={String(data.suspectedDuplicateGroups)} tone={data.suspectedDuplicateGroups > 0 ? 'critical' : 'good'} />
            </div>

            <Card padding="sm">
                <h3 className="text-sm font-bold text-ink mb-3">Completude por campo ({data.evaluatedCount} negócio(s) abertos avaliados)</h3>
                <div className="space-y-2">
                    {data.fields.map((field) => (
                        <div key={field.field} className="flex items-center gap-3">
                            <div className="w-32 shrink-0 text-xs font-semibold text-ink">{field.label}</div>
                            <div className="flex-1 h-5 rounded-md bg-surface-2 overflow-hidden">
                                <div
                                    className={`h-full rounded-md ${field.completeness != null && field.completeness >= 80 ? 'bg-[#0ca30c]/70' : field.completeness != null && field.completeness < 50 ? 'bg-[#d03b3b]/70' : 'bg-brand/70'}`}
                                    style={{ width: `${field.completeness ?? 0}%` }}
                                />
                            </div>
                            <div className="w-28 shrink-0 text-right text-[11px] text-ink-2 [font-variant-numeric:tabular-nums]">
                                {formatPercent(field.completeness)} ({field.filled}/{field.total})
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
