import { useMemo, useState } from 'react';
import { AlertTriangle, CircleDot, Eye, EyeOff } from 'lucide-react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatMonthLabel, type MonthlyPoint } from '../analytics.api';

interface GlowChartProps {
  /** Série mensal real (criados/ganhos/perdidos) vinda de /api/analytics/dashboard. */
  data: MonthlyPoint[];
  /** Mensagem de erro da busca — quando presente, mostra um estado de falha em vez de "sem dados". */
  error?: string | null;
}

type SeriesKey = 'created' | 'won' | 'lost';

const SERIES: Array<{
  key: SeriesKey;
  label: string;
  color: string;
  fillId: string;
}> = [
  { key: 'created', label: 'Criados', color: 'var(--brand-2)', fillId: 'pulseCreated' },
  { key: 'won', label: 'Ganhos', color: 'var(--brand)', fillId: 'pulseWon' },
  { key: 'lost', label: 'Perdidos', color: 'var(--critical)', fillId: 'pulseLost' },
];

export function GlowChart({ data, error }: GlowChartProps) {
  const { isAtlas } = useBrandAccent();
  const { theme } = useTheme();
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    created: true,
    won: true,
    lost: true,
  });

  const chartData = useMemo(
    () => data.map((point) => ({ ...point, name: formatMonthLabel(point.month) })),
    [data],
  );

  const totals = useMemo(
    () =>
      chartData.reduce(
        (acc, point) => ({
          created: acc.created + point.created,
          won: acc.won + point.won,
          lost: acc.lost + point.lost,
        }),
        { created: 0, won: 0, lost: 0 },
      ),
    [chartData],
  );

  const toggleSeries = (key: SeriesKey) => {
    setVisible((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <section
      data-testid="dashboard-analytics-chart"
      className="group relative min-h-[18rem] w-full overflow-hidden rounded-[1.6rem] border border-line bg-surface/92 p-4 shadow-[0_28px_70px_-42px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5"
    >
      <motion.div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full blur-[90px] ${
          isAtlas ? 'bg-brand/20' : 'bg-brand-2/20'
        }`}
        animate={{ scale: [1, 1.08, 1], opacity: [0.34, 0.5, 0.34] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand/45 to-transparent"
      />

      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-brand-active dark:text-brand-2">
              <CircleDot className="h-3.5 w-3.5" aria-hidden="true" /> Pulso comercial
            </div>
            <h3 className="text-lg font-black text-ink">Entrada, ganho e perda por mês</h3>
            <p className="mt-1 text-sm text-ink-2">
              Explore as séries reais dos últimos {chartData.length} meses e isole o sinal que quer
              analisar.
            </p>
          </div>

          <div
            role="group"
            aria-label="Séries exibidas no gráfico"
            className="flex flex-wrap gap-2"
          >
            {SERIES.map((series) => {
              const active = visible[series.key];
              return (
                <button
                  key={series.key}
                  type="button"
                  onClick={() => toggleSeries(series.key)}
                  aria-pressed={active}
                  className={`group/series flex min-w-[7.25rem] items-center gap-2 rounded-xl border px-3 py-2 text-left transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    active
                      ? 'border-line bg-surface-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                      : 'border-transparent bg-transparent opacity-55'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_14px_currentColor]"
                    style={{ color: series.color, backgroundColor: series.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-2">
                      {series.label}
                    </span>
                    <span className="block text-sm font-black text-ink [font-variant-numeric:tabular-nums]">
                      {totals[series.key].toLocaleString('pt-BR')}
                    </span>
                  </span>
                  {active ? (
                    <Eye className="h-3.5 w-3.5 text-ink-2 transition-transform group-hover/series:scale-110" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-ink-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {error ? (
            <div
              className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center"
              role="status"
            >
              <AlertTriangle className="h-5 w-5 text-warning" />
              <p className="text-sm font-semibold text-warning-active dark:text-warning">
                Não foi possível carregar a série mensal.
              </p>
              <p className="text-xs text-ink-2">{error}</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-ink-2">
              Sem dados suficientes ainda.
            </div>
          ) : (
            <div className="h-52 w-full sm:h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    {SERIES.map((series) => (
                      <linearGradient
                        key={series.key}
                        id={series.fillId}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={series.color} stopOpacity={0.32} />
                        <stop offset="92%" stopColor={series.color} stopOpacity={0.015} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 8" />
                  <XAxis
                    dataKey="name"
                    stroke={theme === 'light' ? '#94a3b8' : '#64748b'}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis
                    stroke={theme === 'light' ? '#94a3b8' : '#64748b'}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--line)', strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: 'var(--surface)',
                      color: 'var(--ink)',
                      borderRadius: '16px',
                      border: '1px solid var(--line)',
                      boxShadow: '0 18px 50px -24px rgba(0,0,0,.7)',
                    }}
                    labelStyle={{ color: 'var(--ink)', fontWeight: 800, marginBottom: 6 }}
                    itemStyle={{ fontSize: 12, fontWeight: 700 }}
                  />
                  {SERIES.map(
                    (series) =>
                      visible[series.key] && (
                        <Area
                          key={series.key}
                          type="monotone"
                          dataKey={series.key}
                          name={series.label}
                          stroke={series.color}
                          strokeWidth={series.key === 'won' ? 3.5 : 2.25}
                          fill={`url(#${series.fillId})`}
                          fillOpacity={1}
                          activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--surface)' }}
                          animationDuration={900}
                          animationEasing="ease-out"
                        />
                      ),
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
