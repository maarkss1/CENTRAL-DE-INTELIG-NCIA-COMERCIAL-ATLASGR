import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Label } from '../../../components/ui/Label';
import { fadeInUp } from '../../../lib/motion';
import { api } from '../../../lib/api';

type SellerRole = 'SDR / Hunter' | 'Closer / Executivo de Contas' | 'Account Manager / Farmer';

interface SellerCoachingReport {
  motivationalHeadline: string;
  overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D';
  celebrationPoint: string;
  criticalGaps: string[];
  actionableMicroHabits: string[];
  suggestedTrainingTopic: string;
  nextWeekTargetFocus: string;
}

interface CoachingResponse {
  report: SellerCoachingReport;
  period: string;
}

const GRADE_VARIANT: Record<
  SellerCoachingReport['overallGrade'],
  'success' | 'info' | 'warning' | 'danger'
> = {
  'A+': 'success',
  A: 'success',
  B: 'info',
  C: 'warning',
  D: 'danger',
};

const ROLE_OPTIONS: SellerRole[] = [
  'SDR / Hunter',
  'Closer / Executivo de Contas',
  'Account Manager / Farmer',
];

/**
 * Coaching semanal por IA, gerado sob demanda (nunca automático a cada carregamento do dashboard —
 * respeita o orçamento de IA em src/lib/ai/budget.ts). `role` é opcional e nunca persistido: não
 * existe função de vendas no cadastro do usuário (User.role é RBAC, não papel comercial). Ver
 * Piloto 007 em .claude/PILOTS.md.
 */
export function SellerCoachingCard() {
  const [role, setRole] = useState<SellerRole | ''>('');
  const [report, setReport] = useState<SellerCoachingReport | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<CoachingResponse>('/api/gamification/coaching/weekly', {
        role: role || undefined,
      });
      setReport(data.report);
      setPeriod(data.period);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar o coaching desta semana.');
    } finally {
      setLoading(false);
    }
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
          <Sparkles className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-black text-ink">Coaching Semanal por IA</h3>
        </div>
        {period && <p className="text-[11px] text-ink-2 font-medium">Semana de {period}</p>}
      </div>

      {!report && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="seller-role">Como você atua nesta semana? (opcional)</Label>
            <Select
              id="seller-role"
              value={role}
              onChange={(e) => setRole(e.target.value as SellerRole | '')}
            >
              <option value="">Não informar</option>
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={generate} disabled={loading} className="shrink-0">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Gerando...
              </>
            ) : (
              'Gerar meu coaching semanal'
            )}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
          <button
            type="button"
            onClick={generate}
            className="text-xs font-bold text-red-300 hover:underline cursor-pointer shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-ink">{report.motivationalHeadline}</p>
            <Badge variant={GRADE_VARIANT[report.overallGrade]}>{report.overallGrade}</Badge>
          </div>

          <div className="p-3 rounded-card bg-surface-2 border border-line flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-ok-active dark:text-ok shrink-0 mt-0.5" />
            <p className="text-xs text-ink-2">{report.celebrationPoint}</p>
          </div>

          {report.criticalGaps.length > 0 && (
            <div>
              <p className="text-[11px] font-black text-ink-2 uppercase tracking-wide mb-1.5">
                Gargalos
              </p>
              <ul className="space-y-1.5">
                {report.criticalGaps.map((gap, i) => (
                  <li key={i} className="text-xs text-ink-2 flex gap-2">
                    <span className="text-brand">·</span> {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.actionableMicroHabits.length > 0 && (
            <div>
              <p className="text-[11px] font-black text-ink-2 uppercase tracking-wide mb-1.5">
                Micro-hábitos desta semana
              </p>
              <ul className="space-y-1.5">
                {report.actionableMicroHabits.map((habit, i) => (
                  <li key={i} className="text-xs text-ink-2 flex gap-2">
                    <span className="text-brand">·</span> {habit}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-ink-2 italic">
            Gerado por IA a partir dos seus números reais desta semana.
          </p>
        </div>
      )}
    </motion.div>
  );
}
