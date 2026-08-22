
import { AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatMonthLabel, type MonthlyPoint } from '../analytics.api';

interface GlowChartProps {
  /** Série mensal real (criados/ganhos/perdidos) vinda de /api/analytics/dashboard. */
  data: MonthlyPoint[];
  /** Mensagem de erro da busca — quando presente, mostra um estado de falha em vez de "sem dados", que ficaria indistinguível de uma série real vazia. */
  error?: string | null;
}

// CORREÇÃO: este componente antes renderizava um array fixo hard-coded no código, rotulado como
// "Volume de Leads (Ao Vivo)" / "Métricas em tempo real processadas pela IA" — números fictícios
// exibidos como se fossem dados reais da organização em qualquer relatório que o abrisse.
export function GlowChart({ data, error }: GlowChartProps) {
  const { isAtlas } = useBrandAccent();
  const { theme } = useTheme();

  // var(--brand)/var(--brand-2) em vez de hex fixo — o SVG do Recharts aceita CSS var() como
  // stroke/fill, então isto segue a mesma paleta de BrandContext.tsx sem duplicar o hex aqui.
  const strokeColor = isAtlas ? 'var(--brand)' : 'var(--brand-2)';
  const fillColor = strokeColor;
  const chartData = data.map((point) => ({ ...point, name: formatMonthLabel(point.month) }));

  return (
    <div className="w-full h-72 bg-white/[0.02] border border-line rounded-2xl p-6 relative group overflow-hidden shadow-2xl">
      {/* Background Glow Effect */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full blur-[80px] opacity-20 transition-all duration-1000 ${isAtlas ? 'bg-brand' : 'bg-brand-2'} group-hover:opacity-40`} />

      <div className="relative z-10 w-full h-full">
        <div className="mb-4">
          <h3 className={`text-lg font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>Leads Ganhos por Mês</h3>
          <p className="text-sm text-ink-2">Evolução real dos últimos {chartData.length} meses.</p>
        </div>

        <div className="w-full h-[80%]">
          {error ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4" role="status">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <p className="text-sm text-amber-300 font-semibold">Não foi possível carregar a série mensal.</p>
              <p className="text-xs text-ink-2">{error}</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-ink-2">Sem dados suficientes ainda.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={fillColor} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={fillColor} stopOpacity={0}/>
                  </linearGradient>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <XAxis dataKey="name" stroke={theme === 'light' ? '#cbd5e1' : '#475569'} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={theme === 'light' ? '#cbd5e1' : '#475569'} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="won"
                  name="Ganhos"
                  stroke={strokeColor}
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorGlow)"
                  filter="url(#glow)"
                  animationDuration={2000}
                  animationEasing="ease-in-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
