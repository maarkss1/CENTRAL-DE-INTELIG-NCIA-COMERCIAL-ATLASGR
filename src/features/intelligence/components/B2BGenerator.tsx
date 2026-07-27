import { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Target, Sparkles, AlertCircle, MessageSquare, ShieldAlert, Zap, Compass, BrainCircuit, Activity } from 'lucide-react';

export function B2BGenerator() {
    const [icp, setIcp] = useState('');
    const [solution, setSolution] = useState('');
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<any>(null);

    const handleGenerate = () => {
        if (!icp || !solution) return;
        setGenerating(true);
        setTimeout(() => {
            setResult({
                pains: [
                    "Falta de visibilidade em tempo real sobre a operação, causando decisões reativas.",
                    "Custos altos e não mapeados gerando desperdício de recursos críticos.",
                    "Dificuldade em provar o ROI das ferramentas ou processos atuais para a diretoria."
                ],
                questions: [
                    "Como a falta de previsibilidade nos processos hoje afeta o seu planejamento orçamentário para o próximo semestre?",
                    "Se você pudesse reduzir o tempo gasto pela sua equipe 'apagando incêndios', onde investiria esse tempo livre de forma estratégica?",
                    "Qual o impacto financeiro e de mercado de não resolver esse gargalo de visibilidade neste exato momento?"
                ],
                objections: [
                    {
                        objection: "Não temos orçamento aprovado para isso no momento.",
                        rebuttal: "Entendo perfeitamente. A maioria dos nossos clientes atuais também não tinha orçamento extra quando conversamos pela primeira vez. O que fizemos foi realocar os valores que eles já estavam perdendo com ineficiências (que a nossa solução elimina no primeiro mês). Faz sentido explorarmos essa matemática rápida?"
                    },
                    {
                        objection: "Já usamos o sistema X, que nos atende bem.",
                        rebuttal: "O sistema X é uma excelente ferramenta para a operação básica, temos clientes que vieram de lá. Onde eles viram valor imediato na nossa solução foi na camada analítica profunda que o X não cobre nativamente. Posso te mostrar uma tela rápida de como eles operam em conjunto?"
                    },
                    {
                        objection: "Agora não é o momento ideal, me procure no próximo trimestre.",
                        rebuttal: "Compreendo, o fim de quarter é sempre corrido. Mas me diga: o problema que nossa ferramenta resolve está custando capital hoje. Esperar três meses significa acumular esse custo. Se a implementação for leve e exigir apenas 2 horas do seu time, valeria a pena estancar essa 'sangria' o quanto antes?"
                    }
                ]
            });
            setGenerating(false);
        }, 2000);
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
                className="bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden border border-white/10"
            >
                {/* Background effects */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none -mt-40 -mr-40"></div>
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-[100px] pointer-events-none -mb-20 -ml-20"></div>

                <div className="relative z-10 flex flex-col items-center text-center mb-10">
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner backdrop-blur-md"
                    >
                        <BrainCircuit size={32} className="text-indigo-400" />
                    </motion.div>
                    <h3 className="text-3xl font-black text-white mb-3 tracking-tight">
                        Nexus B2B <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Cognitive Generator</span>
                    </h3>
                    <p className="text-sm text-gray-400 max-w-2xl leading-relaxed">
                        Mapeamento preditivo de ICP. A IA cruza dados de mercado para formular hipóteses de dores latentes, perguntas SPIN e contorno tático de objeções de alto nível.
                    </p>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-4xl mx-auto">
                    <div className="group relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div className="relative bg-black/40 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                            <label className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-indigo-400">
                                <Target size={14} /> Persona / ICP Alvo
                            </label>
                            <input 
                                type="text" 
                                placeholder="Ex: CFO, Diretor de RH, Head de Logística..."
                                value={icp}
                                onChange={(e) => setIcp(e.target.value)}
                                className="w-full bg-transparent text-white text-lg placeholder-gray-600 focus:outline-none focus:ring-0 border-b border-white/10 focus:border-indigo-400 transition-colors pb-2"
                            />
                        </div>
                    </div>

                    <div className="group relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div className="relative bg-black/40 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                            <label className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-purple-400">
                                <Zap size={14} /> Sua Solução / Produto
                            </label>
                            <input 
                                type="text" 
                                placeholder="Ex: ERP Cloud, Software de Telemetria..."
                                value={solution}
                                onChange={(e) => setSolution(e.target.value)}
                                className="w-full bg-transparent text-white text-lg placeholder-gray-600 focus:outline-none focus:ring-0 border-b border-white/10 focus:border-purple-400 transition-colors pb-2"
                            />
                        </div>
                    </div>
                </div>

                <div className="relative z-10 flex justify-center">
                    <button 
                        onClick={handleGenerate}
                        disabled={generating || !icp || !solution}
                        className="group relative flex items-center justify-center gap-3 bg-white text-gray-900 px-10 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_60px_rgba(255,255,255,0.2)]"
                    >
                        {generating && (
                            <motion.div 
                                animate={{ rotate: 360 }} 
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 border-2 border-indigo-500 rounded-full border-t-transparent border-l-transparent"
                            />
                        )}
                        {generating ? (
                            <Activity size={18} className="animate-pulse text-indigo-600" />
                        ) : (
                            <Sparkles size={18} className="text-indigo-600 group-hover:rotate-12 transition-transform" />
                        )}
                        {generating ? 'Sintetizando Dados...' : 'Gerar Matriz Cognitiva'}
                    </button>
                </div>
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
                            <motion.div variants={itemVariants} className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-full -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-150 ease-out"></div>
                                <h4 className="font-black text-2xl text-gray-900 mb-8 flex items-center gap-3 relative z-10">
                                    <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center shadow-inner">
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
                                            className="flex gap-4 text-sm text-gray-700 bg-gray-50/80 hover:bg-red-50/50 p-5 rounded-2xl border border-gray-100 hover:border-red-100 transition-colors items-start"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-black text-xs shrink-0 mt-0.5 shadow-sm">
                                                {i + 1}
                                            </div> 
                                            <span className="leading-relaxed font-medium">{pain}</span>
                                        </motion.li>
                                    ))}
                                </ul>
                            </motion.div>

                            <motion.div variants={itemVariants} className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-150 ease-out"></div>
                                <h4 className="font-black text-2xl text-gray-900 mb-8 flex items-center gap-3 relative z-10">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-inner">
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
                                            className="flex gap-4 text-sm text-gray-700 bg-gray-50/80 hover:bg-blue-50/50 p-5 rounded-2xl border border-gray-100 hover:border-blue-100 transition-colors items-start"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xs shrink-0 mt-0.5 shadow-sm">
                                                ?
                                            </div> 
                                            <span className="leading-relaxed font-medium">{q}</span>
                                        </motion.li>
                                    ))}
                                </ul>
                            </motion.div>
                        </div>

                        <motion.div variants={itemVariants} className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group h-fit">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-50 rounded-bl-full -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-150 ease-out"></div>
                            <h4 className="font-black text-2xl text-gray-900 mb-8 flex items-center gap-3 relative z-10">
                                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shadow-inner">
                                    <ShieldAlert size={24} />
                                </div>
                                Matriz de Objeções (Contorno)
                            </h4>
                            <div className="space-y-6 relative z-10">
                                {result.objections.map((obj: any, i: number) => (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.15 }}
                                        key={i} 
                                        className="p-6 bg-white border border-gray-200 shadow-sm rounded-2xl space-y-5 hover:shadow-md transition-shadow relative overflow-hidden"
                                    >
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-emerald-400"></div>
                                        <div>
                                            <p className="text-[10px] uppercase font-black tracking-widest text-amber-500 mb-2 flex items-center gap-1.5">
                                                <Compass size={12} /> Objeção Provável
                                            </p>
                                            <p className="text-sm font-bold text-gray-900 leading-relaxed bg-gray-50 p-4 rounded-xl">"{obj.objection}"</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-black tracking-widest text-emerald-500 mb-2 flex items-center gap-1.5">
                                                <Sparkles size={12} /> Argumento de Contorno
                                            </p>
                                            <p className="text-sm text-gray-700 font-medium leading-relaxed bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50">"{obj.rebuttal}"</p>
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
