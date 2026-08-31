import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Card } from '../../../components/ui/Card';
import { SINGLE, INK, tooltipStyle } from '../../../shared/constants/chartPalette';
import { formatPercent, type HistoricalTrendsReport } from '../commercialIntelligence.api';

interface TrendChartCardProps {
  trends: HistoricalTrendsReport | null;
}

/**
 * Evolução do Win Rate — `trends.points` já era buscado (ForecastRangeCard.tsx o usa só para o
 * selo "Win Rate melhorando/piorando"), nunca visualizado como série (achado do Piloto 009).
 * Paleta de `chartPalette.ts` (mesma de Analytics.tsx) em vez do estilo "glow" de GlowChart.tsx —
 * decisão deliberada: este é um cockpit executivo denso, não uma tela de vitrine como
 * Dashboard/Roleplay, então reaproveita a linguagem visual de dado sério já estabelecida ali.
 * Pontos sem `winRate` calculável (amostra vazia naquele mês) ficam de fora — sem interpolar ou
 * fabricar valor.
 */
export function TrendChartCard({ trends }: TrendChartCardProps) {
  const chartData = useMemo(
    () =>
      (trends?.points ?? [])
        .filter((p) => p.winRate != null)
        .map((p) => ({ label: p.label, winRate: p.winRate as number })),
    [trends],
  );

  if (chartData.length < 2) return null;

  return (
    <Card padding="sm">
      <h3 className="text-sm font-bold text-ink mb-1">Evolução do Win Rate</h3>
      <p className="text-[11px] text-ink-2 mb-3">
        Taxa de ganho por mês, calculada sobre os negócios fechados de cada período.
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="label" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
          <YAxis
            stroke={INK.axis}
            tick={{ fill: INK.muted, fontSize: 11 }}
            tickFormatter={(v: number) => formatPercent(v)}
            width={48}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: INK.axis }}
            formatter={(value) => (typeof value === 'number' ? formatPercent(value) : value)}
          />
          <Line
            type="monotone"
            dataKey="winRate"
            name="Win Rate"
            stroke={SINGLE}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
