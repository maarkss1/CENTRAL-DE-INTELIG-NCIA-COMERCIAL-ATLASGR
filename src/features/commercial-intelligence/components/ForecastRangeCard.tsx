import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import {
    buildForecastRange, computeTrendMomentum, formatCurrency,
    type ExecutiveOverview, type HistoricalTrendsReport, type TrendDirection,
} from '../commercialIntelligence.api';

/**
 * Previsor — Faixa de Cenário. Não é um segundo modelo estatístico: os 3 números são a mesma
 * matemática do Forecast ponderado explicável já calculado (`buildForecastRange`), só recomposta em
 * 3 recortes (o que já fechou/está comprometido, o forecast oficial, e o teto se tudo em aberto
 * fechar). Nenhum I/O aqui — `overview`/`trends` já chegam carregados do tab pai.
 */
const SCENARIO_STYLE: Record<'conservative' | 'likely' | 'optimistic', { barClass: string; textClass: string }> = {
    conservative: { barClass: 'bg-ink-2/50', textClass: 'text-ink-2' },
    likely: { barClass: 'bg-brand', textClass: 'text-brand' },
    optimistic: { barClass: 'bg-[#0ca30c]', textClass: 'text-[#0ca30c]' },
};

const TREND_STYLE: Record<TrendDirection, { icon: typeof TrendingUp; label: string; className: string }> = {
    melhorando: { icon: TrendingUp, label: 'Win Rate melhorando', className: 'text-[#0ca30c] bg-[#0ca30c]/10 border-[#0ca30c]/20' },
    piorando: { icon: TrendingDown, label: 'Win Rate piorando', className: 'text-critical bg-critical/10 border-critical/20' },
    estavel: { icon: Minus, label: 'Win Rate estável', className: 'text-ink-2 bg-surface-2 border-line' },
};

interface ForecastRangeCardProps {
    overview: ExecutiveOverview;
    trends: HistoricalTrendsReport | null;
}

export function ForecastRangeCard({ overview, trends }: ForecastRangeCardProps) {
    const range = useMemo(() => buildForecastRange(overview), [overview]);
    const momentum = useMemo(() => (trends ? computeTrendMomentum(trends) : null), [trends]);

    const scenarios = [
        { key: 'conservative' as const, ...range.conservative },
        { key: 'likely' as const, ...range.likely },
        { key: 'optimistic' as const, ...range.optimistic },
    ];
    const max = Math.max(range.optimistic.amount, 1);

    return (
        <Card padding="sm">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                    <h2 className="text-sm font-bold text-ink">Faixa de Previsão — {overview.period}</h2>
                    <p className="text-[11px] text-ink-2 max-w-md">
                        Conservador (já garantido) → Provável (Forecast oficial) → Otimista (se tudo em aberto fechar).
                    </p>
                </div>
                {momentum && (() => {
                    const style = TREND_STYLE[momentum.direction];
                    const Icon = style.icon;
                    return (
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold shrink-0 ${style.className}`}>
                            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                            {style.label}
                        </span>
                    );
                })()}
            </div>

            <div className="space-y-3">
                {scenarios.map((s) => {
                    const style = SCENARIO_STYLE[s.key];
                    const pct = Math.max(2, Math.round((s.amount / max) * 100));
                    return (
                        <div key={s.key}>
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                                <span className={`text-xs font-semibold ${style.textClass}`}>{s.label}</span>
                                <span className="text-sm font-black text-ink [font-variant-numeric:tabular-nums]">{formatCurrency(s.amount, range.currency)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-surface-2 overflow-hidden" aria-hidden="true">
                                <div className={`h-full rounded-full ${style.barClass}`} style={{ width: `${pct}%` }} />
                            </div>
                            {s.gapToGoal != null && (
                                <p className="text-[10px] text-ink-2 mt-0.5">
                                    {s.gapToGoal > 0 ? `Falta ${formatCurrency(s.gapToGoal, range.currency)} para a meta neste cenário` : 'Meta batida neste cenário'}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
