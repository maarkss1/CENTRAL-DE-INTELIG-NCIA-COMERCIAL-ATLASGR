import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './Card';
import { Badge } from './Badge';
import {
    IconBook, IconX, IconCheck, IconAlertTriangle, IconSparkle, IconHelp
} from '../icons';

export function FloatingChatbook() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'spin' | 'bant' | 'objections'>('spin');

    return (
        <>
            {/* Botão Flutuante no Canto Inferior Direito */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all border border-white/20 active:scale-95"
            >
                <IconBook className="w-5 h-5" />
                <span className="text-sm">Playbook Flutuante</span>
                <Badge variant="neutral" className="bg-white/20 text-white border-none text-[10px] px-1.5 py-0.5">
                    SPIN / BANT
                </Badge>
            </button>

            {/* Side Drawer */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50"
                        />

                        {/* Panel Drawer */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                            className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-50 flex flex-col border-l border-black/10"
                        >
                            {/* Header */}
                            <div className="p-5 border-b border-black/10 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-orange-600 text-white rounded-xl">
                                        <IconBook className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-atlas-dark text-base">Chatbook & Playbook de Vendas</h3>
                                        <p className="text-xs text-atlas-dark/50">Matrizes de Qualificação e Objeções AtlasGR</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 rounded-xl text-atlas-dark/40 hover:text-atlas-dark hover:bg-black/5 transition-colors"
                                >
                                    <IconX className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Sub-Header Tabs */}
                            <div className="flex border-b border-black/5 bg-gray-50/50 p-2 gap-1">
                                <button
                                    onClick={() => setActiveTab('spin')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === 'spin' ? 'bg-white text-orange-600 shadow-xs' : 'text-atlas-dark/50 hover:text-atlas-dark'}`}
                                >
                                    SPIN Selling
                                </button>
                                <button
                                    onClick={() => setActiveTab('bant')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === 'bant' ? 'bg-white text-orange-600 shadow-xs' : 'text-atlas-dark/50 hover:text-atlas-dark'}`}
                                >
                                    Matriz BANT
                                </button>
                                <button
                                    onClick={() => setActiveTab('objections')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === 'objections' ? 'bg-white text-orange-600 shadow-xs' : 'text-atlas-dark/50 hover:text-atlas-dark'}`}
                                >
                                    Contorno de Objeções
                                </button>
                            </div>

                            {/* Body Content */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm text-atlas-dark">
                                {activeTab === 'spin' && (
                                    <div className="space-y-4">
                                        <Card className="p-4 border-l-4 border-l-blue-500">
                                            <h4 className="font-bold text-blue-700 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <IconHelp className="w-4 h-4" /> Situação (S)
                                            </h4>
                                            <p className="text-xs text-atlas-dark/70">"Qual é o tamanho atual da sua frota e qual sistema de rastreamento/PGR vocês utilizam hoje?"</p>
                                        </Card>
                                        <Card className="p-4 border-l-4 border-l-amber-500">
                                            <h4 className="font-bold text-amber-700 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <IconAlertTriangle className="w-4 h-4" /> Problema (P)
                                            </h4>
                                            <p className="text-xs text-atlas-dark/70">"Com que frequência ocorrem falsos alertas ou atrasos no atendimento de sinistros na sua operação?"</p>
                                        </Card>
                                        <Card className="p-4 border-l-4 border-l-orange-500">
                                            <h4 className="font-bold text-orange-700 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <IconSparkle className="w-4 h-4" /> Implicação (I)
                                            </h4>
                                            <p className="text-xs text-atlas-dark/70">"Quanto esses eventos impactam o valor da sua apólice de seguro e a confiança dos seus embarcadores?"</p>
                                        </Card>
                                        <Card className="p-4 border-l-4 border-l-green-500">
                                            <h4 className="font-bold text-green-700 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <IconCheck className="w-4 h-4" /> Necessidade de Solução (N)
                                            </h4>
                                            <p className="text-xs text-atlas-dark/70">"Se reduzirmos o tempo de resposta a sinistros para menos de 3 minutos, quanto isso economizaria por mês?"</p>
                                        </Card>
                                    </div>
                                )}

                                {activeTab === 'bant' && (
                                    <div className="space-y-3">
                                        <div className="p-3 bg-gray-50 rounded-xl border border-black/5">
                                            <span className="font-bold text-xs text-orange-600 block mb-1">Budget (Orçamento)</span>
                                            <p className="text-xs text-atlas-dark/70">Verifique se o cliente possui verba alocada para PGR / Telemetria ou se o payback justifica remanejamento.</p>
                                        </div>
                                        <div className="p-3 bg-gray-50 rounded-xl border border-black/5">
                                            <span className="font-bold text-xs text-orange-600 block mb-1">Authority (Autoridade)</span>
                                            <p className="text-xs text-atlas-dark/70">Identifique se está falando com o Gerente de Risco, Diretor de Operações ou CEO/Dono.</p>
                                        </div>
                                        <div className="p-3 bg-gray-50 rounded-xl border border-black/5">
                                            <span className="font-bold text-xs text-orange-600 block mb-1">Need (Necessidade)</span>
                                            <p className="text-xs text-atlas-dark/70">Confirme se a dor é redução de sinistro, conformidade PGR ou eficiência da frota.</p>
                                        </div>
                                        <div className="p-3 bg-gray-50 rounded-xl border border-black/5">
                                            <span className="font-bold text-xs text-orange-600 block mb-1">Timeline (Prazo)</span>
                                            <p className="text-xs text-atlas-dark/70">Defina o prazo de implantação ou vencimento do contrato do fornecedor atual.</p>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'objections' && (
                                    <div className="space-y-3">
                                        <div className="p-3.5 bg-red-50/50 border border-red-200/60 rounded-xl">
                                            <span className="font-bold text-xs text-red-700 block mb-1">Objeção: "Já temos fornecedor de rastreamento"</span>
                                            <p className="text-xs text-atlas-dark/70 mb-2"><strong>Resposta AtlasGR:</strong> "Perfeito! A AtlasGR não substitui seu rastreador; nós integramos a inteligência de risco e PGR para otimizar o envio de comandos."</p>
                                        </div>
                                        <div className="p-3.5 bg-amber-50/50 border border-amber-200/60 rounded-xl">
                                            <span className="font-bold text-xs text-amber-800 block mb-1">Objeção: "Está acima do nosso orçamento"</span>
                                            <p className="text-xs text-atlas-dark/70 mb-2"><strong>Resposta AtlasGR:</strong> "Compreendo. Nosso contrato se paga na primeira carga recuperada ou no desconto da apólice. Vamos simular o ROI da sua frota?"</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
