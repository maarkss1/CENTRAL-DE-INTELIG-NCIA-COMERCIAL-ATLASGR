import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Gauge } from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../../../lib/api';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useTheme } from '../../../contexts/ThemeContext';
import { Skeleton } from '../../../components/ui/Skeleton';
import { fadeInUp } from '../../../lib/motion';

interface UsageByModel {
  model: string;
  tokens: number;
  cost: number;
  calls: number;
  avgLatencyMs: number;
}

interface UsagePoint {
  day: string;
  tokens: number;
  cost: number;
  calls: number;
}

interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
  avgLatencyMs: number;
  costThisMonth: number;
  byModel: UsageByModel[];
  daily: UsagePoint[];
  unattributedCalls: number;
  isEmpty: boolean;
}

function formatUsd(value: number): string {
  return `US$ ${value.toFixed(2)}`;
}

/**
 * Vitrine do AI Gateway — reaproveita GET /api/usage (mesma fonte de Billing.tsx), sem rota nova.
 * Renderizada só para isAdmin no chamador (SinglePageDashboard.tsx), replicando no frontend a
 * mesma restrição `requireRole(['ADMIN'])` que o backend já impõe. Deliberadamente sem um
 * "health score"/gauge de saúde: não existe endpoint que exponha teto de orçamento configurado
 * nem estado do circuit breaker por provedor — ver Piloto 007 em .claude/PILOTS.md.
 */
export function AiGatewayShowcase() {
  const { isAtlas } = useBrandAccent();
  const { theme } = useTheme();
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<UsageSummary>('/api/usage?days=30');
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o consumo de IA.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // var(--brand)/var(--brand-2) em vez de hex fixo — mesma técnica de GlowChart.tsx, reage à troca
  // de marca. Divergência intencional vs. a paleta hex fixa que Billing.tsx usa para este mesmo
  // dado: aqui o card fica dentro de uma tela que troca de marca em runtime, Billing não precisa.
  const accentColor = isAtlas ? 'var(--brand)' : 'var(--brand-2)';
  const axisColor = theme === 'light' ? '#cbd5e1' : '#475569';
  const tooltipStyle = {
    backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      className="p-5 rounded-card-lg border border-line bg-surface shadow-card"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-black text-ink">Vitrine do AI Gateway</h3>
        </div>
        <p className="text-[11px] text-ink-2 font-medium">
          Últimos 30 dias · visível só para administradores
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-danger-active dark:text-danger">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
          <button
            type="button"
            onClick={load}
            className="text-xs font-bold text-danger-active dark:text-danger hover:underline cursor-pointer shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      ) : !data || data.isEmpty ? (
        <p className="text-sm text-ink-2">Nenhuma chamada de IA registrada ainda.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-card bg-surface-2 border border-line">
              <p className="text-[11px] text-ink-2 font-semibold uppercase tracking-wide">
                Custo do mês
              </p>
              <p className="text-xl font-black text-ink mt-1">{formatUsd(data.costThisMonth)}</p>
            </div>
            <div className="p-4 rounded-card bg-surface-2 border border-line">
              <p className="text-[11px] text-ink-2 font-semibold uppercase tracking-wide">
                Custo (30 dias)
              </p>
              <p className="text-xl font-black text-ink mt-1">{formatUsd(data.totalCost)}</p>
            </div>
          </div>

          {data.byModel.length > 0 && (
            <div className="h-56">
              <p className="text-[11px] text-ink-2 font-semibold uppercase tracking-wide mb-2">
                Custo e latência por modelo
              </p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byModel} layout="vertical" margin={{ left: 24 }}>
                  <XAxis
                    type="number"
                    stroke={axisColor}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="model"
                    stroke={axisColor}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'cost' && typeof value === 'number' ? formatUsd(value) : value
                    }
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="cost" name="cost" fill={accentColor} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="h-40">
            <p className="text-[11px] text-ink-2 font-semibold uppercase tracking-wide mb-2">
              Chamadas por dia
            </p>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily}>
                <defs>
                  <linearGradient id="aiGatewayCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accentColor} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  stroke={axisColor}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke={axisColor}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke={accentColor}
                  strokeWidth={2}
                  fill="url(#aiGatewayCalls)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </motion.div>
  );
}
