import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { Lead, Activity as ActivityType, Company } from '../../../types';
import { api } from '../../../lib/api';
import type { TabType } from '../../../components/layout/nav';
import { useLiveClock } from '../../../hooks/useLiveClock';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { staggerContainer, staggerItem, fadeInUp } from '../../../lib/motion';
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
} from '../../../components/icons';

interface DashboardProps {
    onNavigate: (tab: TabType) => void;
}

const TOOLS: Array<{ tab: TabType; title: string; desc: string; icon: React.ComponentType<AtlasIconProps>; color: string; bg: string }> = [
    { tab: 'crm', title: 'Pipeline & CRM', desc: 'Acompanhe negociações e controle o funil comercial estágio por estágio.', icon: IconPipeline, color: 'text-blue-600', bg: 'bg-blue-100' },
    { tab: 'companies', title: 'Empresas & Contatos', desc: 'Gerencie sua carteira de clientes, histórico de contas e pessoas-chave.', icon: IconBuilding, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { tab: 'prospect', title: 'Prospector de Mercado', desc: 'Descubra novas empresas via Google Places e Apollo com filtros precisos.', icon: IconRadar, color: 'text-orange-600', bg: 'bg-orange-100' },
    { tab: 'enrich', title: 'Enriquecedor de Dados', desc: 'Rode o enriquecimento completo de CNPJ, telefones e e-mails de decisores.', icon: IconSparkle, color: 'text-purple-600', bg: 'bg-purple-100' },
    { tab: 'intelligence', title: 'Inteligência Logística', desc: 'IA autônoma para análise de risco, scoring e geração de scripts de vendas.', icon: IconBrain, color: 'text-rose-600', bg: 'bg-rose-100' },
    { tab: 'activities', title: 'Gestão de Atividades', desc: 'Controle tarefas, follow-ups e métricas de desempenho diário.', icon: IconActivity, color: 'text-emerald-600', bg: 'bg-emerald-100' },
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 rounded-2xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-8 flex flex-col items-center">
            <div className="w-full max-w-6xl space-y-12 pb-10">

                {/* Cabeçalho do Dashboard */}
                <motion.div
                    variants={fadeInUp}
                    initial="hidden"
                    animate="show"
                    className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-6"
                >
                    <div>
                        <div className="mb-1 flex items-center gap-2">
                            <IconBolt className="h-4 w-4 text-atlas-orange" />
                            <Badge variant="brand">Sistema operacional</Badge>
                        </div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Painel de <span className="text-atlas-orange">Controle</span></h1>
                        <p className="text-gray-500 mt-2 text-lg flex items-center gap-2">
                            <IconSparkle className="h-4 w-4 text-atlas-orange/70 shrink-0" />
                            Selecione uma ferramenta abaixo para iniciar o trabalho.
                        </p>
                    </div>
                    <LiveClock />
                </motion.div>

                {/* Grade de Ferramentas (App Hub) */}
                <motion.div
                    variants={staggerContainer(0.07)}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {TOOLS.map((tool) => (
                        <motion.div key={tool.tab} variants={staggerItem}>
                            <Card
                                variant="interactive"
                                tilt
                                onClick={() => onNavigate(tool.tab)}
                                className="group relative flex flex-col items-start p-8 overflow-hidden text-left h-full"
                            >
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 ${tool.bg} ${tool.color}`}>
                                    <tool.icon className="w-8 h-8" />
                                </div>
                                <h3 className="font-bold text-2xl text-gray-900 mb-3 tracking-tight">
                                    {tool.title}
                                </h3>
                                <p className="text-gray-500 text-sm leading-relaxed mb-8">
                                    {tool.desc}
                                </p>

                                <div className="mt-auto flex items-center gap-2 text-atlas-orange font-semibold text-sm uppercase tracking-wider opacity-80 group-hover:opacity-100 transition-opacity">
                                    Acessar Ferramenta <IconArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </div>

                                {/* Decorativo */}
                                <div className={`absolute -right-8 -bottom-8 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 ${tool.bg}`}></div>
                            </Card>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Métricas Rápidas */}
                <div className="pt-6">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                        <IconActivity className="w-4 h-4" /> Visão Geral do Sistema
                    </h2>
                    <motion.div
                        variants={staggerContainer(0.05)}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-2 md:grid-cols-4 gap-4"
                    >
                        {cards.map((card, index) => (
                            <motion.div key={index} variants={staggerItem}>
                                <Card variant="glass" className="p-5 flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-white/70 ${card.color}`}>
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
