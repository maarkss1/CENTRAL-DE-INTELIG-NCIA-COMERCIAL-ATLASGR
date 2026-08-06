import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
    Target, AlertCircle, RefreshCw, Copy, CheckCircle2, Mail, UserCheck, ShieldAlert, Phone,
    MessageCircle, Linkedin, PhoneMissed, Calculator, Search, X, Building2, User, Swords,
    Sparkles, Zap, ChevronDown, Check, Bot, Activity, BrainCircuit, Fingerprint
} from 'lucide-react';
import { api } from '../lib/api';
import type { Lead } from '../types';
import { PIC_OPTIONS } from '../shared/constants/icp-options';
import { AIPendingActions } from '../features/intelligence/components/AIPendingActions';
import { useBrandAccent } from '../hooks/useBrandAccent';
import { useBrand } from '../contexts/BrandContext';
import { clientLogger } from '../lib/clientLogger';

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
    { id: 'competitor_battlecard', icon: Swords, title: 'Contorno de Concorrente', desc: 'Gancho de abordagem real contra concorrentes.' },
] as const;

const ATLAS_COMPETITORS = ['RasterGR', 'Buonny', 'BRK Tecnologia', 'OpentechGR', 'Apisul', 'Servis'];
const TONES = ['Consultivo', 'Provocativo', 'Relacional', 'Técnico'];
const OBJECTIVES = ['Descoberta', 'Follow-up', 'Fechamento'];
const ATLAS_PERSONAS = ['Dono / CEO', 'Diretor de Logística / Supply', 'Head / Gerente de GR (Risco)', 'TI / Compras'];
const TOTALTRAC_PERSONAS = ['Dono / CEO', 'Gestor de Frota', 'Diretor de Operações / Logística', 'Segurança / SSMA', 'TI / Compras'];

export function Intelligence() {
    const accent = useBrandAccent();
    const { activeBrand } = useBrand();
    const suggestedCompetitors = activeBrand === 'atlasgr' ? ATLAS_COMPETITORS : [];
    const personas = activeBrand === 'atlasgr' ? ATLAS_PERSONAS : TOTALTRAC_PERSONAS;
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

    const [tone, setTone] = useState('Consultivo');
    const [objective, setObjective] = useState('Descoberta');
    const [personaFallback, setPersonaFallback] = useState('Dono / CEO');

    // UI States for custom dropdowns
    const [activeDropdown, setActiveDropdown] = useState<'tone' | 'objective' | 'persona' | null>(null);

    const resultRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLeadsLoading(true);
        api.get<{ data: Lead[] }>('/api/leads?limit=100')
            .then((res) => setLeads(res.data))
            .catch((e) => clientLogger.error({ err: e }, 'Error loading leads'))
            .finally(() => setLeadsLoading(false));
    }, []);

    useEffect(() => {
        setPersonaFallback('Dono / CEO');
        setCompetitor('');
        setCustomCompetitor('');
    }, [activeBrand]);

    useEffect(() => {
        if (result && resultRef.current) {
            resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [result]);

    const handleSetPic = async (pic: string) => {
        if (!selectedLead) return;
        const nextPic = selectedLead.pic === pic ? null : pic;
        try {
            const updated = await api.put<Lead>(`/api/leads/${selectedLead.id}`, { pic: nextPic });
            setSelectedLead(updated);
            setLeads((prev) => prev.map((l) => (l.id === selectedLead.id ? { ...l, pic: nextPic as Lead['pic'] } : l)));
        } catch (e) {
            clientLogger.error({ err: e }, 'Error setting PIC');
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
            const response = await api.post<{ result: string }>('/api/intelligence', {
                tool,
                leadId: selectedLead?.id,
                competitor: competitorOverride,
                tone,
                objective,
                personaFallback: !selectedLead ? personaFallback : undefined,
                brandId: activeBrand,
            }, { timeoutMs: 90_000 });
            setResult(response.result);
        } catch (error) {
            clientLogger.error({ err: error }, 'Error generating intelligence');
            setResult(error instanceof Error ? `Não foi possível gerar o conteúdo: ${error.message}` : 'Não foi possível gerar o conteúdo.');
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

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
    };

    return (
        <div className="space-y-8 bg-transparent min-h-screen p-4 lg:p-8 rounded-3xl">
            <AIPendingActions />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 border-t border-line/60 pt-8">
                {/* ESQUERDA: CONFIGURAÇÕES E FERRAMENTAS */}
                <div className="xl:col-span-5 flex flex-col h-full space-y-6">
                    <div>
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-atlas-orange/10 border border-atlas-orange/20 text-atlas-orange mb-3"
                        >
                            <Sparkles className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Premium AI Suite</span>
                        </motion.div>
                        <h2 className="font-black text-4xl text-ink tracking-tight mb-2">{accent.brandName} <span className={`text-transparent bg-clip-text bg-gradient-to-r ${accent.gradient}`}>Outreach Intelligence</span></h2>
                        <p className="text-ink-2 text-sm leading-relaxed max-w-md">O arsenal definitivo de IA Generativa. Ferramentas ultra-personalizadas alimentadas por algoritmos preditivos e dados em tempo real.</p>
                    </div>

                    {/* SELETOR DE LEAD PREMIUM */}
                    <div className="relative">
                        {selectedLead ? (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-4 rounded-2xl border border-atlas-orange/30 bg-gradient-to-br from-surface to-orange-50/30 shadow-[0_8px_30px_rgb(234,88,12,0.12)] relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-atlas-orange/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-atlas-orange to-orange-600 text-white flex items-center justify-center shadow-inner relative">
                                        <Building2 size={20} />
                                        <div className="absolute inset-0 rounded-xl border border-white/20"></div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-black text-lg text-ink truncate tracking-tight">{selectedLead.company?.tradeName || 'Empresa Desconhecida'}</p>
                                        {selectedLead.contact?.name && (
                                            <p className="text-xs text-ink-2 truncate flex items-center gap-1.5 mt-0.5">
                                                <User size={12} className="text-ink-2" />
                                                <span className="font-medium">{selectedLead.contact.name}</span>
                                                {selectedLead.contact.role && <span className="text-ink-2">|</span>}
                                                {selectedLead.contact.role && <span>{selectedLead.contact.role}</span>}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-1.5 mt-3">
                                            {selectedLead.temperature && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-surface border border-line text-ink-2 shadow-sm">
                                                    <Activity size={10} className={selectedLead.temperature === 'Quente' ? 'text-red-500' : selectedLead.temperature === 'Morno' ? 'text-amber-500' : 'text-blue-500'} />
                                                    {selectedLead.temperature}
                                                </span>
                                            )}
                                            {PIC_OPTIONS.map((pic) => (
                                                <button
                                                    key={pic.value}
                                                    type="button"
                                                    title={pic.desc}
                                                    onClick={() => handleSetPic(pic.value)}
                                                    className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md border transition-all ${selectedLead.pic === pic.value ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-surface border-line text-ink-2 hover:border-indigo-300 hover:text-indigo-500'}`}
                                                >
                                                    {pic.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setPickerOpen(true)} 
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-atlas-orange hover:text-white transition-colors shrink-0"
                                        title="Trocar Lead"
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <button
                                onClick={() => setPickerOpen(true)}
                                className="w-full p-5 rounded-2xl border-2 border-dashed border-line hover:border-atlas-orange/60 hover:bg-orange-50/50 text-ink-2 hover:text-atlas-orange transition-all flex flex-col items-center justify-center gap-3 group"
                            >
                                <div className="w-10 h-10 rounded-full bg-surface-2 group-hover:bg-orange-100 flex items-center justify-center transition-colors">
                                    <Search size={18} className="text-ink-2 group-hover:text-atlas-orange" />
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-sm text-ink-2 group-hover:text-atlas-orange">Vincular Lead Alvo (Recomendado)</p>
                                    <p className="text-[11px] text-ink-2 mt-1 max-w-xs mx-auto">Para hiper-personalização, a IA analisará segmento, porte e stack tecnológico do lead.</p>
                                </div>
                            </button>
                        )}
                    </div>

                    {/* MODAL DE SELEÇÃO DE LEAD */}
                    <AnimatePresence>
                        {pickerOpen && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute z-50 left-0 right-0 mt-2 p-4 border border-line/60 rounded-2xl bg-surface/80 backdrop-blur-xl shadow-2xl"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] tracking-widest font-bold uppercase text-ink-2 flex items-center gap-1">
                                        <Fingerprint size={12} /> Selecionar Alvo
                                    </span>
                                    <button onClick={() => setPickerOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface-2 text-ink-2"><X size={14} /></button>
                                </div>
                                <div className="relative mb-3">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Pesquisar por empresa ou contato..."
                                        value={leadQuery}
                                        onChange={(e) => setLeadQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-surface-2 border border-line/80 rounded-xl text-sm font-medium outline-none focus:border-atlas-orange focus:ring-4 focus:ring-atlas-orange/10 transition-all"
                                    />
                                </div>
                                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                                    {leadsLoading && <p className="text-xs font-medium text-ink-2 text-center py-4">Buscando banco de dados...</p>}
                                    {!leadsLoading && filteredLeads.length === 0 && (
                                        <p className="text-xs font-medium text-ink-2 text-center py-4">Nenhum alvo detectado.</p>
                                    )}
                                    {filteredLeads.map((l) => (
                                        <button
                                            key={l.id}
                                            onClick={() => { setSelectedLead(l); setPickerOpen(false); setLeadQuery(''); }}
                                            className="w-full text-left p-3 rounded-xl hover:bg-orange-50 flex items-center gap-3 transition-colors group border border-transparent hover:border-atlas-orange/20"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-surface-2 group-hover:bg-surface flex items-center justify-center shrink-0">
                                                <Building2 size={14} className="text-ink-2 group-hover:text-atlas-orange" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm text-ink truncate group-hover:text-atlas-orange">{l.company?.tradeName || 'Sem empresa'}</p>
                                                {l.contact?.name && <p className="text-[11px] text-ink-2 truncate">{l.contact.name}</p>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* PARÂMETROS DE NEURO-GERAÇÃO (Custom Dropdowns) */}
                    <div className="bg-surface p-5 rounded-2xl border border-line/60 shadow-sm relative z-40">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-ink-2 mb-4 flex items-center gap-1.5">
                            <BrainCircuit size={14} className="text-atlas-orange" /> Parâmetros Neurais
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Dropdown Tom de Voz */}
                            <div className="relative">
                                <label className="block text-[10px] font-bold uppercase text-ink-2 mb-1.5">Matriz de Tom</label>
                                <button
                                    onClick={() => setActiveDropdown(activeDropdown === 'tone' ? null : 'tone')}
                                    className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-xl text-xs font-bold text-ink-2 flex items-center justify-between hover:border-line focus:outline-none"
                                >
                                    {tone} <ChevronDown size={14} className="text-ink-2" />
                                </button>
                                <AnimatePresence>
                                    {activeDropdown === 'tone' && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                            className="absolute left-0 right-0 mt-1 bg-surface border border-line shadow-xl rounded-xl z-50 overflow-hidden"
                                        >
                                            {TONES.map(t => (
                                                <div
                                                    key={t} onClick={() => { setTone(t); setActiveDropdown(null); }}
                                                    className="px-4 py-2.5 text-xs font-medium text-ink-2 hover:bg-orange-50 hover:text-atlas-orange cursor-pointer flex justify-between items-center"
                                                >
                                                    {t} {tone === t && <Check size={14} className="text-atlas-orange" />}
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Dropdown Objetivo */}
                            <div className="relative">
                                <label className="block text-[10px] font-bold uppercase text-ink-2 mb-1.5">Vetor de Objetivo</label>
                                <button
                                    onClick={() => setActiveDropdown(activeDropdown === 'objective' ? null : 'objective')}
                                    className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-xl text-xs font-bold text-ink-2 flex items-center justify-between hover:border-line focus:outline-none"
                                >
                                    {objective} <ChevronDown size={14} className="text-ink-2" />
                                </button>
                                <AnimatePresence>
                                    {activeDropdown === 'objective' && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                            className="absolute left-0 right-0 mt-1 bg-surface border border-line shadow-xl rounded-xl z-50 overflow-hidden"
                                        >
                                            {OBJECTIVES.map(o => (
                                                <div
                                                    key={o} onClick={() => { setObjective(o); setActiveDropdown(null); }}
                                                    className="px-4 py-2.5 text-xs font-medium text-ink-2 hover:bg-orange-50 hover:text-atlas-orange cursor-pointer flex justify-between items-center"
                                                >
                                                    {o} {objective === o && <Check size={14} className="text-atlas-orange" />}
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Dropdown Persona (Fallback) */}
                            {!selectedLead && (
                                <div className="relative sm:col-span-2">
                                    <label className="block text-[10px] font-bold uppercase text-ink-2 mb-1.5">Persona Simulada</label>
                                    <button
                                        onClick={() => setActiveDropdown(activeDropdown === 'persona' ? null : 'persona')}
                                        className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-xl text-xs font-bold text-ink-2 flex items-center justify-between hover:border-line focus:outline-none"
                                    >
                                        {personaFallback} <ChevronDown size={14} className="text-ink-2" />
                                    </button>
                                    <AnimatePresence>
                                        {activeDropdown === 'persona' && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                                className="absolute left-0 right-0 mt-1 bg-surface border border-line shadow-xl rounded-xl z-50 overflow-hidden"
                                            >
                                                {personas.map(p => (
                                                    <div
                                                        key={p} onClick={() => { setPersonaFallback(p); setActiveDropdown(null); }}
                                                        className="px-4 py-2.5 text-xs font-medium text-ink-2 hover:bg-orange-50 hover:text-atlas-orange cursor-pointer flex justify-between items-center"
                                                    >
                                                        {p} {personaFallback === p && <Check size={14} className="text-atlas-orange" />}
                                                    </div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* MODAL COMPETIDOR (OVERLAY) */}
                    <AnimatePresence>
                        {competitorPickerOpen && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute z-50 inset-x-0 mt-4 p-5 border border-atlas-orange/30 rounded-2xl bg-surface/90 backdrop-blur-2xl shadow-2xl shadow-atlas-orange/10"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] tracking-widest font-black uppercase text-atlas-orange flex items-center gap-1.5">
                                        <Swords size={14} /> {suggestedCompetitors.length ? 'Selecione o Concorrente' : 'Informe o Concorrente'}
                                    </span>
                                    <button onClick={() => { setCompetitorPickerOpen(false); setActiveTool(null); }} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface-2 text-ink-2"><X size={14} /></button>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {suggestedCompetitors.map((c) => (
                                        <button
                                            key={c}
                                            onClick={() => { setCompetitor(c); handleGenerate('competitor_battlecard', c); }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-line bg-surface text-ink-2 hover:border-atlas-orange hover:bg-atlas-orange hover:text-white transition-all shadow-sm"
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Ou digite o nome de outro concorrente..."
                                        value={customCompetitor}
                                        onChange={(e) => setCustomCompetitor(e.target.value)}
                                        className="flex-1 p-2.5 bg-surface-2 border border-line rounded-xl text-xs font-medium outline-none focus:border-atlas-orange focus:ring-4 focus:ring-atlas-orange/10 transition-all"
                                    />
                                    <button
                                        onClick={() => customCompetitor.trim() && handleGenerate('competitor_battlecard', customCompetitor.trim())}
                                        disabled={!customCompetitor.trim()}
                                        className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold disabled:opacity-40 transition-colors shadow-md"
                                    >
                                        Gerar Battlecard
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* GRID DE FERRAMENTAS */}
                    <div className="flex-1 overflow-hidden relative">
                        <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-bg/30 to-transparent z-10 pointer-events-none"></div>
                        <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-bg/30 to-transparent z-10 pointer-events-none"></div>
                        <motion.div 
                            variants={containerVariants}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 overflow-y-auto pr-2 pb-4 max-h-[600px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                        >
                            {TOOLS.map(tool => (
                                <motion.div
                                    variants={itemVariants}
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    key={tool.id}
                                    onClick={() => handleGenerate(tool.id as ToolType)}
                                    className={`p-4 rounded-2xl border cursor-pointer transition-all duration-300 group flex flex-col justify-between h-[140px] relative overflow-hidden
                                        ${activeTool === tool.id
                                            ? 'border-atlas-orange bg-gradient-to-br from-orange-50 to-surface shadow-lg shadow-atlas-orange/20 ring-1 ring-atlas-orange/50'
                                            : 'border-line/60 bg-surface hover:border-atlas-orange/40 hover:shadow-xl hover:shadow-gray-200/50'
                                        }`}
                                >
                                    {/* Efeito Glow Interno */}
                                    {activeTool === tool.id && (
                                        <div className="absolute inset-0 bg-gradient-to-br from-atlas-orange/5 to-transparent pointer-events-none"></div>
                                    )}
                                    
                                    <div className="flex items-start justify-between relative z-10">
                                        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors
                                            ${activeTool === tool.id 
                                                ? 'bg-gradient-to-br from-atlas-orange to-orange-500 text-white shadow-md' 
                                                : 'bg-surface-2 border border-line text-ink-2 group-hover:bg-orange-50 group-hover:text-atlas-orange group-hover:border-orange-100'
                                            }`}
                                        >
                                            <tool.icon size={18} />
                                        </div>
                                        {activeTool === tool.id && (
                                            <span className="w-2 h-2 rounded-full bg-atlas-orange animate-ping absolute right-1 top-1"></span>
                                        )}
                                    </div>
                                    
                                    <div className="relative z-10 mt-3">
                                        <h3 className={`font-black text-sm mb-1 leading-tight transition-colors line-clamp-1
                                            ${activeTool === tool.id ? 'text-atlas-orange' : 'text-ink group-hover:text-atlas-orange'}`}
                                        >
                                            {tool.title}
                                        </h3>
                                        <p className="text-[10px] text-ink-2 leading-snug line-clamp-2">{tool.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </div>

                {/* DIREITA: ÁREA DE OUTPUT / DISPLAY HOLOGRÁFICO */}
                <div className="xl:col-span-7 flex flex-col" ref={resultRef}>
                    <div className="bg-gray-900 rounded-[32px] h-full min-h-[700px] flex flex-col overflow-hidden shadow-2xl relative ring-1 ring-white/10 sticky top-24">
                        {/* BACKGROUND GLOW */}
                        <div className="absolute -top-40 -right-40 w-96 h-96 bg-atlas-orange/20 rounded-full blur-[100px] pointer-events-none"></div>
                        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>

                        {/* Top Bar MacOS Style */}
                        <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-black/20 backdrop-blur-md relative z-20">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                                <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                            </div>
                            <div className="flex items-center gap-3">
                                {isGenerating && <span className="text-[9px] font-bold uppercase tracking-widest text-atlas-orange animate-pulse">Sintetizando...</span>}
                                <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 flex items-center gap-2">
                                    <Bot size={12} className="text-gray-400" />
                                    <span className="text-[10px] font-bold tracking-widest text-gray-300 uppercase">{accent.brandName} Engine v2.0</span>
                                </div>
                            </div>
                        </div>

                        {/* Área de Conteúdo */}
                        <div className="flex-1 flex flex-col p-8 relative z-10">
                            {!activeTool && !isGenerating && !result && (
                                <div className="flex-1 flex flex-col items-center justify-center text-center">
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                        className="relative"
                                    >
                                        <div className="absolute inset-0 bg-atlas-orange/20 blur-2xl rounded-full"></div>
                                        <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 relative z-10 backdrop-blur-sm shadow-2xl">
                                            <BrainCircuit size={40} className="text-gray-400" />
                                        </div>
                                    </motion.div>
                                    <h3 className="font-black text-3xl text-white mb-3 tracking-tight">Sistema em Standby</h3>
                                    <p className="font-medium text-sm text-gray-400 max-w-sm leading-relaxed">
                                        O motor neural está aguardando. Selecione uma ferramenta tática no painel à esquerda para iniciar a síntese.
                                    </p>
                                </div>
                            )}

                            {isGenerating && (
                                <div className="flex-1 flex flex-col items-center justify-center">
                                    <div className="relative flex items-center justify-center w-32 h-32 mb-8">
                                        {/* Orbital Rings */}
                                        <motion.div 
                                            animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                            className="absolute inset-0 border-t-2 border-r-2 border-atlas-orange/50 rounded-full"
                                        ></motion.div>
                                        <motion.div 
                                            animate={{ rotate: -360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                            className="absolute inset-2 border-b-2 border-l-2 border-white/30 rounded-full"
                                        ></motion.div>
                                        <div className="absolute inset-4 bg-atlas-orange/10 rounded-full blur-md animate-pulse"></div>
                                        <Zap size={32} className="text-atlas-orange relative z-10 animate-pulse" />
                                    </div>
                                    <h3 className="font-black text-2xl text-white mb-2 tracking-tight">Gerando Inteligência</h3>
                                    <p className="font-bold text-xs uppercase tracking-[0.2em] text-atlas-orange">Processando algoritmos cognitivos...</p>
                                    
                                    {/* Progress Bar Fake */}
                                    <div className="w-48 h-1 bg-white/10 rounded-full mt-6 overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }} 
                                            animate={{ width: "100%" }} 
                                            transition={{ duration: 15 }} 
                                            className="h-full bg-atlas-orange"
                                        />
                                    </div>
                                </div>
                            )}

                            {result && !isGenerating && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex-1 flex flex-col h-full"
                                >
                                    <div className="flex justify-between items-end mb-6">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-atlas-orange mb-1 flex items-center gap-1.5">
                                                <CheckCircle2 size={12} /> Síntese Concluída
                                            </p>
                                            <h3 className="text-xl font-bold text-white">
                                                {activeTool === 'competitor_battlecard' && competitor ? `Battlecard: vs ${competitor}` : selectedLead ? `Output: ${selectedLead.company?.tradeName}` : 'Output Gerado'}
                                            </h3>
                                        </div>
                                        <button
                                            onClick={handleCopy}
                                            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all ${
                                                copied 
                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                                : 'bg-white/10 text-white hover:bg-white/20 border border-white/5'
                                            }`}
                                        >
                                            {copied ? <CheckCircle2 size={14}/> : <Copy size={14}/>}
                                            {copied ? 'COPIADO!' : 'COPIAR'}
                                        </button>
                                    </div>
                                    
                                    <div className="flex-1 bg-black/40 backdrop-blur-xl p-6 md:p-8 rounded-2xl border border-white/10 shadow-inner overflow-y-auto relative scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                                        {/* Decoration Corners */}
                                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-atlas-orange/50 rounded-tl-lg"></div>
                                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-atlas-orange/50 rounded-tr-lg"></div>
                                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-atlas-orange/50 rounded-bl-lg"></div>
                                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-atlas-orange/50 rounded-br-lg"></div>
                                        
                                        <motion.div 
                                            initial={{ opacity: 0 }} 
                                            animate={{ opacity: 1 }} 
                                            transition={{ delay: 0.2 }}
                                            className="whitespace-pre-wrap font-mono text-[13px] md:text-sm text-gray-300 leading-relaxed"
                                        >
                                            {result}
                                        </motion.div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
