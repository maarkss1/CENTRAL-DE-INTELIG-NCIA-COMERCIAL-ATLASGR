import { useState } from 'react';
import { Bot, Activity, BrainCircuit, Database, Zap, Sparkles, TrendingUp, Cpu, Server, CheckCircle2 } from 'lucide-react';
import { AIPendingActions } from './AIPendingActions';

export function IntelligenceHub() {
    const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'rag'>('overview');

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                                <BrainCircuit size={24} />
                            </div>
                            <h1 className="text-2xl font-black text-atlas-dark">Central de Inteligência</h1>
                        </div>
                        <p className="text-gray-500 text-sm">Controle, monitore e aprove ações dos seus Agentes Autônomos de IA.</p>
                    </div>
                    
                    {/* Status Global */}
                    <div className="flex items-center gap-4 bg-gray-50/50 px-4 py-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Agente SDR</span>
                        </div>
                        <div className="h-6 w-px bg-gray-200"></div>
                        <div className="flex items-center gap-2">
                            <Database size={14} className="text-blue-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">RAG Ativo</span>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex space-x-1 bg-white p-1.5 rounded-xl border border-gray-100 w-fit shadow-sm">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'overview' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        <Activity size={16} /> Visão Geral
                    </button>
                    <button
                        onClick={() => setActiveTab('actions')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'actions' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        <CheckCircle2 size={16} /> Aprovações Pendentes
                    </button>
                    <button
                        onClick={() => setActiveTab('rag')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'rag' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        <Cpu size={16} /> Memória Vetorial (RAG)
                    </button>
                </div>

                {/* Content */}
                <div className="transition-all duration-300">
                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Cards de Métricas */}
                            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="text-indigo-600 mb-4">
                                        <Bot size={28} />
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-900 mb-1">1,248</h3>
                                    <p className="text-sm font-medium text-gray-500">Leads Qualificados (30 dias)</p>
                                    <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 w-fit px-2.5 py-1 rounded-full">
                                        <TrendingUp size={12} /> +12% v.s. mês passado
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="text-amber-500 mb-4">
                                        <Zap size={28} />
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-900 mb-1">4.5M</h3>
                                    <p className="text-sm font-medium text-gray-500">Tokens Processados</p>
                                    <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-gray-600 bg-gray-100 w-fit px-2.5 py-1 rounded-full">
                                        <Server size={12} /> Custo Estimado: US$ 2.45
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="text-emerald-500 mb-4">
                                        <Sparkles size={28} />
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-900 mb-1">87%</h3>
                                    <p className="text-sm font-medium text-gray-500">Precisão do ICP</p>
                                    <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 w-fit px-2.5 py-1 rounded-full">
                                        Baseado no Histórico
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'actions' && (
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <AIPendingActions />
                        </div>
                    )}

                    {activeTab === 'rag' && (
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Database className="text-blue-500" />
                                Conhecimento Injetado (pgvector)
                            </h3>
                            <p className="text-sm text-gray-600 mb-6 max-w-3xl">
                                O Agente SDR utiliza essa base de conhecimento (playbooks, scripts, histórico) para enriquecer o contexto de cada lead antes da qualificação.
                            </p>
                            
                            <div className="space-y-4">
                                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-gray-900 text-sm">Playbook de Vendas - B2B Atlas</p>
                                        <p className="text-xs text-gray-500 mt-1">Última sincronização há 2 horas</p>
                                    </div>
                                    <div className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Ativo</div>
                                </div>
                                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-gray-900 text-sm">Regras ICP B2B Logística</p>
                                        <p className="text-xs text-gray-500 mt-1">Última sincronização há 5 dias</p>
                                    </div>
                                    <div className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Ativo</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
