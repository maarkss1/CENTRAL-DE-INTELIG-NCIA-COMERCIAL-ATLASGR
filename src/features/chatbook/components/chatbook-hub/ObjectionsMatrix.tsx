import { motion } from 'framer-motion';
import type { Brand, BrandInfo } from '../../../../contexts/BrandContext';
import { OBJECTIONS_DATA } from './playbookData';

export function ObjectionsMatrix({ activeBrand, brandInfo }: { activeBrand: Brand; brandInfo: BrandInfo }) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-8 md:p-12 border border-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.03)]">
                <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-3">
                    Contorno de Objeções — <span className={activeBrand === 'totaltrac' ? 'text-sky-600' : 'text-atlas-orange'}>{brandInfo.name}</span>
                </h2>
                <p className="text-gray-500 text-base font-medium mb-10 max-w-3xl">
                    Respostas de alta conversão para transformar hesitações e objeções comuns em oportunidades de fechamento.
                </p>

                <div className="space-y-6">
                    {OBJECTIONS_DATA.map((obj) => (
                        <motion.div whileHover={{ scale: 1.01 }} key={obj.id} className="p-8 rounded-[2rem] border border-white bg-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all duration-300 space-y-5">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-gray-100 pb-5">
                                <div>
                                    <h3 className="font-black text-xl text-gray-900 tracking-tight">{obj.title}</h3>
                                    <p className="text-sm text-gray-500 font-medium mt-1">{obj.description}</p>
                                </div>
                                <span className="px-4 py-2 bg-amber-100/50 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-xl self-start shrink-0 border border-amber-200">
                                    Técnica: {obj.technique}
                                </span>
                            </div>

                            <div className={`p-5 rounded-[1.5rem] border ${activeBrand === 'totaltrac' ? 'bg-sky-50/50 border-sky-100' : 'bg-orange-50/50 border-orange-100'}`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${activeBrand === 'totaltrac' ? 'text-sky-400' : 'text-orange-400'}`}>Script Comercial Sugerido</p>
                                <div className="text-base text-gray-800 leading-relaxed font-medium italic">
                                    "{activeBrand === 'totaltrac' ? obj.bestResponseTotaltrac : obj.bestResponseAtlas}"
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
