import { useState, useEffect } from 'react';
import { Building2, Target, Activity, CheckCircle2, LayoutTemplate, Search, Sparkles, ArrowRight, Zap } from 'lucide-react';
import { Lead, Activity as ActivityType, Company } from '../../../types';
import { api } from '../../../lib/api';
import type { TabType } from '../../../components/layout/Header';

interface DashboardProps {
    onNavigate: (tab: TabType) => void;
}

const TOOLS: Array<{ tab: TabType; title: string; desc: string; icon: any; color: string; bg: string }> = [
    { tab: 'crm', title: 'Pipeline & CRM', desc: 'Acompanhe negociações e controle o funil comercial estágio por estágio.', icon: LayoutTemplate, color: 'text-blue-600', bg: 'bg-blue-100' },
    { tab: 'companies', title: 'Empresas & Contatos', desc: 'Gerencie sua carteira de clientes, histórico de contas e pessoas-chave.', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { tab: 'prospect', title: 'Prospector de Mercado', desc: 'Descubra novas empresas via Google Places e Apollo com filtros precisos.', icon: Search, color: 'text-orange-600', bg: 'bg-orange-100' },
    { tab: 'enrich', title: 'Enriquecedor de Dados', desc: 'Rode o enriquecimento completo de CNPJ, telefones e e-mails de decisores.', icon: Sparkles, color: 'text-purple-600', bg: 'bg-purple-100' },
    { tab: 'intelligence', title: 'Inteligência Logística', desc: 'IA autônoma para análise de risco, scoring e geração de scripts de vendas.', icon: Zap, color: 'text-rose-600', bg: 'bg-rose-100' },
    { tab: 'prompts', title: 'AI Prompt Studio', desc: 'Configure as diretrizes e regras de tom de voz para a Inteligência Artificial.', icon: Sparkles, color: 'text-fuchsia-600', bg: 'bg-fuchsia-100' },
    { tab: 'activities', title: 'Gestão de Atividades', desc: 'Controle tarefas, follow-ups e métricas de desempenho diário.', icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-100' },
];

function LiveClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);
    const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return (
        <div className="text-right">
            <p className="text-sm font-medium text-gray-500 capitalize">{dateLabel}</p>
            <p className="text-xl font-bold text-gray-800">{timeLabel}</p>
        </div>
    );
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
        { title: 'Empresas', value: stats.totalCompanies, icon: Building2, color: 'text-blue-600' },
        { title: 'Leads Ativos', value: stats.activeLeads, icon: Target, color: 'text-orange-600' },
        { title: 'Pendências', value: stats.pendingActivities, icon: Activity, color: 'text-purple-600' },
        { title: 'Ganhos', value: stats.wonDeals, icon: CheckCircle2, color: 'text-green-600' }
    ];

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
                <div className="w-12 h-12 border-4 border-atlas-orange border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-8 flex flex-col items-center">
            <div className="w-full max-w-6xl space-y-12 pb-10">
                
                {/* Cabeçalho do Dashboard */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-6">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Painel de <span className="text-atlas-orange">Controle</span></h1>
                        <p className="text-gray-500 mt-2 text-lg">Selecione uma ferramenta abaixo para iniciar o trabalho.</p>
                    </div>
                    <LiveClock />
                </div>

                {/* Grade de Ferramentas (App Hub) */}
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {TOOLS.map((tool) => (
                            <button
                                key={tool.tab}
                                onClick={() => onNavigate(tool.tab)}
                                className="group relative flex flex-col items-start p-8 bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-2 hover:border-atlas-orange/30 transition-all duration-300 overflow-hidden text-left"
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
                                    Acessar Ferramenta <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </div>
                                
                                {/* Decorativo */}
                                <div className={`absolute -right-8 -bottom-8 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 ${tool.bg}`}></div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Métricas Rápidas */}
                <div className="pt-6">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Visão Geral do Sistema
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {cards.map((card, index) => (
                            <div key={index} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-gray-50 ${card.color}`}>
                                    {<card.icon className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-gray-900 leading-none">{card.value}</p>
                                    <p className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wide">{card.title}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
