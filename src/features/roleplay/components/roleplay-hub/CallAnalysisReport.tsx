import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Phone, RotateCcw, ShieldCheck } from 'lucide-react';
import type { CallAnalysisResult } from './types';

function scoreColor(score: number): string {
    if (score >= 75) return 'from-emerald-400 to-emerald-600';
    if (score >= 45) return 'from-amber-300 to-orange-500';
    return 'from-rose-400 to-rose-600';
}

export function CallAnalysisReport({
    analysisResult, onRestart,
}: {
    analysisResult: CallAnalysisResult;
    onRestart: () => void;
}) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-surface/90 backdrop-blur-2xl rounded-[3rem] p-10 border border-line shadow-[0_30px_60px_rgba(0,0,0,0.08)] space-y-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/10 rounded-full blur-[80px] pointer-events-none" />

            <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-gray-900 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

                <div className="relative z-10 text-center md:text-left flex-1">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-widest mb-4">
                        <ShieldCheck className="w-4 h-4" /> Avaliador de Ligação · Groq IA
                    </div>
                    <h2 className="text-4xl lg:text-5xl font-black mb-3 tracking-tight">Nota da Ligação</h2>
                    <p className="text-gray-400 text-base md:text-lg font-medium leading-relaxed max-w-2xl">{analysisResult.feedback}</p>
                </div>

                <div className="relative z-10 flex flex-col items-center bg-white/10 backdrop-blur-xl px-12 py-8 rounded-[2rem] border border-white/20 shrink-0">
                    <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Nota estimada</span>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br ${scoreColor(analysisResult.score)} tracking-tighter`}>{analysisResult.score}</span>
                    </div>
                    <div className="mt-4 px-4 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold uppercase tracking-widest">
                        Estimativa pedagógica
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
                <div className="bg-emerald-50/50 p-8 rounded-[2rem] border border-emerald-100 space-y-6">
                    <h3 className="font-black text-xl text-emerald-900 flex items-center gap-3 tracking-tight">
                        <div className="p-2 bg-emerald-100 rounded-xl"><CheckCircle2 className="w-6 h-6 text-emerald-600" /></div> O que funcionou
                    </h3>
                    <ul className="space-y-4">
                        {analysisResult.strengths.map((s, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-base text-emerald-800 font-medium leading-relaxed">
                                <span className="w-2 h-2 mt-2 rounded-full bg-emerald-500 shrink-0" /> {s}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-rose-50/50 p-8 rounded-[2rem] border border-rose-100 space-y-6">
                    <h3 className="font-black text-xl text-rose-900 flex items-center gap-3 tracking-tight">
                        <div className="p-2 bg-rose-100 rounded-xl"><AlertTriangle className="w-6 h-6 text-rose-600" /></div> Dicas para a próxima ligação
                    </h3>
                    <ul className="space-y-4">
                        {analysisResult.improvements.map((imp, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-base text-rose-800 font-medium leading-relaxed">
                                <span className="w-2 h-2 mt-2 rounded-full bg-rose-500 shrink-0" /> {imp}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="flex justify-center pt-4">
                <button
                    onClick={onRestart}
                    className="px-10 py-5 bg-gray-900 hover:bg-black text-white rounded-[1.75rem] font-black text-sm uppercase tracking-wider flex items-center gap-3 transition-transform hover:scale-105 shadow-xl shadow-gray-900/20"
                >
                    <RotateCcw className="w-5 h-5" /> <Phone className="w-5 h-5" /> Nova Ligação
                </button>
            </div>
        </motion.div>
    );
}
