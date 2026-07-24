import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { Lead, Activity as ActivityType, Company } from '../../../types';
import { api } from '../../../lib/api';
import type { TabType } from '../../../components/layout/nav';
import { useLiveClock } from '../../../hooks/useLiveClock';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { staggerContainer, staggerItem, fadeInUp } from '../../../lib/motion';
import { useBrand } from '../../../contexts/BrandContext';
import {
    IconBuilding,
    IconTarget,
    IconActivity,
    IconCheck,
    IconPipeline,
    IconRadar,
    IconSparkle,
    IconBrain,
    IconArrowRight,
    IconBolt,
    type AtlasIconProps,
    IconSliders,
    IconBot,
    IconShieldCheck,
    IconCpu
} from '../../../components/icons';

interface DashboardProps {
    onNavigate: (tab: TabType) => void;
}

interface ToolItem {
    tab: TabType;
    title: string;
    desc: string;
    icon: React.ComponentType<AtlasIconProps>;
    badge: string;
}

const ATLASGR_TOOLS: ToolItem[] = [
    { tab: 'crm', title: 'AtlasGR Sales Cloud', desc: 'CRM e pipeline comercial inteligente estágio por estágio.', icon: IconPipeline, badge: 'CRM' },
    { tab: 'companies', title: 'AtlasGR Lead Engine', desc: 'Base central de empresas, frotas e pessoas-chave.', icon: IconBuilding, badge: 'Dados' },
    { tab: 'prospect', title: 'AtlasGR Prospect', desc: 'Motor de busca ativo para transportadoras e embarcadores.', icon: IconRadar, badge: 'Busca' },
    { tab: 'enrich', title: 'AtlasGR Prospect AI', desc: 'Enriquecimento profundo com IA de CNPJs e decisores.', icon: IconSparkle, badge: 'IA' },
    { tab: 'intelligence', title: 'AtlasGR Intelligence', desc: 'Agentes autônomos de IA para qualificação de risco e Cold Calls.', icon: IconBrain, badge: 'RAG' },
    { tab: 'prompts', title: 'AtlasGR Commercial OS', desc: 'AI Prompt Studio e engenharia de inteligência comercial.', icon: IconSliders, badge: 'Prompts' },
    { tab: 'activities', title: 'AtlasGR Growth', desc: 'Gestão de tarefas, follow-ups e automação comercial.', icon: IconActivity, badge: 'Growth' },
    { tab: 'roleplay', title: 'Roleplay Simulador IA', desc: 'Treinamento prático de vendas com cliente virtual interativo.', icon: IconBot, badge: 'Treino' },
];

const TOTALTRACK_TOOLS: ToolItem[] = [
    { tab: 'crm', title: 'Total Easy 4G & Total Auto', desc: 'Rastreamento plug & play e gestão de frotas leves.', icon: IconCpu, badge: '4G Plug' },
    { tab: 'companies', title: 'Total Frota & Total Máquinas', desc: 'Telemetria pesada, maquinário e controle de insumos.', icon: IconBuilding, badge: 'Frota' },
    { tab: 'prospect', title: 'Total Jornada', desc: 'Controle automatizado de jornada de trabalho de motoristas.', icon: IconTarget, badge: 'Jornada' },
    { tab: 'enrich', title: 'Total SAFE 4G / Dashcam', desc: 'Câmeras de vídeo-inteligência ADAS/Fadiga e prevenção.', icon: IconShieldCheck, badge: 'Vídeo IA' },
    { tab: 'intelligence', title: 'TotalTrack Fleet AI Diagnostic', desc: 'Diagnóstico inteligente de riscos PGR e sinistralidade.', icon: IconBrain, badge: 'Diagnostic' },
    { tab: 'prompts', title: 'Total Moto, Backup, Carreta & Isca', desc: 'Telemetria dedicada para motos, carretas e iscas RF.', icon: IconSliders, badge: 'Iscas RF' },
    { tab: 'activities', title: 'TotalTrack Growth', desc: 'Cronogramas de instalação, testes de transmissão e ordens.', icon: IconActivity, badge: 'Ordens' },
    { tab: 'roleplay', title: 'Simulador Objeções Telemetria', desc: 'Roleplay prático para quebra de objeções em telemetria.', icon: IconBot, badge: 'Simulador' },
];

function LiveClock() {
    const now = useLiveClock();
    const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return (
        <div className="text-right">
            <p className="text-xs font-semibold text-gray-400 capitalize">{dateLabel}</p>
            <p className="text-lg font-bold text-gray-800">{timeLabel}</p>
        </div>
    );
}

function AnimatedNumber({ value }: { value: number }) {
    const spring = useSpring(0, { stiffness: 120, damping: 22, mass: 1 });
    const display = useTransform(spring, (v) => Math.round(v).toLocaleString('pt-BR'));

    useEffect(() => {
        spring.set(value);
    }, [value, spring]);

    return <motion.span>{display}</motion.span>;
}

export function Dashboard({ onNavigate }: DashboardProps) {
    const { setBrand } = useBrand();
    const [stats, setStats] = useState({
        totalCompanies: 0,
        activeLeads: 0,
        pendingActivities: 0,
        wonDeals: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [companiesRes, leadsRes, activities] = await Promise.all([
                    api.get<{ data: Company[] }>('/api/companies?limit=1000'),
                    api.get<{ data: Lead[] }>('/api/leads?limit=1000'),
                    api.get<ActivityType[]>('/api/activities')
                ]);
                const companies = companiesRes.data;
                const leads = leadsRes.data;
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

    const cards = [
        { title: 'Empresas Base', value: stats.totalCompanies, icon: IconBuilding, color: 'text-blue-600' },
        { title: 'Leads Ativos', value: stats.activeLeads, icon: IconTarget, color: 'text-atlas-orange' },
        { title: 'Pendências', value: stats.pendingActivities, icon: IconActivity, color: 'text-purple-600' },
        { title: 'Ganhos', value: stats.wonDeals, icon: IconCheck, color: 'text-emerald-600' }
    ];

    if (loading) {
        return (
            <div className="flex-1 overflow-y-auto bg-gray-50 p-8 flex flex-col items-center">
                <div className="w-full max-w-7xl space-y-12 pb-10">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-6">
                        <div className="space-y-3">
                            <Skeleton className="h-9 w-72" />
                            <Skeleton className="h-5 w-56" />
                        </div>
                        <Skeleton className="h-10 w-32" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Skeleton className="h-96 rounded-3xl" />
                        <Skeleton className="h-96 rounded-3xl" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-950/95 text-gray-100 p-8 flex flex-col items-center">
            <div className="w-full max-w-7xl space-y-10 pb-10">

                {/* Cabeçalho da Plataforma */}
                <motion.div
                    variants={fadeInUp}
                    initial="hidden"
                    animate="show"
                    className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-800 pb-6"
                >
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-atlas-orange text-white rounded-xl shadow-lg shadow-atlas-orange/30">
                                <IconBolt className="h-6 w-6" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-black tracking-tight text-white">
                                    PROSPECTOR <span className="text-atlas-orange">ATLASGR & TOTALTRACK</span>
                                </h1>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mt-0.5">
                                    Ecossistema Integrado de Inteligência Comercial e Telemetria de Frotas
                                </p>
                            </div>
                        </div>
                    </div>

                    <LiveClock />
                </motion.div>

                {/* Métricas Globais */}
                <motion.div
                    variants={staggerContainer(0.05)}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                >
                    {cards.map((card, index) => (
                        <motion.div key={index} variants={staggerItem}>
                            <Card variant="glass" className="p-5 flex items-center gap-4 bg-gray-900/60 border border-gray-800/80">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gray-800/80 ${card.color}`}>
                                    <card.icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-white leading-none">
                                        <AnimatedNumber value={card.value} />
                                    </p>
                                    <p className="text-xs font-semibold text-gray-400 mt-1 uppercase tracking-wide">{card.title}</p>
                                </div>
                            </Card>
                        </motion.div>
                    ))}
                </motion.div>

                {/* DOIS CARDS PRINCIPAIS (AtlasGR & TotalTrack) LADO A LADO */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* CARD 1: ATLASGR COMMERCIAL OS */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="bg-gray-900/90 rounded-3xl border border-orange-500/30 p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

                        <div>
                            {/* Header do Card AtlasGR */}
                            <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-atlas-orange font-black text-xl">
                                        AG
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                            AtlasGR <span className="text-atlas-orange text-xs px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/40">Commercial OS</span>
                                        </h2>
                                        <p className="text-xs text-gray-400 font-medium">Sales Cloud & Inteligência Comercial B2B</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setBrand('atlasgr'); onNavigate('crm'); }}
                                    className="px-4 py-2 bg-atlas-orange hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
                                >
                                    <span>Abrir AtlasGR</span>
                                    <IconArrowRight className="w-4 h-4" />
                                </button>
                            </div>

                            <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                                Plataforma completa de inteligência comercial B2B para o setor de transporte e logística. Prospecção ativa de transportadoras e embarcadores, qualificação de risco com IA e gestão de funil.
                            </p>

                            {/* Lista de Ferramentas de IA do AtlasGR */}
                            <div className="space-y-3 mb-6">
                                <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-2">Ferramentas de IA & Módulos AtlasGR:</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {ATLASGR_TOOLS.map((t) => (
                                        <div
                                            key={t.tab}
                                            onClick={() => { setBrand('atlasgr'); onNavigate(t.tab); }}
                                            className="p-3.5 bg-gray-950/70 border border-gray-800 hover:border-orange-500/50 rounded-2xl cursor-pointer transition-all hover:bg-gray-800/50 group flex items-start gap-3"
                                        >
                                            <div className="p-2 bg-orange-500/10 text-atlas-orange rounded-xl shrink-0 group-hover:scale-110 transition-transform">
                                                <t.icon className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold text-white group-hover:text-atlas-orange transition-colors truncate">{t.title}</p>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500/30 text-orange-400">{t.badge}</Badge>
                                                </div>
                                                <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{t.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
                            <span className="flex items-center gap-1.5"><IconCheck className="w-4 h-4 text-orange-500" /> RAG & Algoritmos de Risco</span>
                            <span className="font-semibold text-orange-400">8 Módulos Ativos</span>
                        </div>
                    </motion.div>

                    {/* CARD 2: TOTALTRACK FLEET OS */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="bg-gray-900/90 rounded-3xl border border-blue-500/30 p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                        <div>
                            {/* Header do Card TotalTrack */}
                            <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-black text-xl">
                                        TT
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                            TotalTrack <span className="text-blue-400 text-xs px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40">Fleet OS</span>
                                        </h2>
                                        <p className="text-xs text-gray-400 font-medium">Telemetria, Rastreamento 4G & Segurança PGR</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setBrand('totaltrack'); onNavigate('crm'); }}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
                                >
                                    <span>Abrir TotalTrack</span>
                                    <IconArrowRight className="w-4 h-4" />
                                </button>
                            </div>

                            <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                                Soluções avançadas em telemetria veicular, câmeras inteligentes com IA (Fadiga/ADAS), controle de jornada de motoristas e sistemas de segurança para frotas corporativas e cargas.
                            </p>

                            {/* Lista de Ferramentas de IA & Módulos do TotalTrack */}
                            <div className="space-y-3 mb-6">
                                <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-2">Ferramentas de IA & Módulos TotalTrack:</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {TOTALTRACK_TOOLS.map((t) => (
                                        <div
                                            key={t.tab}
                                            onClick={() => { setBrand('totaltrack'); onNavigate(t.tab); }}
                                            className="p-3.5 bg-gray-950/70 border border-gray-800 hover:border-blue-500/50 rounded-2xl cursor-pointer transition-all hover:bg-gray-800/50 group flex items-start gap-3"
                                        >
                                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl shrink-0 group-hover:scale-110 transition-transform">
                                                <t.icon className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors truncate">{t.title}</p>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400">{t.badge}</Badge>
                                                </div>
                                                <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{t.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
                            <span className="flex items-center gap-1.5"><IconCheck className="w-4 h-4 text-blue-400" /> Câmeras IA & Telemetria CAN/4G</span>
                            <span className="font-semibold text-blue-400">8 Módulos Ativos</span>
                        </div>
                    </motion.div>

                </div>

            </div>
        </div>
    );
}
