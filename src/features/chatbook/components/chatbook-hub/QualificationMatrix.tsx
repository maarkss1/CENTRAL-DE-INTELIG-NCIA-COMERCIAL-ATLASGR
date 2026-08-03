import { Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Brand, BrandInfo } from '../../../../contexts/BrandContext';
import { QUALIFICATION_CRITERIA } from './playbookData';

export function QualificationMatrix({ activeBrand, brandInfo }: { activeBrand: Brand; brandInfo: BrandInfo }) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-8 md:p-12 border border-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.03)]">
                <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-3">
                    Matriz de Qualificação — <span className={activeBrand === 'totaltrac' ? 'text-sky-600' : 'text-atlas-orange'}>{brandInfo.name}</span>
                </h2>
                <p className="text-gray-500 text-base font-medium mb-10 max-w-3xl">
                    Estrutura SPIN Selling e BANT para validar se o Lead possui o perfil ideal e a dor correta para fechamento.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {QUALIFICATION_CRITERIA.map((crit, idx) => (
                        <motion.div whileHover={{ y: -5 }} key={idx} className="bg-white/60 p-8 rounded-[2rem] border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-6 flex flex-col justify-between">
                            <div className="flex items-start justify-between gap-4">
                                <h3 className="font-black text-xl text-gray-900 tracking-tight">{crit.category}</h3>
                                <span className={`px-3 py-1.5 text-[10px] font-black rounded-xl uppercase tracking-widest ${activeBrand === 'totaltrac' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'}`}>
                                    SPIN / BANT
                                </span>
                            </div>

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Critério para {brandInfo.name}</p>
                                <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                    {activeBrand === 'totaltrac' ? crit.totaltrac : crit.atlas}
                                </p>
                            </div>

                            <div className={`p-5 rounded-[1.5rem] border ${activeBrand === 'totaltrac' ? 'bg-sky-50/50 border-sky-100' : 'bg-orange-50/50 border-orange-100'}`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 ${activeBrand === 'totaltrac' ? 'text-sky-600' : 'text-atlas-orange'}`}>
                                    <Zap className="w-4 h-4" /> Pergunta SPIN Recomendada
                                </p>
                                <p className="text-sm text-gray-800 italic font-medium leading-relaxed">
                                    "{activeBrand === 'totaltrac' ? crit.spinQuestionTotaltrac : crit.spinQuestionAtlas}"
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
