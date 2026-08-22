import { Card } from '../../../components/ui/Card';
import { formatPercent, type FunnelStageConversion } from '../commercialIntelligence.api';

interface FunnelConversionCardProps {
    funnel: FunnelStageConversion[];
    trackingSince: string | null;
}

/**
 * Cascata de conversão por etapa do funil Negócio — extraído de `PerformanceTab.tsx` para ser
 * reaproveitado também no Cockpit (Visão Executiva), que já busca os mesmos dados via
 * `performance.funnel` e não precisa de uma segunda chamada de API.
 */
export function FunnelConversionCard({ funnel, trackingSince }: FunnelConversionCardProps) {
    const hasHistoricalFunnel = trackingSince != null;
    const firstStageBase = hasHistoricalFunnel ? funnel[0]?.historicalReachedCount : funnel[0]?.count;

    return (
        <Card padding="sm">
            <h3 className="text-sm font-bold text-ink mb-1">Funil — conversão por etapa</h3>
            <p className="text-[11px] text-ink-2 mb-3">
                {hasHistoricalFunnel
                    ? 'Baseado em movimentação real registrada (LeadStageHistory) — quantos negócios de fato chegaram a cada etapa, não só onde estão agora.'
                    : 'Ainda sem histórico de movimentação suficiente — mostrando o snapshot atual (onde os negócios estão agora).'}
            </p>
            {funnel.length === 0 ? (
                <p className="text-xs text-ink-2">Nenhuma etapa configurada no pipeline de Negócios ainda.</p>
            ) : (
                <div className="space-y-2">
                    {funnel.map((stage) => {
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
    );
}
