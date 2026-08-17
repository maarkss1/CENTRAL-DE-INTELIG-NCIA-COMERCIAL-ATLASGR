import { useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { commercialIntelligenceApi, type LeadingIndicatorsReport } from '../commercialIntelligence.api';

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

/** Sparkline de 4 barras (uma por semana da janela de `movingAverage4w`) — a série já era calculada no backend e descartada; só passou a ser exposta. Mais antiga → mais recente, da esquerda pra direita. */
function Sparkline({ series, trend }: { series: number[]; trend: 'up' | 'down' | 'flat' }) {
    const max = Math.max(...series, 1);
    const barClass = trend === 'up' ? 'bg-[#0ca30c]/70' : trend === 'down' ? 'bg-critical/70' : 'bg-ink-2/50';
    return (
        <div className="flex items-end gap-0.5 h-6 w-12 ml-auto" role="img" aria-label={`Últimas 4 semanas: ${series.join(', ')}`}>
            {series.map((value, i) => (
                <div
                    key={i}
                    className={`flex-1 rounded-sm ${barClass}`}
                    style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
                />
            ))}
        </div>
    );
}

export function LeadingIndicatorsTab() {
    const [data, setData] = useState<LeadingIndicatorsReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .leadingIndicators()
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, []);

    if (loading) return <Skeleton className="h-64 rounded-2xl" />;
    if (error) return <div className="flex items-center gap-2 text-sm text-critical py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
    if (!data) return null;

    return (
        <div className="space-y-4">
            <p className="text-xs text-ink-2">
                Semana de {new Date(data.weekStart).toLocaleDateString('pt-BR')} a {new Date(data.weekEnd).toLocaleDateString('pt-BR')}.
                {data.trackingSince && ` Histórico de etapa rastreado desde ${new Date(data.trackingSince).toLocaleDateString('pt-BR')}.`}
            </p>
            <Card padding="sm">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-ink-2 border-b border-line">
                            <th className="text-left font-semibold py-2">Indicador</th>
                            <th className="text-right font-semibold py-2">Atual</th>
                            <th className="text-right font-semibold py-2">Semana anterior</th>
                            <th className="text-right font-semibold py-2">Média móvel (4 sem.)</th>
                            <th className="text-right font-semibold py-2">Últimas 4 semanas</th>
                            <th className="text-right font-semibold py-2">Tendência</th>
                        </tr>
                    </thead>
                    <tbody className="[font-variant-numeric:tabular-nums]">
                        {data.indicators.map((point) => {
                            const Icon = TREND_ICON[point.trend];
                            const toneClass = point.trend === 'up' ? 'text-[#0ca30c]' : point.trend === 'down' ? 'text-critical' : 'text-ink-2';
                            return (
                                <tr key={point.label} className="border-b border-line last:border-0">
                                    <td className="py-2 text-ink font-semibold">{point.label}</td>
                                    <td className="py-2 text-right text-ink">{point.current}</td>
                                    <td className="py-2 text-right text-ink-2">{point.previousWeek}</td>
                                    <td className="py-2 text-right text-ink-2">{point.movingAverage4w}</td>
                                    <td className="py-2">
                                        <Sparkline series={point.weeklySeries} trend={point.trend} />
                                    </td>
                                    <td className={`py-2 text-right ${toneClass}`}>
                                        <Icon className="w-3.5 h-3.5 inline" aria-label={point.trend === 'up' ? 'Em alta' : point.trend === 'down' ? 'Em queda' : 'Estável'} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}
