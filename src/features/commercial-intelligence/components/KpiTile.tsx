import { Card } from '../../../components/ui/Card';
import { MetricInfo } from './MetricInfo';

interface KpiTileProps {
    label: string;
    value: string;
    hint?: string;
    tone?: 'good' | 'critical' | 'neutral';
    metricKey?: string;
    onClick?: () => void;
}

/**
 * Tile de KPI do módulo — mesma composição visual de `StatTile` em `features/analytics/components/
 * Analytics.tsx` (Card variant="stat", figura em destaque, tom semântico), reaproveitada aqui em
 * vez de reinventada (ver `design-system/SKILL.md`: cor representa estado, não decoração — regra
 * visual #3/#4 da constituição). `onClick` opcional habilita drill-down (seção 29).
 */
export function KpiTile({ label, value, hint, tone = 'neutral', metricKey, onClick }: KpiTileProps) {
    const toneClass = tone === 'good' ? 'text-[#0ca30c]' : tone === 'critical' ? 'text-critical' : 'text-ink';
    const body = (
        <>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-ink-2 font-semibold">{label}</p>
                {metricKey && <MetricInfo metricKey={metricKey} />}
            </div>
            <p className={`text-2xl font-black mt-1 [font-variant-numeric:tabular-nums] ${toneClass}`}>{value}</p>
            {hint && <p className="text-[11px] text-ink-2 mt-0.5">{hint}</p>}
        </>
    );

    if (!onClick) {
        return (
            <Card variant="stat" padding="sm">
                {body}
            </Card>
        );
    }

    return (
        <Card variant="stat" padding="sm">
            <button
                type="button"
                onClick={onClick}
                className="w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg"
            >
                {body}
            </button>
        </Card>
    );
}
