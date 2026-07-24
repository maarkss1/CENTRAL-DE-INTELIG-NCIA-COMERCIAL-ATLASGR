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
    IconRefresh
} from '../../../components/icons';

interface DashboardProps {
    onNavigate: (tab: TabType) => void;
}

const TOOLS_ATLASGR: Array<{ tab: TabType; title: string; desc: string; icon: React.ComponentType<AtlasIconProps>; color: string; bg: string }> = [
    { tab: 'crm', title: 'AtlasGR Sales Cloud', desc: 'CRM e pipeline comercial inteligente estágio por estágio.', icon: IconPipeline, color: 'text-orange-600', bg: 'bg-orange-100' },
    { tab: 'companies', title: 'AtlasGR Lead Engine', desc: 'Base de dados central de empresas, frotas e pessoas-chave.', icon: IconBuilding, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { tab: 'prospect', title: 'AtlasGR Prospect', desc: 'Motor de busca ativo para identificar transportadoras e embarcadores.', icon: IconRadar, color: 'text-blue-600', bg: 'bg-blue-100' },
    { tab: 'enrich', title: 'AtlasGR Prospect AI', desc: 'Enriquecimento profundo com IA de CNPJs, decisores e contatos.', icon: IconSparkle, color: 'text-purple-600', bg: 'bg-purple-100' },
    { tab: 'intelligence', title: 'AtlasGR Intelligence', desc: 'Agentes autônomos de IA para qualificação de risco e Cold Calls.', icon: IconBrain, color: 'text-rose-600', bg: 'bg-rose-100' },
    { tab: 'prompts', title: 'AtlasGR Commercial OS', desc: 'AI Prompt Studio e gestão de inteligência comercial.', icon: IconSliders, color: 'text-amber-600', bg: 'bg-amber-100' },
    { tab: 'activities', title: 'AtlasGR Growth', desc: 'Gestão de tarefas, follow-ups e automação de crescimento.', icon: IconActivity, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { tab: 'roleplay', title: 'Roleplay & Simulador IA', desc: 'Treinamento e simulação prática de vendas com cliente virtual.', icon: IconBot, color: 'text-indigo-600', bg: 'bg-indigo-100' },
];

const TOOLS_TOTALTRACK: Array<{ tab: TabType; title: string; desc: string; icon: React.ComponentType<AtlasIconProps>; color: string; bg: string }> = [
    { tab: 'crm', title: 'TotalTrack Sales Cloud', desc: 'Gestão de propostas de rastreamento, telemetria e segurança.', icon: IconPipeline, color: 'text-blue-600', bg: 'bg-blue-100' },
    { tab: 'companies', title: 'TotalTrack Lead Engine', desc: 'Frotas de logística, locadoras de máquinas e transportadoras.', icon: IconBuilding, color: 'text-cyan-600', bg: 'bg-cyan-100' },
    { tab: 'prospect', title: 'TotalTrack Prospect', desc: 'Prospecção focada em gestores de frotas e gerentes de risco.', icon: IconRadar, color: 'text-sky-600', bg: 'bg-sky-100' },
    { tab: 'enrich', title: 'TotalTrack Prospect AI', desc: 'Enriquecimento de dados de frotas corporativas e telemetria.', icon: IconSparkle, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { tab: 'intelligence', title: 'TotalTrack Intelligence', desc: 'Análise de risco PGR, câmeras ADAS/Fadiga e alertas Total Safe.', icon: IconBrain, color: 'text-blue-700', bg: 'bg-blue-100' },
    { tab: 'prompts', title: 'TotalTrack Commercial OS', desc: 'Prompts e regras para venda de soluções de telemetria CAN/4G.', icon: IconSliders, color: 'text-teal-600', bg: 'bg-teal-100' },
    { tab: 'activities', title: 'TotalTrack Growth', desc: 'Tarefas de instalação, testes de isca RF e cronogramas.', icon: IconActivity, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { tab: 'roleplay', title: 'Roleplay & Simulador Fleet', desc: 'Treinamento prático de quebra de objeções em telemetria.', icon: IconBot, color: 'text-blue-600', bg: 'bg-blue-100' },
];

function LiveClock() {
    const now = useLiveClock();
    const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return (
        <div className="text-right">
            <p className="text-sm font-medium text-gray-500 capitalize">{dateLabel}</p>
            <p className="text-xl font-bold text-gray-800">{timeLabel}</p>
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
    const { brand, toggleBrand, brandName, brandSubtitle } = useBrand();
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

    const tools = brand === 'atlasgr' ? TOOLS_ATLASGR : TOOLS_TOTALTRACK;

    const cards = [
        { title: 'Empresas', value: stats.totalCompanies, icon: IconBuilding, color: 'text-blue-600' },
        { title: 'Leads Ativos', value: stats.activeLeads, icon: IconTarget, color: 'text-atlas-orange' },
        { title: 'Pendências', value: stats.pendingActivities, icon: IconActivity, color: 'text-purple-600' },
        { title: 'Ganhos', value: stats.wonDeals, icon: IconCheck, color: 'text-green-600' }
    ];

    if (loading) {
        return (
            <div className="flex-1 overflow-y-auto bg-gray-50 p-8 flex flex-col items-center">
                <div className="w-full max-w-6xl space-y-12 pb-10">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-6">
                        <div className="space-y-3">
                            <Skeleton className="h-9 w-72" />
                            <Skeleton className="h-5 w-56" />
                        </div>
                        <Skeleton className="h-10 w-32" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-56 rounded-3xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8 flex flex-col items-center">
            <div className="w-full max-w-6xl space-y-10 pb-10">

                {/* Cabeçalho Dual Brand do Dashboard */}
                <motion.div
                    variants={fadeInUp}
                    initial="hidden"
                    animate="show"
                    className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-200 pb-6"
                >
                    <div>
                        <div className="mb-2 flex items-center gap-3">
                            <div className="p-2 bg-orange-600 text-white rounded-xl shadow-sm">
                                <IconBolt className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                                    {brandName} <span className="text-orange-600">Revenue OS</span>
                                </h1>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{brandSubtitle}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Toggle de Marca Dual Context */}
                        <button
                            onClick={toggleBrand}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-orange-500 rounded-xl text-xs font-bold text-gray-700 shadow-xs hover:shadow-md transition-all"
                        >
                            <IconRefresh className="w-4 h-4 text-orange-600" />
                            <span>Alternar Marca: <strong className="text-orange-600">{brand === 'atlasgr' ? 'TotalTrack' : 'AtlasGR'}</strong></span>
                        </button>
                        <LiveClock />
                    </div>
                </motion.div>

                {/* Grade de Ferramentas (App Hub) */}
                <motion.div
                    variants={staggerContainer(0.07)}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {tools.map((tool) => (
                        <motion.div key={tool.tab} variants={staggerItem}>
                            <Card
                                variant="interactive"
                                tilt
                                onClick={() => onNavigate(tool.tab)}
                                className="group relative flex flex-col items-start p-8 overflow-hidden text-left h-full border border-gray-100 hover:border-orange-500/40 shadow-xs hover:shadow-xl transition-all"
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 ${tool.bg} ${tool.color}`}>
                                    <tool.icon className="w-7 h-7" />
                                </div>
                                <h3 className="font-bold text-xl text-gray-900 mb-2 tracking-tight">
                                    {tool.title}
                                </h3>
                                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                                    {tool.desc}
                                </p>

                                <div className="mt-auto flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-wider opacity-80 group-hover:opacity-100 transition-opacity">
                                    Acessar Módulo <IconArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </div>

                                <div className={`absolute -right-8 -bottom-8 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 ${tool.bg}`}></div>
                            </Card>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Métricas Rápidas */}
                <div className="pt-4">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                        <IconActivity className="w-4 h-4 text-orange-600" /> Visão Geral AtlasGR
                    </h2>
                    <motion.div
                        variants={staggerContainer(0.05)}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-2 md:grid-cols-4 gap-4"
                    >
                        {cards.map((card, index) => (
                            <motion.div key={index} variants={staggerItem}>
                                <Card variant="glass" className="p-5 flex items-center gap-4 border border-gray-100">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white/80 shadow-xs ${card.color}`}>
                                        <card.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 leading-none">
                                            <AnimatedNumber value={card.value} />
                                        </p>
                                        <p className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wide">{card.title}</p>
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
