import { useState, useEffect } from 'react';
import { Building2, LayoutTemplate, Search, Sparkles, ArrowRight, Zap, Bot, Star, Trophy, MessageSquare, Activity, Wrench } from 'lucide-react';
import { Lead, Activity as ActivityType, Company } from '../../../types';
import { api } from '../../../lib/api';
import type { TabType } from '../../../components/layout/Header';
import { motion } from 'framer-motion';
import { useBrand } from '../../../contexts/BrandContext';
import { FloatingChatbook } from '../../chatbook/components/FloatingChatbook';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';
import { TechToolLogo, TechToolInfo } from '../../../components/ui/TechToolLogo';
import { ToolTechPopover } from '../../../components/ui/ToolTechPopover';
import { ContextualTip } from '../../../components/ui/ContextualTip';
import { ClockCalendarWidget } from '../../../components/ui/ClockCalendarWidget';

// Inline Clock and Date matching the mockup exactly
function LiveDateTime() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);
    const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    return (
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 w-full pt-4 relative z-20">
            {/* DATA Pill */}
            <div className="bg-white/90 backdrop-blur-xl px-10 py-4 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-white/80 flex flex-col items-center justify-center min-w-[280px]">
                <span className="font-black text-gray-900 capitalize text-sm tracking-wide">{dateLabel}</span>
            </div>
            
            {/* XP / Nível Pill */}
            <div className="bg-white/90 backdrop-blur-xl px-8 py-4 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-white/80 flex items-center justify-center gap-5 min-w-[320px]">
                <div className="relative shrink-0">
                    <div className="w-11 h-11 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full flex items-center justify-center text-white font-black text-lg shadow-md">
                        12
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                        <span className="text-orange-500 text-xs">🔥</span>
                    </div>
                </div>
                <div className="flex-1 w-full">
                    <div className="flex justify-between items-center w-full mb-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">Especialista de Vendas</p>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div className="bg-gradient-to-r from-orange-500 to-amber-500 h-2.5 rounded-full" style={{ width: '75%' }}></div>
                    </div>
                    <div className="w-full flex justify-end mt-1">
                        <p className="text-[9px] font-extrabold text-orange-600">2.4k XP</p>
                    </div>
                </div>
            </div>

            {/* HORÁRIO Pill */}
            <div className="bg-white/90 backdrop-blur-xl px-10 py-4 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-white/80 flex flex-col items-center justify-center min-w-[220px]">
                <span className="font-black text-gray-900 text-3xl tracking-widest leading-none">{timeLabel}</span>
            </div>
        </div>
    );
}

interface DashboardProps {
    onNavigate: (tab: TabType) => void;
}

interface ToolConfig {
    tab: TabType;
    title: string;
    subtitle: string;
    desc: string;
    icon: any;
    xp: string;
    color: string;
    bg: string;
}

const BRAND_CONFIGS: Record<string, { name: string; slogan: string; color: string; tools: ToolConfig[] }> = {
    atlasgr: {
        name: 'AtlasGR',
        slogan: 'Inteligência & Aceleração Comercial B2B',
        color: 'orange-500',
        tools: [
            { 
                tab: 'crm', 
                title: 'AtlasGR Sales Cloud', 
                subtitle: 'INTELIGÊNCIA & ACELERAÇÃO COMERCIAL B2B',
                desc: 'Acompanhe negociações e controle o funil comercial estágio por estágio.', 
                icon: LayoutTemplate, 
                xp: '+150',
                color: 'text-blue-500', 
                bg: 'bg-blue-50' 
            },
            { 
                tab: 'companies', 
                title: 'AtlasGR Lead Engine', 
                subtitle: 'INTELIGÊNCIA & ACELERAÇÃO COMERCIAL B2B',
                desc: 'Gerencie sua carteira de clientes, histórico de contas e pessoas-chave com logos de ferramentas.', 
                icon: Building2, 
                xp: '+50',
                color: 'text-indigo-500', 
                bg: 'bg-indigo-50' 
            },
            { 
                tab: 'prospect', 
                title: 'AtlasGR Prospect', 
                subtitle: 'INTELIGÊNCIA & ACELERAÇÃO COMERCIAL B2B',
                desc: 'Descubra novas empresas via fontes abertas, com Apollo opcional.', 
                icon: Search, 
                xp: '+100',
                color: 'text-orange-500', 
                bg: 'bg-orange-50' 
            },
            { 
                tab: 'enrich', 
                title: 'AtlasGR Prospect AI', 
                subtitle: 'INTELIGÊNCIA & ACELERAÇÃO COMERCIAL B2B',
                desc: 'Rode o enriquecimento completo de CNPJ, telefones e e-mails de decisores.', 
                icon: Sparkles, 
                xp: '+200',
                color: 'text-purple-500', 
                bg: 'bg-purple-50' 
            },
            { 
                tab: 'intelligence', 
                title: 'AtlasGR Intelligence', 
                subtitle: 'INTELIGÊNCIA & ACELERAÇÃO COMERCIAL B2B',
                desc: 'IA autônoma para análise de risco, scoring e geração de scripts de vendas.', 
                icon: Zap, 
                xp: '+180',
                color: 'text-rose-500', 
                bg: 'bg-rose-50' 
            },
            { 
                tab: 'prompts', 
                title: 'AtlasGR Commercial OS', 
                subtitle: 'INTELIGÊNCIA & ACELERAÇÃO COMERCIAL B2B',
                desc: 'Configure as diretrizes e regras de tom de voz para a Inteligência Artificial.', 
                icon: Sparkles, 
                xp: '+195',
                color: 'text-fuchsia-500', 
                bg: 'bg-fuchsia-50' 
            },
            { 
                tab: 'activities', 
                title: 'AtlasGR Growth', 
                subtitle: 'INTELIGÊNCIA & ACELERAÇÃO COMERCIAL B2B',
                desc: 'Controle tarefas, follow-ups e métricas de desempenho diário.', 
                icon: Activity, 
                xp: '+150',
                color: 'text-emerald-500', 
                bg: 'bg-emerald-50' 
            },
            { 
                tab: 'chatbook', 
                title: 'AtlasGR Chatbook', 
                subtitle: 'INTELIGÊNCIA & ACELERAÇÃO COMERCIAL B2B',
                desc: 'Treinamento prático via Roleplay com IA, matriz de qualificação avançada e estratégias.', 
                icon: MessageSquare, 
                xp: '+1500',
                color: 'text-amber-500', 
                bg: 'bg-amber-50' 
            },
        ]
    },
    totaltrac: {
        name: 'TotalTrac',
        slogan: 'Conectar para Cuidar',
        color: 'sky-500',
        tools: [
            { 
                tab: 'crm', 
                title: 'TotalTrac Sales Cloud', 
                subtitle: 'CONECTAR PARA CUIDAR',
                desc: 'Acompanhe negociações e controle o funil comercial estágio por estágio.', 
                icon: LayoutTemplate, 
                xp: '+150',
                color: 'text-blue-500', 
                bg: 'bg-blue-50' 
            },
            { 
                tab: 'companies', 
                title: 'TotalTrac Lead Engine', 
                subtitle: 'CONECTAR PARA CUIDAR',
                desc: 'Gerencie sua carteira de clientes, histórico de contas e pessoas-chave.', 
                icon: Building2, 
                xp: '+50',
                color: 'text-indigo-500', 
                bg: 'bg-indigo-50' 
            },
            { 
                tab: 'prospect', 
                title: 'TotalTrac Prospect', 
                subtitle: 'CONECTAR PARA CUIDAR',
                desc: 'Descubra novas empresas via fontes abertas, com Apollo opcional.', 
                icon: Search, 
                xp: '+100',
                color: 'text-sky-500', 
                bg: 'bg-sky-50' 
            },
            { 
                tab: 'enrich', 
                title: 'TotalTrac Prospect AI', 
                subtitle: 'CONECTAR PARA CUIDAR',
                desc: 'Rode o enriquecimento completo de CNPJ, telefones e e-mails de decisores.', 
                icon: Sparkles, 
                xp: '+200',
                color: 'text-purple-500', 
                bg: 'bg-purple-50' 
            },
            { 
                tab: 'intelligence', 
                title: 'TotalTrac Intelligence', 
                subtitle: 'CONECTAR PARA CUIDAR',
                desc: 'IA autônoma para análise de risco, scoring e geração de scripts de vendas.', 
                icon: Zap, 
                xp: '+180',
                color: 'text-rose-500', 
                bg: 'bg-rose-50' 
            },
            { 
                tab: 'prompts', 
                title: 'TotalTrac Fleet OS', 
                subtitle: 'CONECTAR PARA CUIDAR',
                desc: 'Configure as diretrizes e regras de tom de voz para a Inteligência Artificial.', 
                icon: Sparkles, 
                xp: '+195',
                color: 'text-fuchsia-500', 
                bg: 'bg-fuchsia-50' 
            },
            { 
                tab: 'activities', 
                title: 'TotalTrac Growth', 
                subtitle: 'CONECTAR PARA CUIDAR',
                desc: 'Controle tarefas, follow-ups e métricas de desempenho diário.', 
                icon: Activity, 
                xp: '+150',
                color: 'text-emerald-500', 
                bg: 'bg-emerald-50' 
            },
            { 
                tab: 'chatbook', 
                title: 'TotalTrac Chatbook', 
                subtitle: 'CONECTAR PARA CUIDAR',
                desc: 'Treinamento prático via Roleplay com IA, matriz de qualificação avançada e estratégias.', 
                icon: MessageSquare, 
                xp: '+1500',
                color: 'text-amber-500', 
                bg: 'bg-amber-50' 
            },
        ]
    }
};

export function Dashboard({ onNavigate }: DashboardProps) {
    const [_stats, setStats] = useState({
        totalCompanies: 0,
        activeLeads: 0,
        pendingActivities: 0,
        wonDeals: 0
    });
    const [loading, setLoading] = useState(true);
    const { activeBrand, setActiveBrand } = useBrand();
    const [selectedBrandCard, setSelectedBrandCard] = useState<'atlasgr' | 'totaltrac' | null>(null);
    const [isFloatingChatbookOpen, setIsFloatingChatbookOpen] = useState(false);
    const [activeToolPopover, setActiveToolPopover] = useState<TechToolInfo | null>(null);

    // Sync context se o brand card mudar
    useEffect(() => {
        if (selectedBrandCard && selectedBrandCard !== activeBrand) {
            setSelectedBrandCard(activeBrand as 'atlasgr' | 'totaltrac');
        }
    }, [activeBrand]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [companiesRes, leadsRes, activities] = await Promise.all([
                    api.get<{ data: Company[] }>('/api/companies?limit=1000'),
                    api.get<{ data: Lead[] }>('/api/leads?limit=1000'),
                    api.get<ActivityType[]>('/api/activities')
                ]);
                const companies = companiesRes.data || [];
                const leads = leadsRes.data || [];
                setStats({
                    totalCompanies: companies.length,
                    activeLeads: leads.filter((l: Lead) => l.status !== 'Fechado Ganho' && l.status !== 'Fechado Perdido').length,
                    pendingActivities: activities.filter((a: ActivityType) => a.status === 'Pendente').length,
                    wonDeals: leads.filter((l: Lead) => l.status === 'Fechado Ganho').length
                });
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, []);

    const handleSelectBrandCard = (brandId: 'atlasgr' | 'totaltrac') => {
        setSelectedBrandCard(brandId);
        setActiveBrand(brandId);
    };

    const handleSelectTool = (_brandId: string, tab: TabType) => {
        onNavigate(tab);
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-900 min-h-screen">
                <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const activeConfig = selectedBrandCard ? BRAND_CONFIGS[selectedBrandCard] : null;

    // Lista de ferramentas/tecnologias demonstrativas mais populares no ecossistema
    const featuredTechnologies = ['AWS', 'Salesforce', 'React', 'HubSpot', 'SAP', 'Docker', 'Google Analytics', 'Shopify', 'PostgreSQL', 'Python'];

    return (
        <div className={`flex-1 overflow-y-auto ${
            selectedBrandCard 
                ? 'bg-gradient-to-b from-orange-50/40 via-amber-50/20 to-gray-50'
                : 'bg-transparent'
        } flex flex-col items-center relative overflow-hidden transition-colors duration-1000 min-h-screen font-sans`}>
            
            {/* Popover Interativo de Tecnologias */}
            <ToolTechPopover 
                info={activeToolPopover} 
                onClose={() => setActiveToolPopover(null)} 
                onFilterByTool={(tool) => {
                    onNavigate('companies');
                }}
            />

            {/* ANIMATED GRADIENT BACKGROUND */}
            {!selectedBrandCard && (
                <div className="absolute inset-0 flex z-0 overflow-hidden pointer-events-none">
                    <div 
                        className="w-1/2 h-full relative overflow-hidden animate-[gradient-flow_8s_ease-in-out_infinite]"
                        style={{
                            background: 'linear-gradient(135deg, #fff3eb 0%, #ffab80 45%, #FF5618 100%)',
                            backgroundSize: '200% 200%'
                        }}
                    >
                        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/30 rounded-full blur-3xl animate-pulse" />
                        <div className="absolute bottom-10 left-10 w-80 h-80 bg-[#FF5618]/30 rounded-full blur-3xl" />
                    </div>

                    <div 
                        className="w-1/2 h-full relative overflow-hidden animate-[gradient-flow_8s_ease-in-out_infinite]"
                        style={{
                            background: 'linear-gradient(135deg, #eaf8ff 0%, #80d4ff 45%, #0088CC 100%)',
                            backgroundSize: '200% 200%',
                            animationDelay: '1s'
                        }}
                    >
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/30 rounded-full blur-3xl animate-pulse" />
                        <div className="absolute bottom-10 right-10 w-80 h-80 bg-[#0088CC]/30 rounded-full blur-3xl" />
                    </div>

                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-64 bg-gradient-to-r from-orange-400/20 via-white/40 to-blue-400/20 backdrop-blur-md pointer-events-none" />
                </div>
            )}

            {/* Balões Flutuantes */}
            <div className="fixed bottom-10 right-10 z-[100] flex flex-col gap-4">
                <button
                    onClick={() => handleSelectTool(selectedBrandCard || 'atlasgr', 'chatbook' as TabType)}
                    className="pointer-events-auto group backdrop-blur-xl shadow-[0_10px_40px_rgba(255,86,24,0.5)] p-4 md:px-6 md:py-4 rounded-full flex items-center justify-center gap-3 text-white hover:scale-105 active:scale-95 transition-all duration-300 relative overflow-hidden bg-gradient-to-r from-[#FF8008] to-[#FF5618] border border-white/30 font-black uppercase tracking-wider text-xs md:text-sm"
                >
                    <Bot className="w-6 h-6 relative z-10" />
                    <span className="hidden md:block relative z-10">ROLEPLAY / CHATBOOK</span>
                </button>
            </div>

            <div className="w-full max-w-7xl px-4 md:px-8 space-y-10 pb-24 relative z-10">
                {!selectedBrandCard ? (
                    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }} className="space-y-10 w-full pt-8">
                        
                        <LiveDateTime />

                        {/* Banner de Dica Contextual */}
                        <ContextualTip
                            id="tip-dashboard-main"
                            title="Selecione seu ambiente para iniciar a prospecção"
                            description="Escolha entre AtlasGR (Inteligência B2B & SDR) e TotalTrac (Gestão de Frotas). Em cada empresa cadastrada, você verá os logos exatos das ferramentas utilizadas."
                        />

                        {/* WIDGET DE LOGOS DE FERRAMENTAS MAIS DETECTADAS */}
                        <div className="bg-white/90 backdrop-blur-2xl rounded-3xl p-6 shadow-xl border border-white/80 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-gray-900 font-extrabold text-sm">
                                    <Wrench className="w-4 h-4 text-orange-500" />
                                    <span>Ecossistema de Software Mapeado nas Empresas</span>
                                </div>
                                <button 
                                    onClick={() => onNavigate('companies')} 
                                    className="text-xs text-orange-600 font-bold hover:underline"
                                >
                                    Ver empresas por tecnologia →
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                                {featuredTechnologies.map((tech, idx) => (
                                    <TechToolLogo
                                        key={idx}
                                        techName={tech}
                                        showCategory={true}
                                        size="md"
                                        onClick={(info) => setActiveToolPopover(info)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* WIDGET DE RELÓGIO OPERACIONAL E CALENDÁRIO INTERATIVO */}
                        <ClockCalendarWidget />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14 px-4 lg:px-8 mt-4">
                            {/* CARD 1: ATLASGR */}
                            <motion.div
                                whileHover={{ scale: 1.03, y: -8 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleSelectBrandCard('atlasgr')}
                                className="group relative bg-white/95 backdrop-blur-2xl rounded-[3.5rem] p-10 md:p-14 shadow-[0_25px_60px_rgba(255,86,24,0.35)] hover:shadow-[0_35px_80px_rgba(255,86,24,0.6)] transition-all duration-500 cursor-pointer flex flex-col items-center justify-between text-center min-h-[480px] border border-white/80"
                            >
                                <div className="absolute inset-0 bg-gradient-to-b from-[#FF5618]/10 via-amber-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[3.5rem]" />
                                
                                <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center py-4 px-2 overflow-hidden group-hover:scale-105 transition-all duration-700">
                                    <div className="w-full flex items-center justify-center max-h-[140px] mb-4">
                                        <Logo className="h-16 md:h-20 max-w-[90%] w-auto object-contain transition-all duration-500 drop-shadow-sm" />
                                    </div>
                                    <p className="text-gray-500 text-xs font-black tracking-widest uppercase">Inteligência & Aceleração Comercial B2B</p>
                                </div>
                                
                                <div className="w-full relative z-10 pt-6 px-2">
                                    <div className="relative w-full bg-gradient-to-r from-[#FF8008] via-[#FF5618] to-[#E04000] text-white font-black py-4 md:py-5 px-6 rounded-full flex items-center justify-center gap-3 uppercase tracking-wider text-xs md:text-sm shadow-[0_12px_35px_rgba(255,86,24,0.6)] group-hover:shadow-[0_18px_50px_rgba(255,86,24,0.8)] transition-all">
                                        Iniciar Inteligência Comercial <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
                                    </div>
                                </div>
                            </motion.div>

                            {/* CARD 2: TOTALTRAC */}
                            <motion.div
                                whileHover={{ scale: 1.03, y: -8 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleSelectBrandCard('totaltrac')}
                                className="group relative bg-white/95 backdrop-blur-2xl rounded-[3.5rem] p-10 md:p-14 shadow-[0_25px_60px_rgba(0,136,204,0.35)] hover:shadow-[0_35px_80px_rgba(0,136,204,0.6)] transition-all duration-500 cursor-pointer flex flex-col items-center justify-between text-center min-h-[480px] border border-white/80"
                            >
                                <div className="absolute inset-0 bg-gradient-to-b from-[#0088CC]/10 via-sky-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[3.5rem]" />
                                
                                <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center py-4 px-2 overflow-hidden group-hover:scale-105 transition-all duration-700">
                                    <div className="w-full flex items-center justify-center max-h-[140px] mb-4">
                                        <TotalTrackLogo className="h-14 md:h-18 max-w-[85%] w-auto object-contain transition-all duration-500 drop-shadow-sm" />
                                    </div>
                                    <p className="text-gray-600 text-xs font-black tracking-widest uppercase">Tecnologia & Gestão de Frotas B2B</p>
                                </div>
                                
                                <div className="w-full relative z-10 pt-6 px-2">
                                    <div className="relative w-full bg-gradient-to-r from-[#00AACC] via-[#0088CC] to-[#005599] text-white font-black py-4 md:py-5 px-6 rounded-full flex items-center justify-center gap-3 uppercase tracking-wider text-xs md:text-sm shadow-[0_12px_35px_rgba(0,136,204,0.6)] group-hover:shadow-[0_18px_50px_rgba(0,136,204,0.8)] transition-all">
                                        Iniciar Inteligência Comercial <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-10 pt-6">
                        
                        {/* Title Header */}
                        <div className="flex flex-col items-center text-center space-y-3 pt-4">
                            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/80 border border-orange-200 text-orange-600 text-xs font-extrabold uppercase tracking-widest shadow-sm">
                                <Trophy size={14} className="text-amber-500" /> Ferramentas do Ecossistema
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900">
                                {activeConfig?.name} <span className="text-orange-500">Revenue OS</span>
                            </h1>
                            <p className="text-gray-500 text-sm font-semibold max-w-md">
                                {activeConfig?.slogan}
                            </p>
                        </div>

                        {/* Grid de Cards Ferramentas */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {activeConfig?.tools.map((tool) => (
                                <motion.div
                                    key={tool.tab}
                                    whileHover={{ y: -6, scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleSelectTool(selectedBrandCard, tool.tab as TabType)}
                                    className="group relative flex flex-col justify-between p-7 bg-white rounded-[2.5rem] border border-gray-100 shadow-[0_10px_35px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_50px_rgba(255,90,31,0.12)] hover:border-orange-300 transition-all duration-300 cursor-pointer overflow-hidden min-h-[320px] text-center"
                                >
                                    <div className="absolute top-5 right-5 flex items-center gap-1 bg-amber-50/80 border border-amber-200/60 px-3 py-1 rounded-full text-[11px] font-black text-amber-600 shadow-2xs">
                                        <Star size={12} className="text-amber-500 fill-amber-500" />
                                        <span>{tool.xp}</span>
                                    </div>

                                    <div className="flex flex-col items-center pt-2">
                                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110 shadow-inner ${tool.bg} ${tool.color}`}>
                                            <tool.icon className="w-8 h-8" />
                                        </div>

                                        <h3 className="font-black text-lg text-gray-900 mb-1 tracking-tight leading-snug group-hover:text-orange-600 transition-colors">
                                            {tool.title}
                                        </h3>
                                        <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-3">
                                            {tool.subtitle}
                                        </p>

                                        <p className="text-gray-500 text-xs leading-relaxed font-medium line-clamp-3 px-1">
                                            {tool.desc}
                                        </p>
                                    </div>

                                    <div className="pt-6 w-full flex justify-center">
                                        <div className="w-full bg-gray-50 group-hover:bg-orange-500 group-hover:text-white text-orange-600 font-black py-3 px-6 rounded-2xl flex items-center justify-center gap-2 uppercase tracking-wider text-xs transition-all shadow-2xs group-hover:shadow-md">
                                            <span>INICIAR</span> <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Footer Link & Navigation */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-gray-200/60">
                            <button
                                onClick={() => setSelectedBrandCard(null)}
                                className="group flex items-center justify-center gap-2 px-6 py-3 rounded-full font-black text-xs uppercase tracking-wider text-gray-500 hover:text-gray-900 bg-white border border-gray-200 transition-all shadow-xs"
                            >
                                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                                Voltar para Início
                            </button>

                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-5 py-2.5 rounded-full border border-amber-200/60 shadow-2xs">
                                <Trophy size={16} /> HALL DE CONQUISTAS
                            </div>
                        </div>

                    </motion.div>
                )}
            </div>

            <FloatingChatbook isOpen={isFloatingChatbookOpen} onClose={() => setIsFloatingChatbookOpen(false)} />
        </div>
    );
}
