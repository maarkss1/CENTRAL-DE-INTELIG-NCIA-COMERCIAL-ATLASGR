import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar, CheckCircle2, Clock, Phone, Mail, MessageCircle, Users,
  MapPin, RefreshCw, CheckSquare, Activity as ActivityIcon, Plus,
  Search, Trash2, Loader2, X, Save, AlertCircle
} from 'lucide-react';
import { useActivities } from '../../../hooks/useDatabase';
import { Activity } from '../../../types';
import { toast } from '../../../lib/toast';
import { clientLogger } from '../../../lib/clientLogger';
import type { PaletteIntent } from '../../../lib/paletteIntent';
import React from 'react';

const TYPE_ICONS: Record<string, React.JSX.Element> = {
  'ligação': <Phone className="w-4 h-4" />,
  'e-mail': <Mail className="w-4 h-4" />,
  'whatsapp': <MessageCircle className="w-4 h-4" />,
  'reunião': <Users className="w-4 h-4" />,
  'visita': <MapPin className="w-4 h-4" />,
  'follow-up': <RefreshCw className="w-4 h-4" />,
  'tarefa': <CheckSquare className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  'ligação': 'bg-blue-100 text-blue-700 border-blue-200',
  'e-mail': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'whatsapp': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'reunião': 'bg-violet-100 text-violet-700 border-violet-200',
  'visita': 'bg-amber-100 text-amber-700 border-amber-200',
  'follow-up': 'bg-sky-100 text-sky-700 border-sky-200',
  'tarefa': 'bg-rose-100 text-rose-700 border-rose-200',
};

const STATUS_STYLES: Record<string, string> = {
  'pending': 'bg-amber-100 text-amber-700 border-amber-200',
  'done': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'cancelled': 'bg-surface-2 text-ink-2 border-line',
  // pt-BR variants
  'Pendente': 'bg-amber-100 text-amber-700 border-amber-200',
  'Concluída': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Cancelada': 'bg-surface-2 text-ink-2 border-line',
};

const ACTIVITY_TYPES = ['Ligação', 'E-mail', 'WhatsApp', 'Reunião', 'Visita', 'Follow-up', 'Tarefa'];

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

export function ActivityList() {
  const { activities, loading, error, refetch, createActivity, updateActivity, deleteActivity } = useActivities({ limit: 50 });

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Se o Command Palette navegou aqui pedindo "Nova atividade", abre o formulário direto.
  // Limpa o state em seguida (replace) pra um F5 nesta tela não reabrir o formulário sozinho.
  useEffect(() => {
    const intent = location.state as PaletteIntent | null;
    if (intent?.type === 'open-create') {
      setIsFormOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState<NewActivityForm>({
    type: 'Ligação',
    date: new Date().toISOString().split('T')[0],
    time: '',
    owner: '',
    observations: '',
    leadId: '',
  });

  const filtered = activities.filter((a) => {
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

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta atividade?')) return;
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
    setIsSaving(true);
    try {
      await createActivity({
        type: form.type as import('../../../lib/zod').ActivityType,
        date: form.date,
        time: form.time || null,
        owner: form.owner,
        observations: form.observations || null,
        leadId: form.leadId || undefined,
        status: 'Pendente' as import('../../../lib/zod').ActivityStatus,
      });
      setIsFormOpen(false);
      setForm({ type: 'Ligação', date: new Date().toISOString().split('T')[0], time: '', owner: '', observations: '', leadId: '' });
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-ink tracking-tight">📅 Agenda de Atividades</h1>
            <p className="text-xs text-ink-2 mt-0.5 font-medium">
              {loading ? 'Carregando...' : `${filtered.length} atividade${filtered.length !== 1 ? 's' : ''} encontrada${filtered.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-ink-2 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por tipo, responsável..."
                className="bg-surface backdrop-blur-xl border border-line rounded-2xl pl-10 pr-4 py-2.5 text-xs text-ink font-semibold focus:ring-2 focus:ring-brand focus:outline-none shadow-md w-56"
              />
            </div>

            {/* Nova Atividade */}
            <button
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-brand to-amber-500 text-white font-black text-xs px-5 py-2.5 rounded-2xl shadow-lg shadow-brand/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nova Atividade
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-700 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
            <button onClick={refetch} className="ml-auto text-xs underline cursor-pointer">Tentar novamente</button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
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
            <p className="text-xs text-ink-2">Clique em &quot;Nova Atividade&quot; para começar a agendar compromissos.</p>
            <button
              onClick={() => setIsFormOpen(true)}
              className="mt-2 flex items-center gap-2 bg-brand text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
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
                ? new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
                : '—';

              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`bg-surface backdrop-blur-2xl rounded-[1.75rem] border border-line shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_50px_rgba(0,0,0,0.12)] transition-all duration-300 p-6 flex flex-col justify-between space-y-4 ${isDone ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex items-center gap-1.5 text-[11px] font-black px-3 py-1 rounded-full border ${typeColor}`}>
                      {typeIcon} {a.type}
                    </span>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusStyle}`}>
                      {isDone ? 'Concluída' : (a.status === 'Cancelada') ? 'Cancelada' : 'Pendente'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-ink-2 font-semibold">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formattedDate}</span>
                      {a.time && <><Clock className="w-3.5 h-3.5 ml-1" /><span>{a.time}</span></>}
                    </div>
                    {a.owner && (
                      <p className="text-xs text-ink-2 font-bold">👤 {a.owner}</p>
                    )}
                    {a.observations && (
                      <p className="text-xs text-ink-2 font-medium leading-relaxed line-clamp-2">{a.observations}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-line">
                    <button
                      onClick={() => handleToggleStatus(a)}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-extrabold py-2 rounded-xl border transition-all cursor-pointer ${
                        isDone
                          ? 'bg-surface-2 text-ink-2 border-line hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isDone ? 'Reabrir' : 'Marcar Concluída'}
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="p-2 rounded-xl bg-red-50 text-red-400 border border-red-100 hover:bg-red-100 hover:text-red-600 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

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
              <button onClick={() => setIsFormOpen(false)} className="p-2 rounded-xl bg-surface-2 hover:bg-line cursor-pointer transition-all">
                <X className="w-4 h-4 text-ink-2" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-ink-2 uppercase mb-1">Tipo de Atividade</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                >
                  {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-ink-2 uppercase mb-1">Data</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-ink-2 uppercase mb-1">Hora (opcional)</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-ink-2 uppercase mb-1">Responsável</label>
                <input
                  type="text"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  placeholder="Nome do responsável"
                  className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-ink-2 uppercase mb-1">Observações</label>
                <textarea
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
                className="w-full bg-gradient-to-r from-brand to-amber-500 text-white font-extrabold py-3.5 rounded-2xl text-xs shadow-lg shadow-brand/30 hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? 'Salvando...' : 'Salvar Atividade'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
