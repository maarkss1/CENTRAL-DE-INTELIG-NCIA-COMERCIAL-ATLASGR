import { useState } from 'react';
import { Trophy, Zap, Award, Flame, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GamificationWidgetProps {
  initialXp?: number;
  nextLevelXp?: number;
  level?: number;
  streakDays?: number;
}

export function GamificationWidget({
  initialXp = 12480,
  nextLevelXp = 14000,
  level = 12,
  streakDays = 5
}: GamificationWidgetProps) {
  const [showMissions, setShowMissions] = useState(false);
  const [xp, setXp] = useState(initialXp);
  const [missions, setMissions] = useState([
    { id: 1, title: 'Completar perfil do SDR', xp: 200, done: true },
    { id: 2, title: 'Qualificar 5 novos leads hoje', xp: 500, done: true },
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
    <div className="glass-panel p-5 rounded-card-lg border border-white/10 relative overflow-hidden bg-slate-900/60 backdrop-blur-xl shadow-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-atlas-orange via-orange-300 to-white" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-atlas-orange/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        {/* Level Badge */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-atlas-yellow via-atlas-orange to-red-600 flex items-center justify-center font-extrabold text-white text-xl shadow-lg shadow-atlas-orange/30 border border-atlas-yellow/30">
              Lvl {level}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-atlas-yellow text-slate-950 p-1 rounded-full text-xs font-black flex items-center shadow">
              <Trophy className="w-3 h-3" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-white text-base">Prospector Master</h4>
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-atlas-yellow/20 text-atlas-yellow border border-atlas-yellow/30 font-semibold">
                <Flame className="w-3.5 h-3.5 text-atlas-yellow animate-pulse" /> {streakDays} Dias Seguidos
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {xp.toLocaleString('pt-BR')} / {nextLevelXp.toLocaleString('pt-BR')} XP para o Nível {level + 1}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => setShowMissions(!showMissions)}
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 transition-all active:scale-95 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-atlas-orange"
          aria-label="Ver Missões Diárias"
        >
          <Zap className="w-4 h-4 text-atlas-yellow" />
          <span>Missões Diárias</span>
          <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showMissions ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="w-full h-3 bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-atlas-orange via-orange-400 to-white rounded-full shadow-inner"
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
            className="mt-4 pt-4 border-t border-white/10 space-y-2 overflow-hidden"
          >
            <div className="flex items-center justify-between text-xs font-bold text-gray-300 mb-2">
              <span>Missões de Prospecção (Clique para Concluir)</span>
              <span className="text-atlas-yellow">Recompensas +XP</span>
            </div>
            {missions.map((mission) => (
              <div
                key={mission.id}
                onClick={() => toggleMission(mission.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  mission.done
                    ? 'bg-success/10 border-success/30 text-gray-300'
                    : 'bg-white/5 border-white/5 hover:border-white/20 text-gray-200'
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
                  <span className={mission.done ? 'line-through text-gray-400 font-medium' : 'font-semibold'}>
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
