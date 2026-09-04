import { motion } from 'framer-motion';
import { Trophy, Medal, Award, AlertTriangle, Users } from 'lucide-react';
import { Skeleton } from '../../../components/ui/Skeleton';
import { fadeInUp, staggerContainer, staggerItem } from '../../../lib/motion';

interface RankingRow {
  label: string;
  count: number;
  won: number;
}

interface TeamRankingWidgetProps {
  byOwner: RankingRow[];
  currentUserName?: string | null;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
}

const POSITION_ICONS = [Trophy, Medal, Award];

/**
 * Ranking real por negócios fechados (`byOwner`, de GET /api/analytics/dashboard) — a mecânica de
 * jogo é o próprio ranking sobre dado real, sem XP/nível/sequência fabricados (Piloto 007, ver
 * .claude/PILOTS.md e o GamificationWidget "falso" em ProspectingHub.tsx, fora de escopo aqui).
 */
export function TeamRankingWidget({
  byOwner,
  currentUserName,
  loading,
  error,
  onRetry,
}: TeamRankingWidgetProps) {
  const ranked = [...byOwner]
    .filter((row) => row.label)
    .sort((a, b) => b.won - a.won)
    .slice(0, 8);

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      className="p-5 rounded-card-lg border border-line bg-surface shadow-card"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-black text-ink">Ranking Comercial Real</h3>
        </div>
        <p className="text-[11px] text-ink-2 font-medium">Negócios fechados neste recorte</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Não foi possível carregar o ranking agora.
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-bold text-red-300 hover:underline cursor-pointer shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      ) : ranked.length === 0 ? (
        <p className="text-sm text-ink-2">Ainda não há dados suficientes de ranking este mês.</p>
      ) : (
        <motion.div
          variants={staggerContainer()}
          initial="hidden"
          animate="show"
          className="space-y-2"
        >
          {ranked.map((row, index) => {
            const Icon = POSITION_ICONS[index];
            const isCurrentUser =
              !!currentUserName &&
              row.label.trim().toLowerCase() === currentUserName.trim().toLowerCase();
            return (
              <motion.div
                key={row.label}
                variants={staggerItem}
                className={`flex items-center gap-3 p-3 rounded-card border ${
                  isCurrentUser ? 'border-brand/40 bg-soft' : 'border-line bg-surface-2'
                }`}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-surface border border-line text-ink-2 font-black text-xs">
                  {Icon ? <Icon className="w-4 h-4 text-brand" /> : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink truncate">
                    {row.label}
                    {isCurrentUser && <span className="text-brand"> · você</span>}
                  </p>
                  <p className="text-[11px] text-ink-2">{row.count} leads no funil</p>
                </div>
                <p className="text-lg font-black text-brand shrink-0">{row.won}</p>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}
