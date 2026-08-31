import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Phone, RotateCcw, ShieldCheck } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../../../contexts/ThemeContext';
import type { CallAnalysisResult } from './types';

interface TurnEvaluation {
  clarity: number;
  objectionHandling: number;
  total: number;
  feedback: string;
}

// Cor sólida (não gradiente) — a cor aqui É o sinal da nota (boa/média/ruim), não decoração. Sem
// sufixo `-active`/`dark:`: este número vive dentro do cartão sempre-escuro abaixo (bg-gray-900,
// independente do tema do resto do app), então usa direto a variante já calibrada para superfície
// escura (mesmo raciocínio documentado em Badge.tsx: "no escuro a cor crua já passa").
function scoreTextClass(score: number): string {
  if (score >= 75) return 'text-success';
  if (score >= 45) return 'text-warning';
  return 'text-danger';
}

export function CallAnalysisReport({
  analysisResult,
  onRestart,
  audioBlobUrl,
  timestamps,
  turnEvaluations,
}: {
  analysisResult: CallAnalysisResult;
  onRestart: () => void;
  audioBlobUrl?: string | null;
  timestamps?: Array<{ sender: string; timeSeconds: number; text: string }>;
  turnEvaluations?: TurnEvaluation[];
}) {
  const { theme } = useTheme();
  const axisColor = theme === 'light' ? '#cbd5e1' : '#475569';
  const chartData = (turnEvaluations ?? []).map((t, i) => ({ turno: i + 1, ...t }));
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface/90 backdrop-blur-2xl rounded-[3rem] p-10 border border-line shadow-[0_30px_60px_rgba(0,0,0,0.08)] space-y-10 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-gray-900 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

        <div className="relative z-10 text-center md:text-left flex-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-widest mb-4">
            <ShieldCheck className="w-4 h-4" /> Avaliador de Ligação · Groq IA
          </div>
          <h2 className="text-4xl lg:text-5xl font-black mb-3 tracking-tight">Nota da Ligação</h2>
          <p className="text-gray-400 text-base md:text-lg font-medium leading-relaxed max-w-2xl">
            {analysisResult.feedback}
          </p>
        </div>

        <div className="relative z-10 flex flex-col items-center bg-white/10 backdrop-blur-xl px-12 py-8 rounded-[2rem] border border-white/20 shrink-0">
          <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
            Nota estimada
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-6xl md:text-7xl font-black tracking-tighter ${scoreTextClass(analysisResult.score)}`}
            >
              {analysisResult.score}
            </span>
          </div>
          <div className="mt-4 px-4 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold uppercase tracking-widest">
            Estimativa pedagógica
          </div>
        </div>
      </div>

      {audioBlobUrl && timestamps && timestamps.length > 0 && (
        <div className="bg-surface-2 border border-line p-8 rounded-[2rem] space-y-6 relative z-10">
          <h3 className="font-black text-xl text-ink tracking-tight mb-4">
            Gravação e Feedback do Gestor
          </h3>
          {/* Sem <track kind="captions">: a transcrição completa e cronometrada (quem falou +
              texto exato) já é exibida logo abaixo, sempre — este bloco só renderiza quando
              `timestamps` também existe (linha 86). É uma alternativa textual completa e
              sincronizada à gravação, não uma trilha de legenda WebVTT, mas cobre o mesmo
              propósito de acessibilidade (conteúdo falado disponível como texto). */}
          {/* biome-ignore lint/a11y/useMediaCaption: transcrição textual completa cobre o mesmo propósito, ver comentário acima */}
          <audio controls className="w-full h-12" src={audioBlobUrl} />

          <div className="mt-6 space-y-4 max-h-64 overflow-y-auto pr-2">
            <h4 className="text-sm font-bold text-ink-2 uppercase tracking-wider mb-2">
              Timestamps da Ligação
            </h4>
            {timestamps.map((t, idx) => (
              <div key={idx} className="flex gap-4 items-start text-sm">
                <span className="font-mono text-brand font-bold shrink-0">
                  {Math.floor(t.timeSeconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(t.timeSeconds % 60).toString().padStart(2, '0')}
                </span>
                <div
                  className={`flex flex-col gap-1 ${t.sender === 'sdr' ? 'items-start' : 'items-end'} w-full`}
                >
                  <span
                    className={`px-3 py-2 rounded-2xl ${t.sender === 'sdr' ? 'bg-brand/10 text-ink' : 'bg-surface-2 text-ink-2'} max-w-[85%] leading-relaxed inline-block`}
                  >
                    <span className="font-bold text-[10px] uppercase block mb-1 opacity-70">
                      {t.sender === 'sdr' ? 'Você (SDR)' : 'Comprador (IA)'}
                    </span>
                    {t.text}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="bg-surface border border-line p-8 rounded-[2rem] space-y-4 relative z-10">
          <h3 className="font-black text-xl text-ink tracking-tight">Evolução da Ligação</h3>
          <p className="text-sm text-ink-2">
            Clareza e tratamento de objeções em cada resposta sua, avaliados pela IA em tempo real —
            não uma média, o histórico real desta ligação.
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="turno"
                  stroke={axisColor}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Turno', position: 'insideBottom', offset: -4, fill: axisColor }}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke={axisColor}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor:
                      theme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="clarity"
                  name="Clareza"
                  stroke="var(--brand)"
                  strokeWidth={3}
                  dot
                />
                <Line
                  type="monotone"
                  dataKey="objectionHandling"
                  name="Tratamento de objeções"
                  stroke="var(--brand-2)"
                  strokeWidth={3}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
        <div className="bg-success/10 p-8 rounded-[2rem] border border-success/20 space-y-6">
          <h3 className="font-black text-xl text-success-active dark:text-success flex items-center gap-3 tracking-tight">
            <div className="p-2 bg-success/20 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-success-active dark:text-success" />
            </div>{' '}
            O que funcionou
          </h3>
          <ul className="space-y-4">
            {analysisResult.strengths.map((s, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 text-base text-ink font-medium leading-relaxed"
              >
                <span className="w-2 h-2 mt-2 rounded-full bg-success shrink-0" /> {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-danger/10 p-8 rounded-[2rem] border border-danger/20 space-y-6">
          <h3 className="font-black text-xl text-danger-active dark:text-danger flex items-center gap-3 tracking-tight">
            <div className="p-2 bg-danger/20 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-danger-active dark:text-danger" />
            </div>{' '}
            Dicas para a próxima ligação
          </h3>
          <ul className="space-y-4">
            {analysisResult.improvements.map((imp, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 text-base text-ink font-medium leading-relaxed"
              >
                <span className="w-2 h-2 mt-2 rounded-full bg-danger shrink-0" /> {imp}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex justify-center pt-4">
        <button
          type="button"
          onClick={onRestart}
          className="px-10 py-5 bg-brand-active hover:bg-brand-2 text-white rounded-[1.75rem] font-black text-sm uppercase tracking-wider flex items-center gap-3 transition-transform hover:scale-105 shadow-xl shadow-brand-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <RotateCcw className="w-5 h-5" /> <Phone className="w-5 h-5" /> Nova Ligação
        </button>
      </div>
    </motion.div>
  );
}
