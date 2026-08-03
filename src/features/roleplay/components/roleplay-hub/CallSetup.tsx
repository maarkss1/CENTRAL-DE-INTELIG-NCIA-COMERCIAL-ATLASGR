import { motion } from 'framer-motion';
import { CheckCircle2, Phone, PhoneCall } from 'lucide-react';
import type { Brand } from '../../../../contexts/BrandContext';
import type { Persona } from './types';

export function CallSetup({
    activeBrand, currentPersonas, selectedPersona, setSelectedPersona, difficulty, setDifficulty, onStart,
}: {
    activeBrand: Brand;
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
                    <PhoneCall className={`w-8 h-8 ${activeBrand === 'totaltrac' ? 'text-sky-500' : 'text-atlas-orange'}`} /> Setup da Ligação
                </h2>
                <p className="text-ink-2 text-base font-medium max-w-xl mx-auto">
                    Escolha quem você vai ligar e o nível de resistência. A IA atende a ligação e simula um comprador real por voz.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {currentPersonas.map((p) => (
                    <motion.div
                        whileHover={{ y: -5, scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={p.id}
                        onClick={() => setSelectedPersona(p.id)}
                        className={`p-6 md:p-8 rounded-[2rem] border-2 cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                            selectedPersona === p.id
                                ? activeBrand === 'totaltrac'
                                    ? 'border-sky-500 bg-sky-50/80 shadow-[0_10px_30px_rgba(2,132,199,0.15)]'
                                    : 'border-orange-500 bg-orange-50/80 shadow-[0_10px_30px_rgba(249,115,22,0.15)]'
                                : 'border-line hover:border-ink-2/30 bg-surface shadow-sm'
                        }`}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <span className="font-black text-lg text-ink leading-tight pr-4">{p.label}</span>
                            {selectedPersona === p.id && (
                                <CheckCircle2 className={`w-6 h-6 shrink-0 ${activeBrand === 'totaltrac' ? 'text-sky-600' : 'text-atlas-orange'}`} />
                            )}
                        </div>
                        <p className="text-sm text-ink-2 leading-relaxed font-medium">{p.desc}</p>
                    </motion.div>
                ))}
            </div>

            <div className="flex flex-col lg:flex-row items-center justify-between gap-6 pt-6 border-t border-line">
                <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
                    <span className="text-xs font-black uppercase tracking-widest text-ink-2">Resistência da ligação:</span>
                    <div className="flex bg-surface-2 p-1.5 rounded-[1.25rem] w-full md:w-auto">
                        {(['facil', 'medio', 'dificil'] as const).map((level) => (
                            <button
                                key={level}
                                onClick={() => setDifficulty(level)}
                                className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-black capitalize transition-all ${
                                    difficulty === level ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                                }`}
                            >
                                {level}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={onStart}
                    className={`w-full lg:w-auto px-10 py-4 rounded-[1.75rem] font-black text-white text-sm uppercase tracking-wider shadow-xl shadow-current/20 flex items-center justify-center gap-3 transition-transform hover:scale-105 ${
                        activeBrand === 'totaltrac'
                            ? 'bg-sky-600 hover:bg-sky-700'
                            : 'bg-atlas-orange hover:bg-orange-600'
                    }`}
                >
                    <Phone className="w-5 h-5" /> Ligar Agora
                </button>
            </div>
        </div>
    );
}
