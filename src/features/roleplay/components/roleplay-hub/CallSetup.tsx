import { motion } from 'framer-motion';
import { CheckCircle2, Phone, PhoneCall } from 'lucide-react';
import type { Persona } from './types';

export function CallSetup({
  currentPersonas,
  selectedPersona,
  setSelectedPersona,
  difficulty,
  setDifficulty,
  onStart,
}: {
  currentPersonas: Persona[];
  selectedPersona: string;
  setSelectedPersona: (id: string) => void;
  difficulty: 'facil' | 'medio' | 'dificil';
  setDifficulty: (level: 'facil' | 'medio' | 'dificil') => void;
  onStart: () => void;
}) {
  return (
    <div className="bg-surface/80 backdrop-blur-xl rounded-[3rem] p-8 md:p-12 border border-line shadow-[0_20px_40px_rgba(0,0,0,0.03)] space-y-10">
      <div className="text-center space-y-3">
        <h2 className="text-2xl md:text-3xl font-black text-ink flex items-center justify-center gap-3 tracking-tight">
          <PhoneCall className="w-8 h-8 text-brand" /> Setup da Ligação
        </h2>
        <p className="text-ink-2 text-base font-medium max-w-xl mx-auto">
          Escolha quem você vai ligar e o nível de resistência. A IA atende a ligação e simula um
          comprador real por voz.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {currentPersonas.map((p) => (
          <motion.button
            type="button"
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            key={p.id}
            onClick={() => setSelectedPersona(p.id)}
            aria-pressed={selectedPersona === p.id}
            className={`w-full text-left p-6 md:p-8 rounded-[2rem] border-2 cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
              selectedPersona === p.id
                ? 'border-brand bg-brand/10 shadow-brand-sm'
                : 'border-line hover:border-ink-2/30 bg-surface shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <span className="font-black text-lg text-ink leading-tight pr-4">{p.label}</span>
              {selectedPersona === p.id && <CheckCircle2 className="w-6 h-6 shrink-0 text-brand" />}
            </div>
            <p className="text-sm text-ink-2 leading-relaxed font-medium">{p.desc}</p>
          </motion.button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row items-center justify-between gap-6 pt-6 border-t border-line">
        <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
          <span className="text-xs font-black uppercase tracking-widest text-ink-2">
            Resistência da ligação:
          </span>
          <div className="flex bg-surface-2 p-1.5 rounded-[1.25rem] w-full md:w-auto">
            {(['facil', 'medio', 'dificil'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setDifficulty(level)}
                className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-black capitalize transition-all ${
                  difficulty === level
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="w-full lg:w-auto px-10 py-4 rounded-[1.75rem] font-black text-white text-sm uppercase tracking-wider shadow-xl shadow-brand-sm flex items-center justify-center gap-3 transition-transform hover:scale-105 bg-brand-active hover:bg-brand-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Phone className="w-5 h-5" /> Ligar Agora
        </button>
      </div>
    </div>
  );
}
