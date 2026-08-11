import { useState } from 'react';
import { Trophy, Zap, Award, Flame, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GamificationWidgetProps {
  initialXp?: number;
  nextLevelXp?: number;
  level?: number;
  streakDays?: number;
}

// Não existe, hoje, nenhum sistema real de XP/nível/sequência de dias no backend — este widget é
// um checklist auto-reportado (o próprio usuário marca o que já fez), não uma leitura de dado
// real. Antes, os defaults (Level 12, 12.480 XP, "5 Dias Seguidos", duas missões já marcadas como
// concluídas) apareciam pra QUALQUER usuário, em qualquer organização, como se fosse o histórico
// de progresso real dele — verdade cenográfica (ver AGENTS.md). Os defaults agora começam
// zerados: nenhuma conquista é atribuída a ninguém sem ter sido de fato marcada por quem está
// usando a tela nesta sessão.
export function GamificationWidget({
  initialXp = 0,
  nextLevelXp = 2000,
  level = 1,
  streakDays = 0
}: GamificationWidgetProps) {
  const [showMissions, setShowMissions] = useState(false);
  const [xp, setXp] = useState(initialXp);
  const [missions, setMissions] = useState([
    { id: 1, title: 'Completar perfil do SDR', xp: 200, done: false },
    { id: 2, title: 'Qualificar 5 novos leads hoje', xp: 500, done: false },
    { id: 3, title: 'Agendar 2 reuniões de demo', xp: 800, done: false },
    { id: 4, title: 'Enviar 10 cold emails inteligentes', xp: 450, done: false }
  ]);

  const toggleMission = (id: number) => {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          const newDone = !m.done;
          if (newDone) {
            setXp((currentXp) => currentXp + m.xp);
          } else {
            setXp((currentXp) => currentXp - m.xp);
          }
          return { ...m, done: newDone };
        }
        return m;
      })
    );
  };

  const progressPercent = Math.min(100, Math.round((xp / nextLevelXp) * 100));

  return (
    <div className="glass-panel p-5 rounded-card-lg border border-line relative overflow-hidden bg-surface backdrop-blur-xl shadow-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-orange-300 to-white" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        {/* Level Badge */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-atlas-yellow via-brand to-red-600 flex items-center justify-center font-extrabold text-white text-xl shadow-lg shadow-brand/30 border border-atlas-yellow/30">
              Lvl {level}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-atlas-yellow text-slate-950 p-1 rounded-full text-xs font-black flex items-center shadow">
              <Trophy className="w-3 h-3" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-ink text-base">Missões Diárias</h4>
              {streakDays > 0 && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-atlas-yellow/20 text-atlas-yellow border border-atlas-yellow/30 font-semibold">
                  <Flame className="w-3.5 h-3.5 text-atlas-yellow animate-pulse" /> {streakDays} Dias Seguidos
                </span>
              )}
            </div>
            <p className="text-xs text-ink-2 mt-0.5">
              {xp.toLocaleString('pt-BR')} / {nextLevelXp.toLocaleString('pt-BR')} XP para o Nível {level + 1}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => setShowMissions(!showMissions)}
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-line text-ink-2 border border-line transition-all active:scale-95 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="Ver Missões Diárias"
        >
          <Zap className="w-4 h-4 text-atlas-yellow" />
          <span>Missões Diárias</span>
          <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showMissions ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="w-full h-3 bg-surface-2 rounded-full overflow-hidden p-0.5 border border-line">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-brand via-orange-400 to-white rounded-full shadow-inner"
          />
        </div>
      </div>

      {/* Dropdown de Missões Interativas */}
      <AnimatePresence>
        {showMissions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-line space-y-2 overflow-hidden"
          >
            <div className="flex items-center justify-between text-xs font-bold text-ink-2 mb-2">
              <span>Missões de Prospecção (Clique para Concluir)</span>
              <span className="text-atlas-yellow">Recompensas +XP</span>
            </div>
            {missions.map((mission) => (
              <div
                key={mission.id}
                role="button"
                tabIndex={0}
                onClick={() => toggleMission(mission.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleMission(mission.id); }}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  mission.done
                    ? 'bg-success/10 border-success/30 text-ink-2'
                    : 'bg-surface-2 border-line hover:border-line text-ink'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      mission.done ? 'bg-success border-success text-slate-950 font-bold' : 'border-gray-500'
                    }`}
                  >
                    {mission.done && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span className={mission.done ? 'line-through text-ink-2 font-medium' : 'font-semibold'}>
                    {mission.title}
                  </span>
                </div>
                <span className="font-extrabold text-atlas-yellow flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> +{mission.xp} XP
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
