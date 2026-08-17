import { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Target, Sparkles, AlertCircle, MessageSquare, ShieldAlert, Zap, Compass, BrainCircuit, Activity } from 'lucide-react';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';

interface B2BMatrixResult {
    pains: string[];
    questions: string[];
    objections: Array<{ objection: string; rebuttal: string }>;
}

export function B2BGenerator() {
    const accent = useBrandAccent();
    const { brandInfo } = useBrand();
    const [icp, setIcp] = useState('');
    const [solution, setSolution] = useState('');
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<B2BMatrixResult | null>(null);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        if (!icp || !solution) return;
        setGenerating(true);
        setError('');
        setResult(null);
        try {
            const response = await api.post<{ result: B2BMatrixResult }>('/api/intelligence/studio', {
                kind: 'b2b_matrix',
                brand: { name: brandInfo.name, description: brandInfo.description },
                inputs: { icp, solution },
            }, { timeoutMs: 90_000 });
            setResult(response.result);
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'Não foi possível gerar a matriz.');
        } finally {
            setGenerating(false);
        }
    };

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className="space-y-8">
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface rounded-[2.5rem] p-8 shadow-card relative overflow-hidden border border-line"
            >
                {/* Background effects */}
                <div className={`absolute top-0 right-0 w-[500px] h-[500px] ${accent.blobA} rounded-full blur-[120px] pointer-events-none -mt-40 -mr-40 opacity-30`}></div>
                <div className={`absolute bottom-0 left-0 w-[400px] h-[400px] ${accent.blobB} rounded-full blur-[100px] pointer-events-none -mb-20 -ml-20 opacity-30`}></div>

                <div className="relative z-10 flex flex-col items-center text-center mb-10">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className={`w-16 h-16 rounded-2xl ${accent.bgSoft} border ${accent.borderSoft} flex items-center justify-center mb-6 shadow-sm backdrop-blur-md`}
                    >
                        <BrainCircuit size={32} className={accent.text} />
                    </motion.div>
                    <h3 className="text-3xl font-black text-ink mb-3 tracking-tight">
                        {accent.brandName} <span className={`text-transparent bg-clip-text bg-gradient-to-r ${accent.gradient}`}>Simulador Cognitivo B2B</span>
                    </h3>
                    <p className="text-sm text-ink-2 max-w-2xl leading-relaxed">
                        Mapeamento preditivo de ICP. A IA cruza dados de mercado para formular hipóteses de dores latentes, perguntas SPIN e contorno tático de objeções de alto nível.
                    </p>
                </div>

                {/* Quick Presets */}
                <div className="relative z-10 max-w-4xl mx-auto mb-6 flex flex-wrap items-center justify-center gap-2">
                    <span className="text-[11px] font-bold text-ink-2 uppercase tracking-wider mr-1">Exemplos Prontos:</span>
                    <button
                        type="button"
                        onClick={() => {
                            setIcp('Diretor de Logística & Head de GR (Transportadoras de Carga Pesada)');
                            setSolution('Torre de Gerenciamento de Risco e Tratativa Operacional de Exceções em Tempo Real');
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-ink-2 hover:text-ink border border-line transition-all cursor-pointer font-medium"
                    >
                        🚛 Cargas Pesadas & GR
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setIcp('Gerente de SSMA e Frotas (Embarcadores Químicos e Perigosos)');
                            setSolution('Videotelemetria com IA, Monitoramento de Fadiga e Checklist Digital de Jornada');
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-ink-2 hover:text-ink border border-line transition-all cursor-pointer font-medium"
                    >
                        🧪 Químicos & Fadiga
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setIcp('CFO e Diretor de Suprimentos (Distribuição e E-commerce)');
                            setSolution('Redução de Custo de Ociosidade de Frota e Rastreabilidade End-to-End');
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-ink-2 hover:text-ink border border-line transition-all cursor-pointer font-medium"
                    >
                        📦 E-commerce & Ociosidade
                    </button>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-4xl mx-auto">
                    <div className="group relative">
                        <div className={`absolute inset-0 bg-gradient-to-r ${accent.gradient} opacity-0 group-hover:opacity-15 rounded-2xl blur-xl transition-opacity duration-500`}></div>
                        <div className="relative bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md">
                            <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.text}`}>
                                <Target size={14} /> Persona / ICP Alvo
                            </p>
                            <input
                                type="text"
                                placeholder="Ex: CFO, Diretor de RH, Head de Logística..."
                                value={icp}
                                onChange={(e) => setIcp(e.target.value)}
                                className={`w-full bg-transparent text-ink text-lg placeholder:text-ink-2 focus:outline-none focus:ring-0 border-b border-line focus:border-brand transition-colors pb-2`}
                            />
                        </div>
                    </div>

                    <div className="group relative">
                        <div className={`absolute inset-0 bg-gradient-to-r ${accent.gradient} opacity-0 group-hover:opacity-15 rounded-2xl blur-xl transition-opacity duration-500`}></div>
                        <div className="relative bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md">
                            <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.text}`}>
                                <Zap size={14} /> Sua Solução / Produto
                            </p>
                            <input
                                type="text"
                                placeholder="Ex: ERP Cloud, Software de Telemetria..."
                                value={solution}
                                onChange={(e) => setSolution(e.target.value)}
                                className={`w-full bg-transparent text-ink text-lg placeholder:text-ink-2 focus:outline-none focus:ring-0 border-b border-line focus:border-brand transition-colors pb-2`}
                            />
                        </div>
                    </div>
                </div>

                <div className="relative z-10 flex justify-center">
                    <button
                        onClick={handleGenerate}
                        disabled={generating || !icp || !solution}
                        className={`group relative flex items-center justify-center gap-3 bg-gradient-to-r ${accent.gradient} text-white px-10 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shadow-lg cursor-pointer`}
                    >
                        {generating && (
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 border-2 border-white/40 rounded-full border-t-transparent border-l-transparent"
                            />
                        )}
                        {generating ? (
                            <Activity size={18} className="animate-pulse text-white" />
                        ) : (
                            <Sparkles size={18} className="text-white group-hover:rotate-12 transition-transform" />
                        )}
                        {generating ? 'Sintetizando Dados...' : 'Gerar Matriz Cognitiva'}
                    </button>
                </div>
                {error && (
                    <div role="alert" className="relative z-10 mx-auto mt-5 flex max-w-2xl items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-left text-sm text-danger font-medium">
                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
            </motion.div>

            <AnimatePresence>
                {result && !generating && (
                    <motion.div 
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 lg:grid-cols-2 gap-8"
                    >
                        <div className="space-y-8">
                            <motion.div variants={itemVariants} className="bg-surface border border-line rounded-[2.5rem] p-8 shadow-card relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-bl-full -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-150 ease-out"></div>
                                <h4 className="font-black text-2xl text-ink mb-8 flex items-center gap-3 relative z-10">
                                    <div className="w-12 h-12 rounded-2xl bg-red-500/15 text-red-500 flex items-center justify-center shadow-inner">
                                        <AlertCircle size={24} />
                                    </div>
                                    Hipóteses de Dores
                                </h4>
                                <ul className="space-y-4 relative z-10">
                                    {result.pains.map((pain: string, i: number) => (
                                        <motion.li 
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.1 }}
                                            key={i} 
                                            className="flex gap-4 text-sm text-ink bg-surface-2 p-5 rounded-2xl border border-line hover:border-red-500/30 transition-colors items-start"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center font-black text-xs shrink-0 mt-0.5 shadow-sm">
                                                {i + 1}
                                            </div> 
                                            <span className="leading-relaxed font-medium">{pain}</span>
                                        </motion.li>
                                    ))}
                                </ul>
                            </motion.div>

                            <motion.div variants={itemVariants} className="bg-surface border border-line rounded-[2.5rem] p-8 shadow-card relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-full -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-150 ease-out"></div>
                                <h4 className="font-black text-2xl text-ink mb-8 flex items-center gap-3 relative z-10">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-500 flex items-center justify-center shadow-inner">
                                        <MessageSquare size={24} />
                                    </div>
                                    Perguntas de Implicação (SPIN)
                                </h4>
                                <ul className="space-y-4 relative z-10">
                                    {result.questions.map((q: string, i: number) => (
                                        <motion.li 
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.1 }}
                                            key={i} 
                                            className="flex gap-4 text-sm text-ink bg-surface-2 p-5 rounded-2xl border border-line hover:border-blue-500/30 transition-colors items-start"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-black text-xs shrink-0 mt-0.5 shadow-sm">
                                                ?
                                            </div> 
                                            <span className="leading-relaxed font-medium">{q}</span>
                                        </motion.li>
                                    ))}
                                </ul>
                            </motion.div>
                        </div>

                        <motion.div variants={itemVariants} className="bg-surface border border-line rounded-[2.5rem] p-8 shadow-card relative overflow-hidden group h-fit">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-bl-full -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-150 ease-out"></div>
                            <h4 className="font-black text-2xl text-ink mb-8 flex items-center gap-3 relative z-10">
                                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shadow-inner">
                                    <ShieldAlert size={24} />
                                </div>
                                Matriz de Objeções (Contorno)
                            </h4>
                            <div className="space-y-6 relative z-10">
                                {result.objections.map((obj, i) => (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.15 }}
                                        key={i} 
                                        className="p-6 bg-surface-2 border border-line shadow-sm rounded-2xl space-y-5 hover:shadow-md transition-shadow relative overflow-hidden"
                                    >
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-emerald-400"></div>
                                        <div>
                                            <p className="text-[10px] uppercase font-black tracking-widest text-amber-500 mb-2 flex items-center gap-1.5">
                                                <Compass size={12} /> Objeção Provável
                                            </p>
                                            <p className="text-sm font-bold text-ink leading-relaxed bg-surface p-4 rounded-xl border border-line">&quot;{obj.objection}&quot;</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-black tracking-widest text-emerald-500 mb-2 flex items-center gap-1.5">
                                                <Sparkles size={12} /> Argumento de Contorno
                                            </p>
                                            <p className="text-sm text-ink font-medium leading-relaxed bg-surface p-4 rounded-xl border border-line">&quot;{obj.rebuttal}&quot;</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
