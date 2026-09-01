import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  MessageCircle,
  Users,
  MapPin,
  RefreshCw,
  CheckSquare,
  Activity as ActivityIcon,
  Plus,
  Search,
  Trash2,
  Loader2,
  X,
  Save,
  AlertCircle,
  Sparkles,
  Moon,
  Download,
} from 'lucide-react';
import { useActivities } from '../../../hooks/useDatabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { Activity, Lead } from '../../../types';
import { api, downloadFile } from '../../../lib/api';
import { leadsDB } from '../../../lib/db';
import { toast } from '../../../lib/toast';
import { clientLogger } from '../../../lib/clientLogger';
import type { PaletteIntent } from '../../../lib/paletteIntent';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialog';
import type React from 'react';

const TYPE_ICONS: Record<string, React.JSX.Element> = {
  ligação: <Phone className="w-4 h-4" />,
  'e-mail': <Mail className="w-4 h-4" />,
  whatsapp: <MessageCircle className="w-4 h-4" />,
  reunião: <Users className="w-4 h-4" />,
  visita: <MapPin className="w-4 h-4" />,
  'follow-up': <RefreshCw className="w-4 h-4" />,
  tarefa: <CheckSquare className="w-4 h-4" />,
};

// Sete cores categóricas (uma por tipo de atividade) — precisam de mais distinções do que os
// tokens semânticos do projeto (success/warning/danger/info) cobrem, então usam a paleta padrão do
// Tailwind, mas cada uma precisa do par `dark:` que faltava (achado do Piloto 015): sem isso, os
// badges ficavam com fundo claro sólido sobre o app em tema escuro.
const TYPE_COLORS: Record<string, string> = {
  ligação:
    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900',
  'e-mail':
    'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900',
  whatsapp:
    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
  reunião:
    'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900',
  visita:
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  'follow-up':
    'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900',
  tarefa:
    'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900',
};

// Status tem significado semântico direto (pendente=alerta, concluída=sucesso) — usa os tokens do
// projeto em vez de cor categórica própria, alinhado ao mesmo badge já corrigido em
// CompanyDetail.tsx (Piloto 014).
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-warning/10 text-warning-active dark:text-warning border-warning/20',
  done: 'bg-success/10 text-emerald-700 dark:text-success border-success/20',
  cancelled: 'bg-surface-2 text-ink-2 border-line',
  // pt-BR variants
  Pendente: 'bg-warning/10 text-warning-active dark:text-warning border-warning/20',
  Concluída: 'bg-success/10 text-emerald-700 dark:text-success border-success/20',
  Cancelada: 'bg-surface-2 text-ink-2 border-line',
};

const ACTIVITY_TYPES = [
  'Ligação',
  'E-mail',
  'WhatsApp',
  'Reunião',
  'Visita',
  'Follow-up',
  'Tarefa',
];

interface FollowUpTemplate {
  id: string;
  title: string;
  type: string;
  defaultTime: string;
  description: string;
  suggestedOffsetDays: number;
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-[1.75rem] border border-line p-6 animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-surface-2 rounded-full w-24" />
        <div className="h-5 bg-surface-2 rounded-full w-20" />
      </div>
      <div className="h-3 bg-surface-2 rounded-full w-40 mt-1" />
      <div className="h-10 bg-surface-2 rounded-2xl w-full mt-2" />
      <div className="flex gap-2 mt-3">
        <div className="h-8 bg-surface-2 rounded-xl flex-1" />
        <div className="h-8 bg-surface-2 rounded-xl w-10" />
      </div>
    </div>
  );
}

interface NewActivityForm {
  type: string;
  date: string;
  time: string;
  owner: string;
  observations: string;
  leadId: string;
}

function leadLabel(lead: Lead): string {
  const company = lead.company?.tradeName || lead.company?.legalName;
  return [lead.title || 'Negócio sem título', company].filter(Boolean).join(' — ');
}

export function ActivityList() {
  const { activities, loading, error, refetch, createActivity, updateActivity, deleteActivity } =
    useActivities({ limit: 100 });
  const { currentUser } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMineOnly, setFilterMineOnly] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [templates, setTemplates] = useState<FollowUpTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirmDialog();

  // GET /api/activities/templates já existia (ActivityUseCases.getFollowUpTemplates), testado, mas
  // sem nenhum consumidor de UI — esta tela duplicava a mesma lista como constante local, já
  // divergente em um dos textos (achado do Piloto 015). Busca sob demanda, na abertura do modal.
  useEffect(() => {
    if (!isTemplatesOpen || templates.length > 0) return;
    setTemplatesLoading(true);
    api
      .get<FollowUpTemplate[]>('/api/activities/templates')
      .then(setTemplates)
      .catch(() => toast.error('Falha ao carregar os modelos de follow-up.'))
      .finally(() => setTemplatesLoading(false));
  }, [isTemplatesOpen, templates.length]);

  // Busca de Lead para vincular a atividade — leadId é obrigatório no schema (FK não-nula), mas o
  // formulário nunca tinha um campo para preenchê-lo: toda submissão daqui sempre falhava na
  // validação Zod (`leadId: z.string()`) antes mesmo de chegar no banco. Achado real do Piloto 015
  // — a única tela de criação de atividade do app inteiro estava, na prática, impossível de usar.
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (!isFormOpen || selectedLead || !leadSearch.trim()) {
      setLeadResults([]);
      return;
    }
    let cancelled = false;
    setLeadSearchLoading(true);
    const timer = window.setTimeout(() => {
      leadsDB
        .list({ search: leadSearch, limit: 8 })
        .then((res) => {
          if (!cancelled) setLeadResults(res.data);
        })
        .catch(() => {
          if (!cancelled) setLeadResults([]);
        })
        .finally(() => {
          if (!cancelled) setLeadSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [leadSearch, isFormOpen, selectedLead]);

  useEffect(() => {
    const intent = location.state as PaletteIntent | null;
    if (intent?.type === 'open-create') {
      setIsFormOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const [form, setForm] = useState<NewActivityForm>({
    type: 'Ligação',
    date: new Date().toISOString().split('T')[0],
    time: '',
    owner: currentUser?.name || '',
    observations: '',
    leadId: '',
  });

  const filtered = activities.filter((a) => {
    if (filterMineOnly && currentUser?.name) {
      if (a.owner?.toLowerCase() !== currentUser.name.toLowerCase()) return false;
    }
    const q = searchTerm.toLowerCase();
    return (
      !q ||
      a.owner?.toLowerCase().includes(q) ||
      a.type?.toLowerCase().includes(q) ||
      a.observations?.toLowerCase().includes(q)
    );
  });

  const handleToggleStatus = async (a: Activity) => {
    const isDone = a.status === 'Concluída';
    await updateActivity(a.id, { status: isDone ? 'Pendente' : 'Concluída' });
  };

  const handleSnooze = async (activityId: string, duration: '2h' | 'tomorrow' | 'next_week') => {
    try {
      await api.post(`/api/activities/${activityId}/snooze`, { duration });
      toast.success(
        duration === '2h'
          ? '⏰ Atividade adiada em +2 horas!'
          : duration === 'tomorrow'
            ? '⏰ Atividade adiada para amanhã às 09:00!'
            : '⏰ Atividade adiada para a próxima semana!',
      );
      refetch();
    } catch {
      toast.error('Erro ao adiar atividade');
    }
  };

  const handleApplyTemplate = (tpl: FollowUpTemplate) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + tpl.suggestedOffsetDays);
    setForm({
      type: tpl.type,
      date: targetDate.toISOString().split('T')[0],
      time: tpl.defaultTime,
      owner: currentUser?.name || form.owner,
      observations: `[${tpl.title}] ${tpl.description}`,
      leadId: '',
    });
    setSelectedLead(null);
    setLeadSearch('');
    setIsTemplatesOpen(false);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: 'Excluir atividade',
        description: 'Excluir esta atividade?',
        confirmLabel: 'Excluir',
        variant: 'danger',
      }))
    )
      return;
    try {
      await deleteActivity(id);
      toast.success('Atividade excluída.');
    } catch (error) {
      clientLogger.error({ err: error }, 'Error deleting activity');
      toast.error(error instanceof Error ? error.message : 'Falha ao excluir a atividade.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.leadId) {
      toast.error('Selecione o negócio ao qual esta atividade pertence.');
      return;
    }
    setIsSaving(true);
    try {
      await createActivity({
        type: form.type as import('../../../lib/zod').ActivityType,
        date: form.date,
        time: form.time || null,
        owner: form.owner || currentUser?.name || 'Vendedor',
        observations: form.observations || null,
        leadId: form.leadId,
        status: 'Pendente' as import('../../../lib/zod').ActivityStatus,
      });
      setIsFormOpen(false);
      setForm({
        type: 'Ligação',
        date: new Date().toISOString().split('T')[0],
        time: '',
        owner: currentUser?.name || '',
        observations: '',
        leadId: '',
      });
      setSelectedLead(null);
      setLeadSearch('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 overflow-y-auto bg-transparent p-6 md:p-8"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface/75 backdrop-blur-xl p-6 rounded-3xl border border-line">
          <div>
            <h1 className="text-2xl font-black text-ink tracking-tight">📅 Agenda & Tarefas</h1>
            <p className="text-xs text-ink-2 mt-0.5 font-medium">
              {loading
                ? 'Carregando compromissos...'
                : `${filtered.length} atividade${filtered.length !== 1 ? 's' : ''} no funil`}
            </p>

            {/* Filtro por Vendedor */}
            <div className="inline-flex items-center gap-1 p-1 mt-3 bg-surface-2 rounded-xl border border-line">
              <button
                type="button"
                onClick={() => setFilterMineOnly(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!filterMineOnly ? 'bg-brand-active text-white' : 'text-ink-2 hover:text-ink'}`}
              >
                Equipe Toda
              </button>
              <button
                type="button"
                onClick={() => setFilterMineOnly(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterMineOnly ? 'bg-brand-active text-white' : 'text-ink-2 hover:text-ink'}`}
              >
                Minhas Atividades {currentUser?.name ? `(${currentUser.name})` : ''}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-ink-2 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar atividades..."
                className="w-full sm:w-48 bg-surface-2 border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-ink font-semibold focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>

            {/* Templates Rápidos de Follow-up */}
            <button
              type="button"
              onClick={() => setIsTemplatesOpen(true)}
              className="flex items-center gap-1.5 bg-surface-2 hover:bg-surface-3 border border-line text-ink font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
              title="Criar atividade com templates rápidos pós-demo e negociação"
            >
              <Sparkles className="w-4 h-4 text-ink-2" />
              <span>Modelos Rápidos</span>
            </button>

            {/* Baixar Agenda (.ics) — /api/activities/feed.ics exige sessão autenticada (cookie);
                um app externo fazendo *subscribe* por URL nunca envia esse cookie, então copiar o
                link e prometer "sincronizar" funcionava só na primeira busca manual, nunca de
                verdade como assinatura periódica. Ver mesma correção em Calendar.tsx. */}
            <button
              type="button"
              onClick={() => {
                const icsUrl = `${window.location.origin}/api/activities/feed.ics${currentUser?.name ? `?owner=${encodeURIComponent(currentUser.name)}` : ''}`;
                downloadFile(icsUrl, 'agenda.ics').catch((err) => {
                  toast.error(err instanceof Error ? err.message : 'Falha ao baixar a agenda.');
                });
              }}
              className="flex items-center gap-1.5 bg-surface-2 hover:bg-surface-3 border border-line text-ink font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
              title="Baixar agenda em .ics para importar no Google Agenda / Outlook"
            >
              <Download className="w-4 h-4 text-ink-2" />
              <span>Baixar Agenda (.ics)</span>
            </button>

            {/* Nova Atividade */}
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-1.5 bg-brand-active text-white font-black text-xs px-4 py-2 rounded-xl shadow-md hover:brightness-110 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nova Atividade
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 flex items-center gap-3 text-danger-active dark:text-danger text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={refetch}
              className="ml-auto text-xs underline cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 space-y-4 text-ink-2"
          >
            <div className="w-20 h-20 rounded-full bg-surface-2 flex items-center justify-center">
              <Calendar className="w-10 h-10 text-ink-2" />
            </div>
            <p className="font-extrabold text-ink-2 text-base">Nenhuma atividade encontrada</p>
            <p className="text-xs text-ink-2">
              Clique em &quot;Nova Atividade&quot; ou use &quot;Modelos Rápidos&quot; para agendar
              tarefas pós-demo.
            </p>
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="mt-2 flex items-center gap-2 bg-brand-active text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Criar Primeira Atividade
            </button>
          </motion.div>
        )}

        {/* Activity Cards Grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((a, idx) => {
              const typeKey = a.type?.toLowerCase();
              const typeIcon = TYPE_ICONS[typeKey] ?? <ActivityIcon className="w-4 h-4" />;
              const typeColor = TYPE_COLORS[typeKey] ?? 'bg-surface-2 text-ink-2 border-line';
              const statusStyle = STATUS_STYLES[a.status] ?? 'bg-surface-2 text-ink-2 border-line';
              const isDone = a.status === 'Concluída';
              const formattedDate = a.date
                ? new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                  })
                : '—';

              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`bg-surface backdrop-blur-2xl rounded-[1.75rem] border border-line shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col justify-between space-y-3 ${isDone ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex items-center gap-1.5 text-[11px] font-black px-3 py-1 rounded-full border ${typeColor}`}
                    >
                      {typeIcon} {a.type}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusStyle}`}
                    >
                      {isDone ? 'Concluída' : a.status === 'Cancelada' ? 'Cancelada' : 'Pendente'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-ink-2 font-semibold">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formattedDate}</span>
                      {a.time && (
                        <>
                          <Clock className="w-3.5 h-3.5 ml-1" />
                          <span>{a.time}</span>
                        </>
                      )}
                    </div>
                    {a.owner && <p className="text-xs text-ink-2 font-bold">👤 {a.owner}</p>}
                    {a.observations && (
                      <p className="text-xs text-ink font-medium leading-relaxed line-clamp-3">
                        {a.observations}
                      </p>
                    )}
                  </div>

                  {/* Snooze & Status Actions */}
                  <div className="space-y-2 pt-2 border-t border-line">
                    {!isDone && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-ink-2 font-bold uppercase shrink-0 flex items-center gap-0.5">
                          <Moon className="w-3 h-3 text-brand" /> Adiar:
                        </span>
                        <div className="grid grid-cols-3 gap-1 flex-1">
                          <button
                            type="button"
                            onClick={() => handleSnooze(a.id, '2h')}
                            className="text-[10px] font-semibold py-1 px-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line text-ink transition-colors text-center"
                            title="Adiar em +2 horas"
                          >
                            +2h
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSnooze(a.id, 'tomorrow')}
                            className="text-[10px] font-semibold py-1 px-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line text-ink transition-colors text-center"
                            title="Adiar para amanhã às 09:00"
                          >
                            Amanhã
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSnooze(a.id, 'next_week')}
                            className="text-[10px] font-semibold py-1 px-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line text-ink transition-colors text-center"
                            title="Adiar para próxima semana"
                          >
                            Próx. Sem
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(a)}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-extrabold py-2 rounded-xl border transition-all cursor-pointer ${
                          isDone
                            ? 'bg-surface-2 text-ink-2 border-line hover:bg-warning/10 hover:text-warning-active dark:hover:text-warning hover:border-warning/20'
                            : 'bg-success/10 text-emerald-700 border-success/20 hover:bg-success/20 dark:text-success'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isDone ? 'Reabrir' : 'Marcar Concluída'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        aria-label="Excluir atividade"
                        className="p-2 rounded-xl bg-danger/10 text-danger-active dark:text-danger border border-danger/20 hover:bg-danger/20 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Modelos Rápidos de Follow-up */}
      {isTemplatesOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-3xl shadow-2xl border border-line w-full max-w-lg p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-ink-2" />
                <h3 className="text-base font-black text-ink">Modelos de Follow-up Comercial</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplatesOpen(false)}
                aria-label="Fechar"
                className="p-1.5 rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-ink-2">
              Selecione um roteiro pré-configurado de follow-up para preencher a atividade
              instantaneamente:
            </p>

            <div className="space-y-2.5">
              {templatesLoading ? (
                <div className="flex items-center justify-center py-8 text-ink-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="w-full text-left p-3.5 rounded-2xl bg-surface-2/50 hover:bg-brand/10 border border-line hover:border-brand transition-all cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-ink">{tpl.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-line font-bold text-ink-2">
                        {tpl.type} · +{tpl.suggestedOffsetDays}d
                      </span>
                    </div>
                    <p className="text-xs text-ink-2 leading-relaxed">{tpl.description}</p>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Nova Atividade Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-[2.5rem] shadow-2xl border border-line w-full max-w-lg p-8 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-ink">Nova Atividade</h3>
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setSelectedLead(null);
                  setLeadSearch('');
                  setForm((f) => ({ ...f, leadId: '' }));
                }}
                aria-label="Fechar"
                className="p-2 rounded-xl bg-surface-2 hover:bg-line cursor-pointer transition-all"
              >
                <X className="w-4 h-4 text-ink-2" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <label
                  htmlFor="activity-lead"
                  className="block text-[11px] font-black text-ink-2 uppercase mb-1"
                >
                  Negócio Vinculado *
                </label>
                {selectedLead ? (
                  <div className="flex items-center justify-between gap-2 bg-surface-2 border border-brand/30 rounded-2xl px-4 py-3">
                    <span className="text-xs font-bold text-ink truncate">
                      {leadLabel(selectedLead)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLead(null);
                        setForm({ ...form, leadId: '' });
                        setLeadSearch('');
                      }}
                      aria-label="Trocar negócio vinculado"
                      className="text-ink-2 hover:text-ink shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      id="activity-lead"
                      type="text"
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder="Buscar negócio por título, empresa ou contato..."
                      className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                      autoComplete="off"
                      required
                    />
                    {leadSearchLoading && (
                      <div className="absolute right-3 top-9">
                        <Loader2 className="w-4 h-4 animate-spin text-ink-2" />
                      </div>
                    )}
                    {leadResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-2xl shadow-xl max-h-48 overflow-y-auto">
                        {leadResults.map((lead) => (
                          <button
                            key={lead.id}
                            type="button"
                            onClick={() => {
                              setSelectedLead(lead);
                              setForm({ ...form, leadId: lead.id });
                              setLeadResults([]);
                            }}
                            className="w-full text-left px-4 py-2.5 text-xs font-semibold text-ink hover:bg-surface-2 transition-colors border-b border-line last:border-b-0"
                          >
                            {leadLabel(lead)}
                          </button>
                        ))}
                      </div>
                    )}
                    {!leadSearchLoading &&
                      leadSearch.trim().length > 0 &&
                      leadResults.length === 0 && (
                        <p className="text-[11px] text-ink-2 mt-1">
                          Nenhum negócio encontrado para &quot;{leadSearch}&quot;.
                        </p>
                      )}
                  </>
                )}
              </div>

              <div>
                <label
                  htmlFor="activity-type"
                  className="block text-[11px] font-black text-ink-2 uppercase mb-1"
                >
                  Tipo de Atividade
                </label>
                <select
                  id="activity-type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="activity-date"
                    className="block text-[11px] font-black text-ink-2 uppercase mb-1"
                  >
                    Data
                  </label>
                  <input
                    id="activity-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="activity-time"
                    className="block text-[11px] font-black text-ink-2 uppercase mb-1"
                  >
                    Hora (opcional)
                  </label>
                  <input
                    id="activity-time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="activity-owner"
                  className="block text-[11px] font-black text-ink-2 uppercase mb-1"
                >
                  Responsável
                </label>
                <input
                  id="activity-owner"
                  type="text"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  placeholder="Nome do responsável"
                  className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="activity-observations"
                  className="block text-[11px] font-black text-ink-2 uppercase mb-1"
                >
                  Observações
                </label>
                <textarea
                  id="activity-observations"
                  value={form.observations}
                  onChange={(e) => setForm({ ...form, observations: e.target.value })}
                  placeholder="Detalhes da atividade..."
                  rows={3}
                  className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full bg-gradient-to-r from-brand to-brand-2 text-white font-extrabold py-3.5 rounded-2xl text-xs shadow-lg shadow-brand/30 hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isSaving ? 'Salvando...' : 'Salvar Atividade'}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {dialog}
    </motion.div>
  );
}
