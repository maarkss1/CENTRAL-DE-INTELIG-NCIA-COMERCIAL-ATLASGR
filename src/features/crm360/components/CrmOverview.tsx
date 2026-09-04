import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  FileClock,
  Gauge,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { clientLogger } from '../../../lib/clientLogger';
import type { CrmOverviewData } from '../crm360.types';

interface CrmOverviewProps {
  /**
   * `tab` vira `/app/${tab}` em `App.tsx` (`handleCrmOverviewNavigate`) — precisa ser um path
   * real de `src/App.tsx`/um `TabType` de `tabMeta.ts`, nunca um id inventado só para esta tela.
   * Onda 8: os 4 botões deste componente chamavam `onNavigate('foco')`/`onNavigate('negocios')`,
   * ids que nunca existiram em nenhuma rota nem em `TabType` — o catch-all de `App.tsx`
   * (`<Route path="*" element={<Navigate to="/app" replace />} />`) redirecionava silenciosamente
   * de volta ao dashboard, sem erro visível (botão "funcionava" mas levava a lugar nenhum).
   * Corrigido para `'activities'` (Agenda/Foco — mesma tela que já lista as atividades vencidas
   * usadas em `data.focusActivities`) e `'crm?funnel=Negocio'` (Pipeline de Negócios — mesmo
   * `CrmBoard` já usado no menu principal, no funil correto via query param).
   */
  onNavigate: (tab: string) => void;
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  intent = 'brand',
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Target;
  intent?: 'brand' | 'success' | 'warning' | 'violet';
}) {
  const styles = {
    brand: 'bg-info/10 text-info-active dark:text-info border-info/20',
    success: 'bg-success/10 text-success-active dark:text-success border-success/20',
    warning: 'bg-warning/10 text-warning-active dark:text-warning border-warning/20',
    violet:
      'bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/20',
  };
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-2">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-ink">{value}</p>
          <p className="mt-1 text-xs text-ink-2">{detail}</p>
        </div>
        <span className={`rounded-xl border p-2.5 ${styles[intent]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

export function CrmOverview({ onNavigate }: CrmOverviewProps) {
  const [data, setData] = useState<CrmOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<CrmOverviewData>('/api/crm/overview'));
    } catch (err) {
      clientLogger.error({ err }, 'Failed to load CRM overview');
      setError(err instanceof Error ? err.message : 'Falha ao carregar o cockpit do CRM.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const insight = useMemo(() => {
    if (!data) return '';
    if (data.kpis.overdueActivities > 0)
      return `${data.kpis.overdueActivities} atividade(s) vencida(s) precisam de ação imediata para proteger o pipeline.`;
    if (data.kpis.openDeals > 0 && data.kpis.weightedPipeline < data.kpis.pipelineValue * 0.35)
      return 'A cobertura existe, mas a probabilidade ponderada está baixa. Priorize qualificação e próximos passos definidos.';
    if (data.kpis.openDeals === 0)
      return 'O pipeline de negócios está vazio. Converta os leads qualificados e distribua-os para o BDR/Closer.';
    return 'A operação está saudável. O melhor próximo movimento é acelerar propostas abertas e manter todas as contas com atividade futura.';
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="m-6 rounded-2xl border border-danger/20 bg-danger/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-danger-active dark:text-danger" />
        <p className="mt-3 font-bold text-ink">Cockpit indisponível</p>
        <p className="mt-1 text-sm text-ink-2">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-4 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-bg"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;
  const maxStage = Math.max(...data.stageCounts.map((stage) => stage.count), 1);

  return (
    <div className="space-y-5 p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-ink">
            Cockpit comercial em tempo real
          </h2>
          <p className="text-sm text-ink-2">
            Receita, conversão, atividades e prioridades em uma única visão.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-2 hover:text-ink disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Leads"
          value={String(data.kpis.leads)}
          detail="base de pré-vendas"
          icon={Users}
        />
        <KpiCard
          label="Negócios abertos"
          value={String(data.kpis.openDeals)}
          detail={money.format(data.kpis.pipelineValue)}
          icon={Target}
          intent="violet"
        />
        <KpiCard
          label="Pipeline ponderado"
          value={money.format(data.kpis.weightedPipeline)}
          detail="valor × probabilidade"
          icon={Gauge}
          intent="warning"
        />
        <KpiCard
          label="Conversão"
          value={`${data.kpis.conversionRate}%`}
          detail={`${data.kpis.wonDeals} ganhos · ${data.kpis.lostDeals} perdidos`}
          icon={Trophy}
          intent="success"
        />
        <KpiCard
          label="Atividades críticas"
          value={String(data.kpis.overdueActivities)}
          detail={`${data.kpis.todayActivities} para hoje`}
          icon={CalendarClock}
          intent={data.kpis.overdueActivities > 0 ? 'warning' : 'success'}
        />
      </section>

      <section className="rounded-2xl border border-info/20 bg-gradient-to-r from-info/10 via-brand/5 to-transparent p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-info-active p-2 text-white">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-info-active dark:text-info">
              Radar de IA · próxima melhor ação
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink">{insight}</p>
          </div>
          <button
            onClick={() => onNavigate('activities')}
            className="hidden items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-info-active dark:text-info hover:bg-info/10 sm:flex"
          >
            Abrir foco <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-black text-ink">Funil consolidado</h3>
              <p className="text-xs text-ink-2">Volume e valor por etapa</p>
            </div>
            <TrendingUp className="h-5 w-5 text-brand" />
          </div>
          <div className="space-y-3">
            {data.stageCounts.map((stage) => (
              <div key={`${stage.funnel}-${stage.status}`}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-ink">{stage.status}</span>
                  <span className="shrink-0 text-ink-2">
                    {stage.count} · {money.format(stage.amount)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${stage.funnel === 'Negocio' ? 'bg-violet-500 dark:bg-violet-400' : 'bg-info'}`}
                    style={{ width: `${Math.max(5, (stage.count / maxStage) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {data.stageCounts.length === 0 && (
              <p className="py-10 text-center text-sm text-ink-2">
                O funil começa a aparecer quando os primeiros registros forem criados.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-black text-ink">Foco agora</h3>
              <p className="text-xs text-ink-2">Próximas atividades por vencimento</p>
            </div>
            <button
              onClick={() => onNavigate('activities')}
              className="text-xs font-bold text-brand-active dark:text-brand-2"
            >
              Ver tudo
            </button>
          </div>
          <div className="divide-y divide-line">
            {data.focusActivities.slice(0, 6).map((activity) => {
              const overdue = new Date(activity.date) < new Date(new Date().setHours(0, 0, 0, 0));
              return (
                <div key={activity.id} className="flex items-center gap-3 py-3">
                  <span
                    className={`rounded-lg p-2 ${overdue ? 'bg-danger/10 text-danger-active dark:text-danger' : 'bg-info/10 text-info-active dark:text-info'}`}
                  >
                    <Activity className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {activity.lead?.company?.tradeName ||
                        activity.lead?.contact?.name ||
                        activity.type}
                    </p>
                    <p className="truncate text-xs text-ink-2">
                      {activity.type} · {new Date(activity.date).toLocaleDateString('pt-BR')}{' '}
                      {activity.time || ''}
                    </p>
                  </div>
                  {overdue ? (
                    <AlertTriangle className="h-4 w-4 text-danger-active dark:text-danger" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success-active dark:text-success" />
                  )}
                </div>
              );
            })}
            {data.focusActivities.length === 0 && (
              <p className="py-10 text-center text-sm text-ink-2">Nenhuma atividade pendente.</p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-black text-ink">Negócios recentes</h3>
            <p className="text-xs text-ink-2">Últimas contas movimentadas</p>
          </div>
          <button
            onClick={() => onNavigate('crm?funnel=Negocio')}
            className="text-xs font-bold text-brand-active dark:text-brand-2"
          >
            Abrir pipeline
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.recentDeals.map((deal) => (
            <article key={deal.id} className="rounded-xl border border-line bg-surface-2/50 p-3">
              <p className="truncate text-sm font-black text-ink">
                {deal.title || deal.company?.tradeName || 'Negócio sem título'}
              </p>
              <p className="mt-1 truncate text-xs text-ink-2">{deal.status}</p>
              <div className="mt-3 flex items-end justify-between gap-2">
                <span className="font-black text-ink">{money.format(deal.amount ?? 0)}</span>
                <span className="text-xs font-bold text-brand-active dark:text-brand-2">
                  {deal.probability ?? 0}%
                </span>
              </div>
            </article>
          ))}
          {data.recentDeals.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-ink-2">
              Nenhum negócio criado ainda.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* "Documentos comerciais" ligado de verdade em 2026-09-04 (finalização de release):
            /app/propostas (PropostasList.tsx) já existe, é uma tela real com CRUD funcional de
            CrmCommercialDocument — só nunca tinha sido conectada aqui, deixando o card como uma
            nota inerte mesmo com o destino pronto. onNavigate('propostas') mapeia para essa rota
            (ver App.tsx, handleCrmOverviewNavigate).

            "Saúde do CRM" continua como card informativo, não botão: não existe hoje nenhuma tela
            de configuração de pipelines/etapas no app (grep confirmado) — ligar a um destino
            inexistente reintroduziria a mesma promessa falsa que este card já evitava. Ver
            CLAUDE.md seção 6 (preservar conteúdo real, nunca prometer o que não existe). */}
        <button
          type="button"
          onClick={() => onNavigate('propostas')}
          className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 text-left hover:border-brand/40"
        >
          <span>
            <strong className="block text-ink">Documentos comerciais</strong>
            <small className="text-ink-2">{data.kpis.pendingDocuments} em aberto</small>
          </span>
          <FileClock className="h-5 w-5 text-brand" />
        </button>
        <button
          onClick={() => onNavigate('activities')}
          className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 text-left hover:border-brand/40"
        >
          <span>
            <strong className="block text-ink">Agenda inteligente</strong>
            <small className="text-ink-2">{data.kpis.todayActivities} compromissos hoje</small>
          </span>
          <CalendarClock className="h-5 w-5 text-brand" />
        </button>
        <div
          className="flex items-center justify-between rounded-2xl border border-line border-dashed bg-surface p-4 text-left opacity-80"
          role="note"
          aria-label="Saúde do CRM — configuração de pipelines ainda não disponível"
        >
          <span>
            <strong className="block text-ink">Saúde do CRM</strong>
            <small className="text-ink-2">
              Pipelines e etapas · configuração ainda não disponível
            </small>
          </span>
          <Gauge className="h-5 w-5 text-ink-2" />
        </div>
      </div>
    </div>
  );
}
