
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Radar, KanbanSquare, TrendingUp, Handshake, Clock,
    Phone, Mail, MessageCircle, Users, MapPin, RefreshCw, CheckSquare, Activity as ActivityIcon, AlertTriangle,
} from 'lucide-react';
import { ClockCalendarWidget } from '../../../components/ui/ClockCalendarWidget';
import { LiveStatsWidget } from '../../../components/ui/LiveStatsWidget';
import { useBrand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useAnalytics, useActivities } from '../../../hooks/useDatabase';

const TYPE_ICONS: Record<string, React.JSX.Element> = {
    'ligação': <Phone className="w-4 h-4" />,
    'e-mail': <Mail className="w-4 h-4" />,
    'whatsapp': <MessageCircle className="w-4 h-4" />,
    'reunião': <Users className="w-4 h-4" />,
    'visita': <MapPin className="w-4 h-4" />,
    'follow-up': <RefreshCw className="w-4 h-4" />,
    'tarefa': <CheckSquare className="w-4 h-4" />,
};

function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

export function SinglePageDashboard() {
    const navigate = useNavigate();
    const { activeBrand } = useBrand();
    const { currentUser } = useAuth();
    const isAtlas = activeBrand === 'atlasgr';

    const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useAnalytics();

    const today = new Date().toISOString().split('T')[0];
    // `to` é exclusivo em /api/activities (ver findRange em activity.service.ts) — passar a mesma
    // data em from/to sempre falhava com 500 ("data inicial deve ser anterior à final"), então o
    // widget "Agenda de hoje" nunca carregava nada. Amanhã aqui cobre o dia de hoje inteiro.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { activities: todayActivities, loading: agendaLoading, error: agendaError, refetch: refetchAgenda } = useActivities({ from: today, to: tomorrow, limit: 20 });
    const sortedAgenda = [...todayActivities].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const todayLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase();

    const kpis = [
        {
            label: 'Leads Qualificados',
            value: stats ? stats.totalLeads.toLocaleString('pt-BR') : '—',
            icon: <Radar className="w-5 h-5" />,
        },
        {
            label: 'Taxa de Conversão',
            value: stats ? `${stats.conversionRate.toFixed(1)}%` : '—',
            icon: <Handshake className="w-5 h-5" />,
        },
        {
            label: 'Atividades Pendentes',
            value: stats ? stats.pendingActivities.toLocaleString('pt-BR') : '—',
            icon: <TrendingUp className="w-5 h-5" />,
        },
        {
            label: 'Fechados no Mês',
            value: stats ? stats.closedThisMonth.toLocaleString('pt-BR') : '—',
            icon: <Clock className="w-5 h-5" />,
        },
    ];

    return (
        <div className="flex-1 overflow-y-auto bg-transparent flex flex-col items-center relative min-h-screen font-sans p-4 md:p-8 space-y-6">
            <div className="w-full max-w-7xl space-y-6">

                {/* Cabeçalho de saudação */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-brand mb-1">{todayLabel}</p>
                        <h1 className="text-2xl font-black text-ink">{greeting()}, {currentUser?.name?.split(' ')[0] || 'Usuário'}</h1>
                        <p className="text-sm text-ink-2 mt-1">Resumo da operação {isAtlas ? 'AtlasGR' : 'TotalTrac'} de hoje.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/app/prospect')}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-brand-active text-white shadow-card hover:brightness-105 transition-all cursor-pointer"
                        >
                            <Radar className="w-4 h-4" /> Nova varredura
                        </button>
                        <button
                            onClick={() => navigate('/app/crm')}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-surface border border-line text-ink hover:bg-surface-2 transition-all cursor-pointer"
                        >
                            <KanbanSquare className="w-4 h-4" /> Abrir pipeline
                        </button>
                    </div>
                </div>

                {/* Tiras de KPIs */}
                {statsError ? (
                    <div className="p-4 rounded-card border border-red-500/30 bg-red-500/10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 text-sm text-red-300">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            Não foi possível carregar as métricas agora.
                        </div>
                        <button
                            onClick={() => refetchStats()}
                            className="text-xs font-bold text-red-300 hover:underline cursor-pointer shrink-0"
                        >
                            Tentar novamente
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {kpis.map((kpi) => (
                            <motion.div
                                key={kpi.label}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-5 rounded-card border border-line bg-surface shadow-card"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="p-2 rounded-xl bg-soft text-brand">{kpi.icon}</div>
                                </div>
                                <p className="text-xl font-black text-ink">{statsLoading ? '—' : kpi.value}</p>
                                <p className="text-[11px] font-semibold text-ink-2 mt-1 uppercase tracking-wide">{kpi.label}</p>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Agenda de hoje */}
                <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-ink">Agenda de hoje</h3>
                        <button
                            onClick={() => navigate('/app/activities')}
                            className="text-xs font-bold text-brand hover:underline cursor-pointer"
                        >
                            Ver agenda completa
                        </button>
                    </div>

                    {agendaLoading ? (
                        <p className="text-sm text-ink-2">Carregando compromissos...</p>
                    ) : agendaError ? (
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 text-sm text-red-300">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                Não foi possível carregar a agenda de hoje.
                            </div>
                            <button
                                onClick={() => refetchAgenda()}
                                className="text-xs font-bold text-red-300 hover:underline cursor-pointer shrink-0"
                            >
                                Tentar novamente
                            </button>
                        </div>
                    ) : sortedAgenda.length === 0 ? (
                        <p className="text-sm text-ink-2">Nenhum compromisso agendado para hoje.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {sortedAgenda.map((a) => (
                                <div key={a.id} className="flex items-start gap-3 p-3.5 rounded-card bg-surface-2 border border-line">
                                    <div className="p-2 rounded-lg bg-surface border border-line text-brand shrink-0">
                                        {TYPE_ICONS[a.type?.toLowerCase()] ?? <ActivityIcon className="w-4 h-4" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-ink-2">{a.time || '—'}</p>
                                        <p className="text-sm font-bold text-ink truncate">{a.type}{a.owner ? ` · ${a.owner}` : ''}</p>
                                        {a.observations && (
                                            <p className="text-xs text-ink-2 mt-0.5 line-clamp-2">{a.observations}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <ClockCalendarWidget />

                <LiveStatsWidget />

            </div>
        </div>
    );
}
