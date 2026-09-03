import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Target, Trophy, Clock, CalendarDays, TrendingUp } from 'lucide-react';
import { formatCurrency, formatPercent } from '../commercialIntelligence.api';

interface GoalCountdownOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  period: string; // YYYY-MM
  goalAmount: number | null;
  closedAmount: number;
  currency: string;
}

export function GoalCountdownOverlay({
  isOpen,
  onClose,
  period,
  goalAmount,
  closedAmount,
  currency,
}: GoalCountdownOverlayProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Keyboard listener for ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentYear = parseInt(period.split('-')[0]);
  const currentMonth = parseInt(period.split('-')[1]) - 1;

  // Fim do mês (último dia do mês as 23:59:59)
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
  const msRemaining = Math.max(0, endOfMonth.getTime() - now.getTime());

  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((msRemaining / (1000 * 60 * 60)) % 24);
  const minutesRemaining = Math.floor((msRemaining / 1000 / 60) % 60);
  const secondsRemaining = Math.floor((msRemaining / 1000) % 60);

  const isGoalSet = goalAmount != null && goalAmount > 0;
  const isGoalHit = isGoalSet && closedAmount >= goalAmount;
  const pctHit = isGoalSet ? closedAmount / goalAmount : 0;

  const gap = isGoalSet ? Math.max(0, goalAmount - closedAmount) : 0;
  const runRate = daysRemaining > 0 && gap > 0 ? gap / daysRemaining : 0;

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        // Overlay de tela cheia pra um momento raro e de alto impacto (meta batida/contagem
        // regressiva) — fundo sempre escuro de propósito ("modo cinema"), independente do tema do
        // app, mesmo raciocínio já documentado em ActiveCallView.tsx/CallAnalysisReport.tsx pra
        // telas de foco total. Os `bg-white/5-10` abaixo são vidro translúcido sobre esse fundo
        // fixo, não a superfície do app.
        className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-white overflow-hidden"
      >
        {/* Background Decorativo */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-brand/20 blur-[120px]" />
          <div className="absolute -bottom-[30%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand/10 blur-[100px]" />

          {/* Confetes — posição/cor/duração aleatórias são só a celebração visual de um
                        estado real (isGoalHit); não representam nenhum dado de negócio, mesmo
                        padrão já documentado em GameWidget.tsx/SpaceGame.tsx (gamification). */}
          {isGoalHit && (
            <div className="absolute inset-0">
              {Array.from({ length: 50 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{
                    y: -50,
                    x: Math.random() * window.innerWidth,
                    opacity: 1,
                    rotate: 0,
                    scale: Math.random() * 0.5 + 0.5,
                  }}
                  animate={{
                    y: window.innerHeight + 50,
                    x: `calc(${Math.random() * 100 - 50}vw)`,
                    rotate: Math.random() * 360 * 2,
                  }}
                  transition={{
                    duration: Math.random() * 3 + 2,
                    repeat: Infinity,
                    ease: 'linear',
                    delay: Math.random() * 2,
                  }}
                  className="absolute top-0 w-3 h-8"
                  style={{
                    backgroundColor: ['#22c55e', '#3b82f6', '#eab308', '#ec4899', '#a855f7'][
                      Math.floor(Math.random() * 5)
                    ],
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Header (Top) */}
        <div className="relative z-10 flex justify-between items-center p-8 md:p-12">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white/90 drop-shadow-sm capitalize">
              {dateFormatter.format(now)}
            </h1>
            <p className="text-lg text-white/50 mt-1 font-medium tracking-wider uppercase">
              Acompanhamento de Meta • {period}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-8 h-8 text-white/70" />
          </button>
        </div>

        {/* Main Content (Center) */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 max-w-[90rem] mx-auto w-full gap-16">
          {/* Linha Superior: Meta, Batido, % */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
            className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center"
          >
            {/* Batido / Progresso */}
            <div className="space-y-4">
              <h2 className="text-2xl text-white/60 font-semibold flex items-center gap-2 uppercase tracking-widest">
                {/* text-brand-2 (não text-brand): sobre bg-zinc-950, --brand sólido da Total
                                    Trac (azul-marinho) mede só 2.41:1, abaixo até do mínimo de 3:1 pra ícone
                                    (WCAG 1.4.11) — mesmo problema do contador abaixo. */}
                {isGoalHit ? (
                  <Trophy className="text-yellow-400 w-6 h-6" />
                ) : (
                  <Target className="text-brand-2 w-6 h-6" />
                )}
                Fechado até agora
              </h2>
              <div className="text-7xl md:text-9xl font-black tracking-tighter text-white drop-shadow-lg tabular-nums">
                {formatCurrency(closedAmount, currency)}
              </div>
              {isGoalSet && (
                <div className="text-2xl text-white/70 font-medium">
                  de {formatCurrency(goalAmount, currency)} (Meta)
                </div>
              )}
            </div>

            {/* Barra de progresso circular ou linear gigante */}
            {isGoalSet && (
              <div className="flex flex-col gap-6">
                <div className="flex justify-between items-end">
                  <span className="text-5xl md:text-7xl font-black text-white/90 tabular-nums">
                    {formatPercent(pctHit * 100)}
                  </span>
                  {isGoalHit && (
                    <span className="text-2xl font-bold text-green-400 animate-pulse bg-green-400/10 px-4 py-2 rounded-xl">
                      META BATIDA!
                    </span>
                  )}
                </div>
                <div className="h-8 md:h-12 bg-white/10 rounded-full overflow-hidden p-1 backdrop-blur-md">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, pctHit * 100)}%` }}
                    transition={{ duration: 1.5, ease: 'easeOut' }}
                    className={`h-full rounded-full ${isGoalHit ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-brand to-brand-light'}`}
                  />
                </div>
              </div>
            )}
          </motion.div>

          {/* Linha Inferior: Secundários (Run Rate, Countdown) */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.15, delayChildren: 0.4 },
              },
            }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {/* Box: Contagem Regressiva */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-8 flex flex-col justify-center"
            >
              <div className="flex items-center gap-3 text-white/60 font-medium tracking-wider uppercase mb-6">
                <Clock className="w-5 h-5" />
                Tempo Restante
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="flex flex-col">
                  <span className="text-4xl md:text-5xl font-black text-white tabular-nums">
                    {String(daysRemaining).padStart(2, '0')}
                  </span>
                  {/* text-white/40 media só 3.74:1 sobre bg-zinc-950 (fixo, não reage a tema) —
                                        abaixo do mínimo AA 4.5:1 pra texto normal. /70 mede 9.71:1. */}
                  <span className="text-xs text-white/70 font-bold uppercase mt-1">Dias</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-4xl md:text-5xl font-black text-white tabular-nums">
                    {String(hoursRemaining).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-white/70 font-bold uppercase mt-1">Hrs</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-4xl md:text-5xl font-black text-white tabular-nums">
                    {String(minutesRemaining).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-white/70 font-bold uppercase mt-1">Min</span>
                </div>
                <div className="flex flex-col">
                  {/* text-brand (não text-brand-2) sobre bg-zinc-950 (fundo fixo, sem reagir a
                                        tema/dark:) só passa 4.5:1 na marca AtlasGR (6.25:1) — na Total Trac,
                                        --brand é um azul-marinho escuro demais pra esse fundo quase preto (2.41:1,
                                        falha grave). text-brand-2 (o tom mais claro de cada marca) resolve as
                                        duas: Atlas 7.9:1, Total Trac 5.51:1 sólido / 4.65:1 em /90. */}
                  <span className="text-4xl md:text-5xl font-black text-brand-2 tabular-nums">
                    {String(secondsRemaining).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-brand-2/90 font-bold uppercase mt-1">Seg</span>
                </div>
              </div>
            </motion.div>

            {/* Box: Dias úteis / Corridos */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-8 flex flex-col justify-center"
            >
              <div className="flex items-center gap-3 text-white/60 font-medium tracking-wider uppercase mb-4">
                <CalendarDays className="w-5 h-5" />
                Horizonte
              </div>
              <div className="text-5xl font-black text-white">{daysRemaining}</div>
              <div className="text-sm text-white/50 font-medium mt-2">
                Dias corridos até o fechamento
              </div>
            </motion.div>

            {/* Box: Run Rate */}
            {isGoalSet && !isGoalHit && (
              <motion.div
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-8 flex flex-col justify-center"
              >
                <div className="flex items-center gap-3 text-white/60 font-medium tracking-wider uppercase mb-4">
                  <TrendingUp className="w-5 h-5" />
                  Esforço Diário
                </div>
                <div className="text-4xl md:text-5xl font-black text-white tabular-nums">
                  {formatCurrency(runRate, currency)}
                </div>
                <div className="text-sm text-white/50 font-medium mt-2">
                  Necessário por dia p/ atingir a meta
                </div>
              </motion.div>
            )}

            {isGoalHit && (
              <motion.div
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                className="bg-green-500/10 border border-green-500/20 backdrop-blur-md rounded-3xl p-8 flex flex-col justify-center items-center text-center"
              >
                <Trophy className="w-12 h-12 text-yellow-400 mb-4" />
                <div className="text-2xl font-black text-white">Objetivo Concluído</div>
                <div className="text-sm text-white/70 mt-2">Excelente trabalho do time!</div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
