import { Bookmark, Calendar, Loader2, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Dialog } from '../../../components/ui/Dialog';
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/toast.js';
import type { ProspectCandidate } from '../domain/prospectTypes.js';

export interface SavedSearchItem {
  id: string;
  name: string;
  criteria: Record<string, any>;
  schedule: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  leadsDiscovered: number;
  createdAt: string;
}

interface SavedSearchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCriteria?: Record<string, any>;
  /**
   * Chamado depois de "Executar" com o critério da busca salva e os candidatos que
   * `/saved-searches/:id/run` já encontrou (Onda 43: antes o candidato era descartado e a tela
   * disparava uma segunda busca do zero — `.click()` programático no botão de descoberta — para
   * conseguir o mesmo resultado que a API já tinha devolvido de graça, pagando de novo o custo de
   * Apollo/Places por nada).
   */
  onApplyCriteria?: (criteria: Record<string, any>, candidates: ProspectCandidate[]) => void;
}

export function SavedSearchesModal({
  isOpen,
  onClose,
  currentCriteria,
  onApplyCriteria,
}: SavedSearchesModalProps) {
  const [searches, setSearches] = useState<SavedSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSchedule, setNewSchedule] = useState<'none' | 'daily' | 'weekly'>('none');
  const [creating, setCreating] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const loadSearches = async () => {
    try {
      setLoading(true);
      const data = await api.get<SavedSearchItem[]>('/api/prospecting/saved-searches');
      setSearches(data || []);
    } catch {
      toast.error('Erro ao carregar buscas salvas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSearches();
    }
  }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setCreating(true);
      await api.post('/api/prospecting/saved-searches', {
        name: newName.trim(),
        criteria: currentCriteria || {},
        schedule: newSchedule === 'none' ? null : newSchedule,
      });
      toast.success('Busca salva com sucesso!');
      setNewName('');
      setNewSchedule('none');
      setShowCreateForm(false);
      loadSearches();
    } catch {
      toast.error('Erro ao salvar busca');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: 'Excluir busca salva',
        description: 'Excluir esta busca salva?',
        confirmLabel: 'Excluir',
        variant: 'danger',
      }))
    )
      return;
    try {
      await api.delete(`/api/prospecting/saved-searches/${id}`);
      toast.success('Busca removida');
      setSearches((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const handleRun = async (search: SavedSearchItem) => {
    try {
      setRunningId(search.id);
      const res = await api.post<{
        count: number;
        savedSearch: SavedSearchItem;
        candidates: ProspectCandidate[];
        searchId?: string;
      }>(`/api/prospecting/saved-searches/${search.id}/run`);
      toast.success(`Busca executada! ${res.count} novo(s) candidato(s) encontrado(s).`);
      if (onApplyCriteria && search.criteria) {
        onApplyCriteria(search.criteria, res.candidates || []);
      }
      loadSearches();
    } catch {
      toast.error('Erro ao executar busca');
    } finally {
      setRunningId(null);
    }
  };

  const dialogTitle = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand-active dark:text-brand-2 flex items-center justify-center font-bold shrink-0">
        <Bookmark size={20} />
      </div>
      <div>
        <div className="text-xl font-bold text-ink leading-tight">Listas Salvas & Agendamento</div>
        <p className="text-xs text-ink-2 font-normal">
          Automatize buscas periódicas de novos leads e frotistas
        </p>
      </div>
    </div>
  );

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title={dialogTitle}
        maxWidth="max-w-2xl"
        footer={
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-2xl bg-surface-2 text-xs font-bold text-ink hover:bg-surface-3 transition-colors"
          >
            Fechar
          </button>
        }
      >
        <div className="space-y-4">
          {/* Botão para salvar filtro atual */}
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-line hover:border-brand/40 text-sm font-bold text-brand-active dark:text-brand-2 flex items-center justify-center gap-2 hover:bg-brand/5 transition-all"
            >
              <Plus size={18} /> Salvar Filtro Atual como Nova Lista
            </button>
          ) : (
            <form
              onSubmit={handleCreate}
              className="p-4 rounded-2xl bg-surface-2/60 border border-line space-y-3"
            >
              <h3 className="text-xs font-bold uppercase text-ink-2">Nova Busca Salva</h3>
              <div>
                <label
                  htmlFor="saved-search-name"
                  className="text-xs font-medium text-ink block mb-1"
                >
                  Nome da Lista
                </label>
                <input
                  id="saved-search-name"
                  type="text"
                  required
                  placeholder="Ex: Frotas Pesadas SP > 30 caminhões"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-xl text-xs font-medium text-ink focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label
                  htmlFor="saved-search-schedule"
                  className="text-xs font-medium text-ink block mb-1"
                >
                  Recorrência Automática
                </label>
                <select
                  id="saved-search-schedule"
                  value={newSchedule}
                  onChange={(e) => setNewSchedule(e.target.value as any)}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-xl text-xs font-medium text-ink focus:outline-none focus:border-brand"
                >
                  <option value="none">Manual (Sem agendamento)</option>
                  <option value="daily">Diário (Rodar toda madrugada)</option>
                  <option value="weekly">Semanal (Toda segunda-feira)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-2 hover:bg-surface-2"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded-xl bg-brand-active text-white text-xs font-bold hover:brightness-110 flex items-center gap-1.5"
                >
                  {creating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}{' '}
                  Salvar Lista
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="py-12 flex justify-center items-center">
              <Loader2 className="w-8 h-8 text-brand animate-spin" />
            </div>
          ) : searches.length === 0 ? (
            <div className="py-8 text-center text-ink-2 text-xs font-medium">
              Nenhuma busca salva ainda. Configure seus filtros e clique acima para salvar!
            </div>
          ) : (
            searches.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-2xl bg-surface border border-line hover:border-brand/30 transition-all flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink">{s.name}</span>
                    {s.schedule && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand-active dark:text-brand-2 font-bold flex items-center gap-1">
                        <Calendar size={10} />
                        {s.schedule === 'daily' ? 'Diário' : 'Semanal'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-ink-2">
                    <span>
                      Total Descobertos: <b className="text-ink">{s.leadsDiscovered}</b>
                    </span>
                    {s.lastRunAt && (
                      <span>
                        Última execução: {new Date(s.lastRunAt).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRun(s)}
                    disabled={runningId === s.id}
                    title="Executar busca agora"
                    className="px-3 py-1.5 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand-active dark:text-brand-2 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {runningId === s.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    Executar
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    title="Excluir busca salva"
                    className="p-2 text-ink-2 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Dialog>

      {dialog}
    </>
  );
}
