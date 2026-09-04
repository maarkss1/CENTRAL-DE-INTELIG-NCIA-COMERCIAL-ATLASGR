import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Radar,
  KanbanSquare,
  TrendingUp,
  Handshake,
  Clock,
  Phone,
  Mail,
  MessageCircle,
  Users,
  MapPin,
  RefreshCw,
  CheckSquare,
  Activity as ActivityIcon,
  AlertTriangle,
} from 'lucide-react';
import { ClockCalendarWidget } from '../../../components/ui/ClockCalendarWidget';
import { LiveStatsWidget } from '../../../components/ui/LiveStatsWidget';
import { useBrand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useAnalytics, useActivities, useAnalyticsDashboard } from '../../../hooks/useDatabase';
import { staggerContainer, staggerItem } from '../../../lib/motion';
import { SoundFX } from '../../../lib/soundEffects';
import { RealtimeFeed } from './RealtimeFeed';
import { GlowChart } from '../../analytics/components/GlowChart';
import { TeamRankingWidget } from './TeamRankingWidget';
import { SellerCoachingCard } from './SellerCoachingCard';
import { AiGatewayShowcase } from './AiGatewayShowcase';
import { DeferredRevenueSignalOrb } from './DeferredRevenueSignalOrb';

const TYPE_ICONS: Record<string, React.JSX.Element> = {
  ligação: <Phone className="w-4 h-4" />,
  'e-mail': <Mail className="w-4 h-4" />,
  whatsapp: <MessageCircle className="w-4 h-4" />,
  reunião: <Users className="w-4 h-4" />,
  visita: <MapPin className="w-4 h-4" />,
  'follow-up': <RefreshCw className="w-4 h-4" />,
  tarefa: <CheckSquare className="w-4 h-4" />,
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
  const { currentUser, isAdmin } = useAuth();
  const isAtlas = activeBrand === 'atlasgr';

  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useAnalytics();

  const {
    data: dashboard,
    loading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useAnalyticsDashboard(6);

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const {
    activities: todayActivities,
    loading: agendaLoading,
    error: agendaError,
    refetch: refetchAgenda,
  } = useActivities({ from: today, to: tomorrow, limit: 20 });
  const sortedAgenda = [...todayActivities].sort((a, b) =>
    (a.time || '').localeCompare(b.time || ''),
  );

  const todayLabel = new Date()
    .toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    .toUpperCase();

  const kpis = [
    {
      label: 'Leads Qualificados',
      value: stats ? stats.totalLeads.toLocaleString('pt-BR') : '—',
      icon: <Radar className="w-5 h-5" />,
      hint: 'base qualificada',
    },
    {
      label: 'Taxa de Conversão',
      value: stats ? `${stats.conversionRate.toFixed(1)}%` : '—',
      icon: <Handshake className="w-5 h-5" />,
      hint: 'eficiência do funil',
    },
    {
      label: 'Atividades Pendentes',
      value: stats ? stats.pendingActivities.toLocaleString('pt-BR') : '—',
      icon: <TrendingUp className="w-5 h-5" />,
      hint: 'pressão operacional',
    },
    {
      label: 'Fechados no Mês',
      value: stats ? stats.closedThisMonth.toLocaleString('pt-BR') : '—',
      icon: <Clock className="w-5 h-5" />,
      hint: 'resultado atual',
    },
  ];

  const goTo = (path: string) => {
    SoundFX.play('navigate');
    navigate(path);
  };

  return (
    <div className="relative flex min-h-screen flex-1 flex-col items-center overflow-y-auto bg-transparent p-4 font-sans md:p-8">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className={`absolute left-[18%] top-[-11rem] h-80 w-80 rounded-full blur-[110px] ${
            isAtlas ? 'bg-brand/10' : 'bg-brand-2/10'
          }`}
        />
      </div>

      <div className="relative z-[1] w-full max-w-[92rem] space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div data-testid="dashboard-greeting">
            <p className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-brand-active dark:text-brand-2">
              {todayLabel}
            </p>
            <h1 className="text-2xl font-black tracking-tight text-ink md:text-3xl">
              {greeting()}, {currentUser?.name?.split(' ')[0] || 'Usuário'}
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              Resumo comercial de hoje · marca ativa: {isAtlas ? 'AtlasGR' : 'Total Trac'}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <motion.button
              type="button"
              onClick={() => goTo('/app/prospect')}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0, scale: 0.985 }}
              className="group flex cursor-pointer items-center gap-2 rounded-xl border border-brand/25 bg-brand-active px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_34px_-20px_color-mix(in_srgb,var(--brand)_70%,transparent),inset_0_1px_0_rgba(255,255,255,0.18)]"
            >
              <Radar className="h-4 w-4 transition-transform duration-200 group-hover:rotate-6 group-hover:scale-110" />
              Nova varredura
            </motion.button>
            <motion.button
              type="button"
              onClick={() => goTo('/app/crm')}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0, scale: 0.985 }}
              className="group flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-bold text-ink shadow-card transition-colors hover:border-brand/30 hover:bg-surface-2"
            >
              <KanbanSquare className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              Abrir pipeline
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.8fr)] xl:items-stretch">
          <GlowChart data={dashboard?.monthly ?? []} error={dashboardError} />

          {statsError ? (
            <div className="flex min-h-[16rem] flex-col justify-between rounded-[1.6rem] border border-critical/25 bg-critical/10 p-5 shadow-card">
              <div className="flex items-start gap-3 text-sm text-critical">
                <div className="rounded-xl border border-critical/20 bg-critical/10 p-2.5">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black text-ink">Métricas indisponíveis</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">
                    Não foi possível carregar o Signal Core e os indicadores de operação.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => refetchStats()}
                className="self-start text-xs font-bold text-critical hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          ) : statsLoading || !stats ? (
            <div className="min-h-[16rem] animate-pulse rounded-[1.6rem] border border-line bg-surface-2/60 shadow-card" />
          ) : (
            <DeferredRevenueSignalOrb
              conversionRate={stats.conversionRate}
              pendingActivities={stats.pendingActivities}
              closedThisMonth={stats.closedThisMonth}
            />
          )}
        </div>

        {!statsError && (
          <motion.div
            variants={staggerContainer()}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {kpis.map((kpi, index) => (
              <motion.div
                key={kpi.label}
                variants={staggerItem}
                whileHover={{ y: -4, scale: 1.012 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                className="group relative overflow-hidden rounded-[1.35rem] border border-line bg-surface p-4 shadow-[0_22px_45px_-34px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                <div
                  aria-hidden="true"
                  className={`absolute -right-10 -top-10 h-24 w-24 rounded-full blur-[36px] opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${
                    index % 2 === 0 ? 'bg-brand/18' : 'bg-brand-2/16'
                  }`}
                />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand/15 bg-soft text-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105">
                    {kpi.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-black leading-tight text-ink [font-variant-numeric:tabular-nums]">
                      {statsLoading ? '—' : kpi.value}
                    </p>
                    <p className="truncate text-[10px] font-extrabold uppercase tracking-wide text-ink-2">
                      {kpi.label}
                    </p>
                    <p className="mt-0.5 hidden text-[10px] text-ink-2/80 sm:block">{kpi.hint}</p>
                  </div>
                </div>
                <div className="absolute inset-x-5 bottom-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-brand/55 to-transparent transition-transform duration-300 group-hover:scale-x-100" />
              </motion.div>
            ))}
          </motion.div>
        )}

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <RealtimeFeed />

          <div className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-[0_24px_55px_-40px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.055)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-active dark:text-brand-2">
                  Próximos movimentos
                </p>
                <h3 className="mt-1 text-sm font-black text-ink">Agenda de hoje</h3>
              </div>
              <button
                type="button"
                onClick={() => goTo('/app/activities')}
                className="text-xs font-bold text-brand-active hover:underline dark:text-brand-2"
              >
                Ver agenda completa
              </button>
            </div>

            {agendaLoading ? (
              <p className="text-sm text-ink-2">Carregando compromissos...</p>
            ) : agendaError ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-sm text-critical">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Não foi possível carregar a agenda de hoje.
                </div>
                <button
                  type="button"
                  onClick={() => refetchAgenda()}
                  className="shrink-0 text-xs font-bold text-critical hover:underline"
                >
                  Tentar novamente
                </button>
              </div>
            ) : sortedAgenda.length === 0 ? (
              <p className="text-sm text-ink-2">Nenhum compromisso agendado para hoje.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {sortedAgenda.map((a) => (
                  <div
                    key={a.id}
                    className="group flex items-start gap-3 rounded-xl border border-line bg-surface-2/75 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-card"
                  >
                    <div className="shrink-0 rounded-lg border border-line bg-surface p-2 text-brand shadow-sm transition-transform duration-200 group-hover:scale-105">
                      {TYPE_ICONS[a.type?.toLowerCase()] ?? <ActivityIcon className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-ink-2 [font-variant-numeric:tabular-nums]">
                        {a.time || '—'}
                      </p>
                      <p className="truncate text-sm font-bold text-ink">
                        {a.type}
                        {a.owner ? ` · ${a.owner}` : ''}
                      </p>
                      {a.observations && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{a.observations}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <TeamRankingWidget
          byOwner={dashboard?.byOwner ?? []}
          currentUserName={currentUser?.name}
          loading={dashboardLoading}
          error={dashboardError}
          onRetry={refetchDashboard}
        />

        <SellerCoachingCard />

        {isAdmin && <AiGatewayShowcase />}

        <ClockCalendarWidget />

        <LiveStatsWidget />
      </div>
    </div>
  );
}
