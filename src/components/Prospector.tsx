import { useState, useEffect } from 'react';
import { Search, Loader2, Save, MapPin, Building2, Users, Database, Globe, CheckCircle2, TrendingUp, Cpu } from 'lucide-react';
import { SearchCriteria } from '../types/index';
import { api } from '../lib/api';

export interface Prospect {
    name: string;
    segment: string;
    size: string;
    location: string;
    fitScore: number;
    notes?: string;
}

interface ProspectorProps {
    onSaveLead: (prospect: Prospect) => void;
}

const loadingSteps = [
    "Consultando bases públicas (Receita Federal)...",
    "Cruzando dados com LinkedIn...",
    "Analisando fit com ICP da AtlasGR...",
    "Calculando Score de Propensão...",
    "Finalizando prospecção..."
];

export function Prospector({ onSaveLead }: ProspectorProps) {
    const [criteria, setCriteria] = useState<SearchCriteria>({
        segmento: 'Transportadora Rodoviária',
        localizacao: 'São Paulo e Região',
        tamanhoFrota: '50-150 veículos',
        faturamento: 'R$ 10M - R$ 50M',
        dorPrincipal: 'Gestão de Exceções e Sinistros',
        tecnologiaAtual: 'TMS Genérico'
    });

    const [isSearching, setIsSearching] = useState(false);
    const [loadingStepIdx, setLoadingStepIdx] = useState(0);
    const [results, setResults] = useState<Prospect[]>([]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isSearching) {
            interval = setInterval(() => {
                setLoadingStepIdx(prev => Math.min(prev + 1, loadingSteps.length - 1));
            }, 800);
        }
        return () => clearInterval(interval);
    }, [isSearching]);

    const handleSearch = async () => {
        setIsSearching(true);
        setResults([]);
        
        try {
            const data = await api.post<Prospect[]>('/api/prospect', criteria);
            setResults(data);
        } catch (error) {
            console.error("Error fetching leads:", error);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const inputLabels: Record<keyof SearchCriteria, string> = {
        segmento: 'Nicho / Segmento',
        localizacao: 'Região de Atuação',
        tamanhoFrota: 'Tamanho da Frota',
        faturamento: 'Faturamento Presumido',
        dorPrincipal: 'Dor Principal (Gatilho)',
        tecnologiaAtual: 'Tecnologia Atual (Concorrente)'
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-4 bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col h-full max-h-[800px]">
                {/* Decorative element based on manual */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-atlas-orange opacity-5 transform rotate-45 translate-x-20 -translate-y-20"></div>
                
                <div className="flex items-center gap-2 mb-6 relative z-10">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-atlas-orange">
                        <Database size={18} />
                    </div>
                    <h2 className="font-black text-xl text-atlas-dark">Motor de Busca AI</h2>
                </div>
                
                <div className="space-y-4 relative z-10 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200">
                    {(Object.keys(criteria) as Array<keyof SearchCriteria>).map(key => (
                        <div key={key}>
                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-500">{inputLabels[key]}</label>
                            <input 
                                className="w-full p-3 bg-gray-50/50 rounded-xl border border-gray-200 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-atlas-dark" 
                                value={criteria[key]} 
                                placeholder={`Ex: ${criteria[key]}`}
                                onChange={e => setCriteria({...criteria, [key]: e.target.value})} 
                            />
                        </div>
                    ))}
                </div>
                
                <div className="pt-6 mt-2 relative z-10 border-t border-gray-100">
                    <button 
                        onClick={handleSearch} 
                        disabled={isSearching}
                        className="w-full bg-atlas-orange text-white py-4 rounded-xl font-bold hover:bg-[#E04B12] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-atlas-orange/20 relative overflow-hidden group"
                    >
                        {isSearching ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="animate-spin" size={20} />
                                <span>Buscando...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Cpu size={20} className="group-hover:scale-110 transition-transform" /> 
                                <span>Encontrar Leads Ideais</span>
                            </div>
                        )}
                    </button>
                </div>
            </div>

            <div className="xl:col-span-8 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-black text-2xl text-atlas-dark">Resultados Inteligentes</h2>
                    {results.length > 0 && (
                        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">{results.length} Leads Identificados</span>
                    )}
                </div>

                {isSearching ? (
                    <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center p-10 min-h-[400px]">
                        <div className="w-24 h-24 relative mb-8">
                            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-atlas-orange rounded-full border-t-transparent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center text-atlas-orange">
                                <Globe size={32} className="animate-pulse" />
                            </div>
                        </div>
                        <h3 className="font-black text-xl text-atlas-dark mb-4 text-center">Mapeando Mercado...</h3>
                        <div className="space-y-3 w-full max-w-sm">
                            {loadingSteps.map((step, idx) => (
                                <div key={idx} className={`flex items-center gap-3 text-sm font-medium ${idx === loadingStepIdx ? 'text-atlas-orange' : idx < loadingStepIdx ? 'text-gray-400' : 'text-gray-200 opacity-50'}`}>
                                    {idx < loadingStepIdx ? <CheckCircle2 size={16} /> : idx === loadingStepIdx ? <Loader2 size={16} className="animate-spin" /> : <div className="w-4 h-4 rounded-full border-2 border-current"></div>}
                                    {step}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : results.length > 0 ? (
                    <div className="space-y-4">
                        {results.map((r, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center hover:border-atlas-orange/40 transition-all shadow-sm group animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}>
                                <div className="mb-4 sm:mb-0 flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="font-black text-lg text-atlas-dark group-hover:text-atlas-orange transition-colors">{r.name}</h3>
                                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.fitScore >= 90 ? 'bg-green-100 text-green-700' : r.fitScore >= 80 ? 'bg-blue-100 text-blue-700' : 'bg-atlas-yellow/20 text-atlas-dark'}`}>
                                            <TrendingUp size={10} />
                                            Fit {r.fitScore}%
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-500">
                                        <span className="flex items-center gap-1.5"><Building2 size={14} className="text-gray-400"/> {r.segment}</span>
                                        <span className="flex items-center gap-1.5"><Users size={14} className="text-gray-400"/> {r.size}</span>
                                        <span className="flex items-center gap-1.5"><MapPin size={14} className="text-gray-400"/> {r.location}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => onSaveLead(r)}
                                    className="bg-gray-50 text-atlas-dark px-6 py-2.5 rounded-full font-bold text-sm hover:bg-atlas-orange hover:text-white transition-colors flex items-center gap-2 border border-gray-200 hover:border-atlas-orange w-full sm:w-auto justify-center shrink-0"
                                >
                                    <Save size={16}/> Mover p/ CRM
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex-1 bg-white rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center p-10 min-h-[400px]">
                        <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                            <Search className="text-gray-300" size={32} />
                        </div>
                        <h3 className="font-black text-xl text-atlas-dark mb-2">Nenhum lead encontrado</h3>
                        <p className="text-sm text-gray-500 text-center max-w-sm">
                            Preencha os critérios de Perfil de Cliente Ideal (ICP) ao lado e deixe o motor de IA da AtlasGR buscar as melhores oportunidades de mercado.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
