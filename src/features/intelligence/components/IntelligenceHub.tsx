import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AIPendingActions } from './AIPendingActions';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { staggerContainer, staggerItem, fadeInUp, pageTransition } from '../../../lib/motion';
import {
    IconBrain, IconDatabase, IconActivity, IconCheck, IconCpu, IconBot, IconBolt, IconSparkle,
    IconTrendUp, IconServer,
} from '../../../components/icons';

const TABS = [
    { key: 'overview' as const, label: 'Visão Geral', icon: IconActivity },
    { key: 'actions' as const, label: 'Aprovações Pendentes', icon: IconCheck },
    { key: 'rag' as const, label: 'Memória Vetorial (RAG)', icon: IconCpu },
];

export function IntelligenceHub() {
    const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'rag'>('overview');

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <motion.div variants={fadeInUp} initial="hidden" animate="show">
                    <Card variant="glass" className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                                    <IconBrain className="w-6 h-6" />
                                </div>
                                <h1 className="text-2xl font-black text-atlas-dark">Central de Inteligência</h1>
                            </div>
                            <p className="text-atlas-dark/50 text-sm">Controle, monitore e aprove ações dos seus Agentes Autônomos de IA.</p>
                        </div>

                        {/* Status Global */}
                        <div className="flex items-center gap-4 bg-white/60 px-4 py-3 rounded-xl border border-black/5">
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                </span>
                                <span className="text-xs font-bold uppercase tracking-wider text-atlas-dark/50">Agente SDR</span>
                            </div>
                            <div className="h-6 w-px bg-black/10"></div>
                            <div className="flex items-center gap-2">
                                <IconDatabase className="w-3.5 h-3.5 text-blue-500" />
                                <span className="text-xs font-bold uppercase tracking-wider text-atlas-dark/50">RAG Ativo</span>
                            </div>
                        </div>
                    </Card>
                </motion.div>

                {/* Tabs */}
                <motion.div variants={fadeInUp} initial="hidden" animate="show" className="relative flex flex-wrap gap-1 bg-white p-1.5 rounded-xl border border-black/5 w-fit elevation-1">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === tab.key ? 'text-indigo-700' : 'text-atlas-dark/45 hover:text-atlas-dark/70 hover:bg-black/[0.03]'}`}
                        >
                            {activeTab === tab.key && (
                                <motion.span
                                    layoutId="intelligence-tab-pill"
                                    className="absolute inset-0 rounded-lg bg-indigo-50"
                                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                />
                            )}
                            <tab.icon className="relative z-10 w-4 h-4" />
                            <span className="relative z-10">{tab.label}</span>
                        </button>
                    ))}
                </motion.div>

                {/* Content */}
                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} variants={pageTransition} initial="initial" animate="animate" exit="exit">
                        {activeTab === 'overview' && (
                            <motion.div variants={staggerContainer(0.08)} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <motion.div variants={staggerItem}>
                                    <Card className="p-6 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                        <div className="relative z-10">
                                            <div className="text-indigo-600 mb-4"><IconBot className="w-7 h-7" /></div>
                                            <h3 className="text-3xl font-black text-atlas-dark mb-1">1.248</h3>
                                            <p className="text-sm font-medium text-atlas-dark/50">Leads Qualificados (30 dias)</p>
                                            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 w-fit px-2.5 py-1 rounded-full">
                                                <IconTrendUp className="w-3 h-3" /> +12% v.s. mês passado
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>

                                <motion.div variants={staggerItem}>
                                    <Card className="p-6 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                        <div className="relative z-10">
                                            <div className="text-amber-500 mb-4"><IconBolt className="w-7 h-7" /></div>
                                            <h3 className="text-3xl font-black text-atlas-dark mb-1">4.5M</h3>
                                            <p className="text-sm font-medium text-atlas-dark/50">Tokens Processados</p>
                                            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-atlas-dark/60 bg-black/[0.03] w-fit px-2.5 py-1 rounded-full">
                                                <IconServer className="w-3 h-3" /> Custo Estimado: US$ 2,45
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>

                                <motion.div variants={staggerItem}>
                                    <Card className="p-6 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                        <div className="relative z-10">
                                            <div className="text-emerald-500 mb-4"><IconSparkle className="w-7 h-7" /></div>
                                            <h3 className="text-3xl font-black text-atlas-dark mb-1">87%</h3>
                                            <p className="text-sm font-medium text-atlas-dark/50">Precisão do ICP</p>
                                            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 w-fit px-2.5 py-1 rounded-full">
                                                Baseado no Histórico
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>
                            </motion.div>
                        )}

                        {activeTab === 'actions' && (
                            <Card className="p-6">
                                <AIPendingActions />
                            </Card>
                        )}

                        {activeTab === 'rag' && (
                            <Card className="p-6">
                                <h3 className="text-lg font-bold text-atlas-dark mb-4 flex items-center gap-2">
                                    <IconDatabase className="w-5 h-5 text-blue-500" />
                                    Conhecimento Injetado (pgvector)
                                </h3>
                                <p className="text-sm text-atlas-dark/55 mb-6 max-w-3xl">
                                    O Agente SDR utiliza essa base de conhecimento (playbooks, scripts, histórico) para enriquecer o contexto de cada lead antes da qualificação.
                                </p>

                                <div className="space-y-4">
                                    <div className="p-4 bg-black/[0.02] border border-black/5 rounded-xl flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-atlas-dark text-sm">Playbook de Vendas - B2B Atlas</p>
                                            <p className="text-xs text-atlas-dark/45 mt-1">Última sincronização há 2 horas</p>
                                        </div>
                                        <Badge variant="success">
                                            <IconCheck className="w-3 h-3" /> Ativo
                                        </Badge>
                                    </div>
                                    <div className="p-4 bg-black/[0.02] border border-black/5 rounded-xl flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-atlas-dark text-sm">Regras ICP B2B Logística</p>
                                            <p className="text-xs text-atlas-dark/45 mt-1">Última sincronização há 5 dias</p>
                                        </div>
                                        <Badge variant="success">
                                            <IconCheck className="w-3 h-3" /> Ativo
                                        </Badge>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
