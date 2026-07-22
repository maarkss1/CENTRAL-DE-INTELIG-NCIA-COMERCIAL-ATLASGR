import { useEffect, useState } from 'react';
import {
    Target, AlertCircle, RefreshCw, Copy, CheckCircle2, Mail, UserCheck, ShieldAlert, Phone,
    MessageCircle, Linkedin, PhoneMissed, Calculator, Search, X, Building2, User, Swords,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Lead } from '../types';
import { PIC_OPTIONS } from '../features/prospecting/constants/icp-options';
import { AIPendingActions } from '../features/intelligence/components/AIPendingActions';

type ToolType =
    | 'script_call' | 'script_whatsapp' | 'script_email' | 'prompt' | 'objections' | 'followup'
    | 'profile' | 'risk' | 'linkedin_invite' | 'voicemail' | 'roi_pitch' | 'competitor_battlecard' | null;

const TOOLS = [
    { id: 'script_call', icon: Phone, title: 'Script de Ligação', desc: 'Cold call com abertura, diagnóstico, contorno e fechamento.' },
    { id: 'script_whatsapp', icon: MessageCircle, title: 'Mensagem (WhatsApp/LinkedIn)', desc: 'Duas variações prontas de Social Selling.' },
    { id: 'script_email', icon: Mail, title: 'Template de E-mail', desc: 'Cold e-mail com 2 opções de assunto testável.' },
    { id: 'prompt', icon: Target, title: 'Prompts de Qualificação', desc: 'Perguntas BANT/SPIN com o que cada resposta revela.' },
    { id: 'objections', icon: AlertCircle, title: 'Matriz de Objeções', desc: 'As 3 objeções mais prováveis deste lead e como contornar.' },
    { id: 'followup', icon: Mail, title: 'E-mail de Follow-up', desc: 'Pós-reunião, focado em próximo passo com data.' },
    { id: 'profile', icon: UserCheck, title: 'Análise de Perfil (DiSC)', desc: 'Como abordar o decisor deste lead especificamente.' },
    { id: 'risk', icon: ShieldAlert, title: 'Diagnóstico de Risco', desc: 'Riscos reais de perder esta negociação e como mitigar.' },
    { id: 'linkedin_invite', icon: Linkedin, title: 'Convite LinkedIn', desc: 'Convite + mensagem de follow-up pós-aceite.' },
    { id: 'voicemail', icon: PhoneMissed, title: 'Script de Caixa Postal', desc: 'Recado de 20-30s para quando o decisor não atende.' },
    { id: 'roi_pitch', icon: Calculator, title: 'Pitch de Números (ROI)', desc: 'Gancho consultivo com impacto financeiro estimado.' },
    { id: 'competitor_battlecard', icon: Swords, title: 'Contorno de Concorrente', desc: 'Gancho de abordagem real contra os concorrentes da Atlas.' },
] as const;

const ATLAS_COMPETITORS = ['RasterGR', 'Buonny', 'BRK Tecnologia', 'OpentechGR', 'Apisul', 'Servis'];

export function Intelligence() {
    const [activeTool, setActiveTool] = useState<ToolType>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [leads, setLeads] = useState<Lead[]>([]);
    const [leadsLoading, setLeadsLoading] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [leadQuery, setLeadQuery] = useState('');
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [competitorPickerOpen, setCompetitorPickerOpen] = useState(false);
    const [competitor, setCompetitor] = useState('');
    const [customCompetitor, setCustomCompetitor] = useState('');

    useEffect(() => {
        setLeadsLoading(true);
        api.get<{ data: Lead[] }>('/api/leads?limit=100')
            .then((res) => setLeads(res.data))
            .catch((e) => console.error('Error loading leads:', e))
            .finally(() => setLeadsLoading(false));
    }, []);

    const handleSetPic = async (pic: string) => {
        if (!selectedLead) return;
        const nextPic = selectedLead.pic === pic ? null : pic;
        try {
            const updated = await api.put<Lead>(`/api/leads/${selectedLead.id}`, { pic: nextPic });
            setSelectedLead(updated);
            setLeads((prev) => prev.map((l) => (l.id === selectedLead.id ? { ...l, pic: nextPic as Lead['pic'] } : l)));
        } catch (e) {
            console.error('Error setting PIC:', e);
        }
    };

    const filteredLeads = leads.filter((l) => {
        const q = leadQuery.trim().toLowerCase();
        if (!q) return true;
        return (
            l.company?.tradeName?.toLowerCase().includes(q) ||
            l.contact?.name?.toLowerCase().includes(q) ||
            l.company?.segment?.toLowerCase().includes(q)
        );
    });

    const handleGenerate = async (tool: ToolType, competitorOverride?: string) => {
        if (tool === 'competitor_battlecard' && !competitorOverride) {
            setCompetitorPickerOpen(true);
            setActiveTool(tool);
            return;
        }

        setActiveTool(tool);
        setIsGenerating(true);
        setResult(null);
        setCopied(false);
        setCompetitorPickerOpen(false);

        try {
            const response = await fetch('/api/intelligence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool, leadId: selectedLead?.id, competitor: competitorOverride }),
            });

            if (response.ok) {
                const data = await response.json();
                setResult(data.result);
            } else {
                const err = await response.json().catch(() => null);
                setResult(err?.error ? `Erro ao gerar conteúdo: ${err.error}` : 'Erro ao gerar conteúdo. Tente novamente.');
            }
        } catch (error) {
            console.error('Error generating intelligence:', error);
            setResult('Erro ao conectar com a IA.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = () => {
        if (result) {
            navigator.clipboard.writeText(result);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="space-y-8">
            <AIPendingActions />
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-gray-200 pt-8">
                <div className="lg:col-span-4 flex flex-col h-full">
                <div>
                    <h2 className="font-black text-2xl text-atlas-dark mb-2">Atlas Intelligence</h2>
                    <p className="text-gray-500 text-sm mb-4">Ferramentas de IA para potencializar suas abordagens — personalizadas com os dados reais do lead.</p>
                </div>

                {/* Seletor de lead — sem isso, o conteúdo gerado fica genérico */}
                <div className="mb-5">
                    {selectedLead ? (
                        <div className="p-3 rounded-xl border-2 border-atlas-orange bg-orange-50/50 flex items-start gap-3">
                            <div className="shrink-0 w-9 h-9 rounded-lg bg-atlas-orange text-white flex items-center justify-center">
                                <Building2 size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-black text-sm text-atlas-dark truncate">{selectedLead.company?.tradeName || 'Empresa sem nome'}</p>
                                {selectedLead.contact?.name && (
                                    <p className="text-xs text-gray-500 truncate flex items-center gap-1"><User size={11} /> {selectedLead.contact.name}{selectedLead.contact.role ? ` · ${selectedLead.contact.role}` : ''}</p>
                                )}
                                {selectedLead.temperature && (
                                    <span className="inline-block mt-1 mr-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white border border-atlas-orange/30 text-atlas-orange">{selectedLead.temperature}</span>
                                )}
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {PIC_OPTIONS.map((pic) => (
                                        <button
                                            key={pic.value}
                                            type="button"
                                            title={pic.desc}
                                            onClick={() => handleSetPic(pic.value)}
                                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border transition-colors ${selectedLead.pic === pic.value ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-300'}`}
                                        >
                                            {pic.label.replace('PIC ', 'PIC')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setPickerOpen(true)} className="text-xs font-bold text-gray-500 hover:text-atlas-orange shrink-0">Trocar</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setPickerOpen(true)}
                            className="w-full p-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-atlas-orange/50 text-sm font-bold text-gray-500 hover:text-atlas-orange transition-colors flex items-center justify-center gap-2"
                        >
                            <Search size={14} /> Selecionar um lead (recomendado)
                        </button>
                    )}
                    {!selectedLead && (
                        <p className="text-[11px] text-gray-400 mt-1.5 px-1">Sem lead selecionado, o conteúdo gerado será genérico — vinculando a um lead real, a IA usa segmento, cidade, decisor e dados de enriquecimento para personalizar.</p>
                    )}
                </div>

                {pickerOpen && (
                    <div className="mb-5 p-3 border border-gray-200 rounded-xl bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] tracking-wider font-bold uppercase text-gray-500">Buscar lead</span>
                            <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        </div>
                        <div className="relative mb-2">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Empresa, contato ou segmento..."
                                value={leadQuery}
                                onChange={(e) => setLeadQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 bg-gray-50/50 border border-gray-200 rounded-lg text-xs outline-none focus:border-atlas-orange"
                            />
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-1">
                            {leadsLoading && <p className="text-xs text-gray-400 text-center py-3">Carregando leads...</p>}
                            {!leadsLoading && filteredLeads.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-3">Nenhum lead encontrado — prospecte e promova leads primeiro.</p>
                            )}
                            {filteredLeads.map((l) => (
                                <button
                                    key={l.id}
                                    onClick={() => { setSelectedLead(l); setPickerOpen(false); setLeadQuery(''); }}
                                    className="w-full text-left p-2 rounded-lg hover:bg-orange-50/60 flex items-center gap-2 text-xs"
                                >
                                    <Building2 size={13} className="text-gray-400 shrink-0" />
                                    <span className="font-bold text-atlas-dark truncate">{l.company?.tradeName || 'Sem empresa'}</span>
                                    {l.contact?.name && <span className="text-gray-400 truncate">· {l.contact.name}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {competitorPickerOpen && (
                    <div className="mb-5 p-3 border border-gray-200 rounded-xl bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] tracking-wider font-bold uppercase text-gray-500">Qual concorrente?</span>
                            <button onClick={() => { setCompetitorPickerOpen(false); setActiveTool(null); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {ATLAS_COMPETITORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => { setCompetitor(c); handleGenerate('competitor_battlecard', c); }}
                                    className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-gray-200 bg-gray-50 text-gray-700 hover:border-atlas-orange/40 hover:bg-orange-50"
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Outro concorrente..."
                                value={customCompetitor}
                                onChange={(e) => setCustomCompetitor(e.target.value)}
                                className="flex-1 p-2 bg-gray-50/50 border border-gray-200 rounded-lg text-xs outline-none focus:border-atlas-orange"
                            />
                            <button
                                onClick={() => customCompetitor.trim() && handleGenerate('competitor_battlecard', customCompetitor.trim())}
                                disabled={!customCompetitor.trim()}
                                className="px-3 py-2 bg-atlas-dark text-white rounded-lg text-xs font-bold disabled:opacity-40"
                            >
                                Usar
                            </button>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 overflow-y-auto pr-2 pb-4 max-h-[600px] scrollbar-thin scrollbar-thumb-gray-200">
                    {TOOLS.map(tool => (
                        <div
                            key={tool.id}
                            onClick={() => handleGenerate(tool.id as ToolType)}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all group flex items-start gap-4 ${activeTool === tool.id ? 'border-atlas-orange bg-orange-50/50 shadow-sm' : 'border-gray-100 bg-white hover:border-atlas-orange/30'}`}
                        >
                            <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${activeTool === tool.id ? 'bg-atlas-orange text-white' : 'bg-gray-50 text-atlas-orange group-hover:bg-orange-50'}`}>
                                <tool.icon size={22} />
                            </div>
                            <div>
                                <h3 className="font-black text-base text-atlas-dark mb-1 leading-tight group-hover:text-atlas-orange transition-colors">{tool.title}</h3>
                                <p className="text-xs text-gray-500 mb-2 leading-relaxed">{tool.desc}</p>
                                <span className={`font-bold text-[10px] uppercase tracking-wider ${activeTool === tool.id ? 'text-atlas-orange' : 'text-gray-400 group-hover:text-atlas-orange'}`}>
                                    Usar ferramenta →
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="lg:col-span-8">
                <div className="bg-white border border-gray-200 rounded-2xl h-full min-h-[500px] flex flex-col overflow-hidden shadow-sm sticky top-24">
                    {/* Header bar */}
                    <div className="bg-atlas-dark p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white">
                            <div className="w-2.5 h-2.5 rounded-full bg-atlas-orange animate-pulse"></div>
                            <span className="font-bold text-sm tracking-widest uppercase">Output de Inteligência</span>
                        </div>
                        {activeTool === 'competitor_battlecard' && competitor ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">vs. {competitor}</span>
                        ) : selectedLead && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">{selectedLead.company?.tradeName}</span>
                        )}
                    </div>

                    <div className="p-8 flex-1 flex flex-col bg-gray-50/30">
                        {!activeTool && !isGenerating && !result && (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                                    <Target size={40} className="text-gray-300" />
                                </div>
                                <h3 className="font-black text-xl text-atlas-dark mb-2">Pronto para gerar</h3>
                                <p className="font-medium text-sm text-center max-w-xs">Selecione uma ferramenta ao lado para a IA analisar o contexto e gerar o conteúdo.</p>
                            </div>
                        )}

                        {isGenerating && (
                            <div className="flex-1 flex flex-col items-center justify-center text-atlas-orange">
                                <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mb-6 relative">
                                    <div className="absolute inset-0 border-4 border-atlas-orange border-t-transparent rounded-full animate-spin"></div>
                                    <RefreshCw size={24} className="text-atlas-orange animate-pulse" />
                                </div>
                                <h3 className="font-black text-lg text-atlas-dark mb-1">Processando</h3>
                                <p className="font-bold animate-pulse text-sm uppercase tracking-wider text-gray-500">Atlas IA analisando dados...</p>
                            </div>
                        )}

                        {result && !isGenerating && (
                            <div className="flex-1 flex flex-col h-full animate-in fade-in zoom-in-95 duration-300">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                        Resultado Gerado
                                    </div>
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-atlas-dark transition-colors bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm"
                                    >
                                        {copied ? <CheckCircle2 size={16} className="text-green-500"/> : <Copy size={16}/>}
                                        {copied ? 'COPIADO' : 'COPIAR TEXTO'}
                                    </button>
                                </div>
                                <div className="flex-1 bg-white p-6 rounded-xl border border-gray-100 shadow-inner whitespace-pre-wrap font-medium text-gray-700 leading-relaxed overflow-y-auto">
                                    {result}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        </div>
    );
}
