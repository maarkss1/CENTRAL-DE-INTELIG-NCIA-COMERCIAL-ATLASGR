import { useState, useEffect } from 'react';
import { X, Link2, Plus, Copy, Trash2, Loader2, Check, Globe } from 'lucide-react';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/toast';

interface BookingLink {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  durationMin: number;
  active: boolean;
  createdAt: string;
}

interface BookingLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BookingLinksModal({ isOpen, onClose }: BookingLinksModalProps) {
  const [links, setLinks] = useState<BookingLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: 'Demonstração de Telemetria e Rastreamento',
    slug: 'demo-atlas',
    durationMin: 30,
    description:
      'Apresentação prática da central de inteligência, telemetria CAN e redução de custos operacionais.',
  });

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res = await api.get<BookingLink[]>('/api/calendar/booking-links');
      setLinks(res);
    } catch {
      toast.error('Erro ao carregar links de agendamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLinks();
    }
  }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/api/calendar/booking-links', form);
      toast.success('Link de agendamento criado com sucesso!');
      fetchLinks();
      setForm({
        title: '',
        slug: '',
        durationMin: 30,
        description: '',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao criar link');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este link de agendamento?')) return;
    try {
      await api.delete(`/api/calendar/booking-links/${id}`);
      toast.success('Link excluído');
      fetchLinks();
    } catch {
      toast.error('Erro ao excluir link');
    }
  };

  const handleCopy = (slug: string) => {
    const fullUrl = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedSlug(slug);
    toast.success('Link público copiado! Envie para o lead no WhatsApp.');
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-line rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-line flex items-center justify-between bg-surface-2/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand/10 text-brand border border-brand/20">
              <Link2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-ink">Links Públicos de Agendamento</h3>
              <p className="text-xs text-ink-2">
                Páginas de agendamento estilo Calendly integradas diretamente à sua agenda e CRM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Formulário de Novo Link */}
          <form
            onSubmit={handleCreate}
            className="bg-surface-2/50 p-5 rounded-2xl border border-line space-y-3.5"
          >
            <h4 className="text-xs font-black uppercase text-ink-2 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-brand" /> Criar Novo Link de Agendamento
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-ink-2 mb-1">
                  Título da Reunião
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  placeholder="Ex: Call de Alinhamento"
                  className="w-full px-3 py-2 bg-surface border border-line rounded-xl text-xs text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-ink-2 mb-1">
                  Link Personalizado (/book/...)
                </label>
                <div className="flex items-center">
                  <span className="text-xs text-ink-2 bg-surface-2 px-2.5 py-2 border border-r-0 border-line rounded-l-xl">
                    /book/
                  </span>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      })
                    }
                    required
                    placeholder="reuniao-frota"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-r-xl text-xs text-ink focus:ring-2 focus:ring-brand focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-ink-2 mb-1">
                  Duração (minutos)
                </label>
                <select
                  value={form.durationMin}
                  onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-xl text-xs text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                >
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>60 minutos (1 hora)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-ink-2 mb-1">Descrição</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Explicar o objetivo da call"
                  className="w-full px-3 py-2 bg-surface border border-line rounded-xl text-xs text-ink focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-brand-active text-white rounded-xl text-xs font-bold transition-colors hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {creating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Salvar Link
              </button>
            </div>
          </form>

          {/* Lista de Links Existentes */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase text-ink-2">Meus Links Ativos</h4>

            {loading ? (
              <div className="py-8 text-center text-ink-2 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando links...
              </div>
            ) : links.length === 0 ? (
              <div className="py-8 text-center text-ink-2 text-xs">
                Nenhum link de agendamento criado ainda. Crie seu primeiro link acima!
              </div>
            ) : (
              <div className="space-y-2.5">
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="p-4 rounded-2xl bg-surface border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-brand/40 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-ink truncate">
                          {link.title}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                          ⏱️ {link.durationMin} min
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-2 font-mono flex items-center gap-1">
                        <Globe className="w-3 h-3 text-sky-500" />
                        /book/{link.slug}
                      </p>
                      {link.description && (
                        <p className="text-xs text-ink-2 line-clamp-1">{link.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(link.slug)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                          copiedSlug === link.slug
                            ? 'bg-emerald-500 text-white border-emerald-600'
                            : 'bg-surface-2 hover:bg-surface-3 border-line text-ink'
                        }`}
                      >
                        {copiedSlug === link.slug ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedSlug === link.slug ? 'Copiado!' : 'Copiar Link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(link.id)}
                        className="p-1.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-line bg-surface-2/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-surface border border-line rounded-xl text-xs font-bold text-ink hover:bg-surface-2 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
