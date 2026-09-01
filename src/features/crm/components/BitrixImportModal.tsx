import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  Search,
  Loader2,
  CheckSquare,
  Square,
  Building2,
  User,
  Phone,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  bitrixApi,
  type BitrixConnectionItem,
  type BitrixLeadItem,
  type BitrixDealItem,
} from '../../integrations/bitrix/bitrix.api';
import { toast } from '../../../lib/toast';

interface BitrixImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export function BitrixImportModal({ isOpen, onClose, onImportSuccess }: BitrixImportModalProps) {
  const [connections, setConnections] = useState<BitrixConnectionItem[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [entityType, setEntityType] = useState<'lead' | 'deal'>('lead');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [leads, setLeads] = useState<BitrixLeadItem[]>([]);
  const [deals, setDeals] = useState<BitrixDealItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Carrega conexões Bitrix da organização
  useEffect(() => {
    if (!isOpen) return;
    bitrixApi
      .listConnections()
      .then((list) => {
        setConnections(list);
        if (list.length > 0) {
          setSelectedConnectionId(list[0].id);
        }
      })
      .catch(() => {
        toast.error('Erro ao listar conexões Bitrix24');
      });
  }, [isOpen]);

  // Busca registros da conexão selecionada
  const fetchRecords = useCallback(async () => {
    if (!selectedConnectionId) return;
    setLoading(true);
    setSelectedIds(new Set());
    try {
      if (entityType === 'lead') {
        const data = await bitrixApi.listLeads(
          selectedConnectionId,
          searchTerm.trim() || undefined,
        );
        setLeads(data.leads || []);
      } else {
        const data = await bitrixApi.listDeals(
          selectedConnectionId,
          searchTerm.trim() || undefined,
        );
        setDeals(data.deals || []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao buscar registros no Bitrix24');
    } finally {
      setLoading(false);
    }
  }, [selectedConnectionId, entityType, searchTerm]);

  useEffect(() => {
    if (isOpen && selectedConnectionId) {
      fetchRecords();
    }
  }, [isOpen, selectedConnectionId, entityType, fetchRecords]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    const currentList = entityType === 'lead' ? leads : deals;
    if (selectedIds.size === currentList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentList.map((item) => item.id)));
    }
  };

  const handleImportSelected = async () => {
    if (selectedIds.size === 0 || !selectedConnectionId) return;
    setImporting(true);
    try {
      const ids = Array.from(selectedIds);
      if (entityType === 'lead') {
        await bitrixApi.importLeads(selectedConnectionId, ids);
      } else {
        await bitrixApi.importDeals(selectedConnectionId, ids);
      }
      toast.success(
        `${ids.length} ${entityType === 'lead' ? 'lead(s)' : 'negócio(s)'} importado(s) com sucesso!`,
      );
      onImportSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao importar do Bitrix24');
    } finally {
      setImporting(false);
    }
  };

  const handleQuickSyncRecent = async () => {
    setImporting(true);
    try {
      const res = await bitrixApi.importRecentBitrixLeads();
      toast.success(
        `Sincronização concluída: ${res.data.imported} importados, ${res.data.skipped} já existentes.`,
      );
      onImportSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao sincronizar recentes');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-line rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header do Modal */}
        <div className="p-6 border-b border-line flex items-center justify-between bg-surface-2/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-600 border border-sky-500/20">
              <Download className="w-6 h-6 rotate-180" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-ink">Receber do Bitrix24</h3>
              <p className="text-xs text-ink-2">
                Selecione os leads ou negócios do portal Bitrix para importar sob demanda para o CRM
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

        {/* Filtros e Seletores */}
        <div className="p-6 border-b border-line space-y-4 bg-surface">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="bitrix-import-connection"
                className="block text-xs font-bold text-ink-2 mb-1.5 uppercase"
              >
                Portal Bitrix Conectado
              </label>
              <select
                id="bitrix-import-connection"
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-sm font-semibold text-ink focus:outline-none focus:border-brand"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({new URL(c.webhookUrl).hostname})
                  </option>
                ))}
              </select>
            </div>

            <div>
              {/* Não é <label htmlFor>: rotula um grupo de 2 botões de escolha, não um único
                  controle de formulário — role="group" + aria-labelledby é a associação correta
                  aqui, não um for/id que não teria um alvo único. */}
              <span
                id="bitrix-import-entity-label"
                className="block text-xs font-bold text-ink-2 mb-1.5 uppercase"
              >
                Objeto do Bitrix
              </span>
              <div
                role="group"
                aria-labelledby="bitrix-import-entity-label"
                className="grid grid-cols-2 gap-2"
              >
                <button
                  type="button"
                  onClick={() => setEntityType('lead')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors border ${
                    entityType === 'lead'
                      ? 'bg-brand-active text-white border-brand'
                      : 'bg-surface-2 text-ink-2 border-line hover:bg-surface'
                  }`}
                >
                  📥 Leads (Cru)
                </button>
                <button
                  type="button"
                  onClick={() => setEntityType('deal')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors border ${
                    entityType === 'deal'
                      ? 'bg-brand-active text-white border-brand'
                      : 'bg-surface-2 text-ink-2 border-line hover:bg-surface'
                  }`}
                >
                  💼 Negócios (Funil)
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-ink-2 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchRecords()}
                placeholder={`Buscar ${entityType === 'lead' ? 'leads' : 'negócios'} por nome, empresa ou telefone...`}
                className="w-full pl-9 pr-4 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand"
              />
            </div>
            <button
              type="button"
              onClick={fetchRecords}
              disabled={loading}
              className="px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-line rounded-xl text-xs font-bold text-ink transition-colors flex items-center gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Buscar
            </button>
          </div>
        </div>

        {/* Lista de Registros */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-ink-2">
              <Loader2 className="w-8 h-8 animate-spin text-brand" />
              <p className="text-sm font-medium">Consultando portal Bitrix24...</p>
            </div>
          ) : connections.length === 0 ? (
            <div className="py-12 text-center text-ink-2 space-y-2">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="font-bold text-sm text-ink">Nenhum portal Bitrix24 conectado</p>
              <p className="text-xs">
                Configure o webhook do Bitrix na aba Integrações para habilitar a importação.
              </p>
            </div>
          ) : (entityType === 'lead' ? leads : deals).length === 0 ? (
            <div className="py-12 text-center text-ink-2 space-y-2">
              <p className="font-bold text-sm text-ink">Nenhum registro encontrado</p>
              <p className="text-xs">Tente ajustar o termo de busca ou selecione outro portal.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between pb-2 border-b border-line text-xs text-ink-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 font-bold text-brand-active dark:text-brand-2 hover:underline"
                >
                  {selectedIds.size === (entityType === 'lead' ? leads : deals).length ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {selectedIds.size === (entityType === 'lead' ? leads : deals).length
                    ? 'Desmarcar todos'
                    : 'Selecionar todos'}
                </button>
                <span>
                  {selectedIds.size} de {(entityType === 'lead' ? leads : deals).length}{' '}
                  selecionado(s)
                </span>
              </div>

              <div className="space-y-2">
                {entityType === 'lead'
                  ? leads.map((l) => {
                      const isSelected = selectedIds.has(l.id);
                      return (
                        <div
                          key={l.id}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onClick={() => toggleSelect(l.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleSelect(l.id);
                            }
                          }}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-sky-500/10 border-sky-500/40 ring-1 ring-sky-500/40'
                              : 'bg-surface-2/40 border-line hover:border-brand/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="text-brand shrink-0">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4" />
                              ) : (
                                <Square className="w-4 h-4 text-ink-2" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-ink truncate">
                                  {l.title || l.companyTitle || `Lead #${l.id}`}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-line text-ink-2 font-medium">
                                  {l.statusLabel || l.statusId}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-2">
                                {l.companyTitle && (
                                  <span className="flex items-center gap-1 truncate">
                                    <Building2 className="w-3 h-3 text-brand" /> {l.companyTitle}
                                  </span>
                                )}
                                {l.name && (
                                  <span className="flex items-center gap-1 truncate">
                                    <User className="w-3 h-3" /> {l.name} {l.lastName || ''}
                                  </span>
                                )}
                                {l.phone && (
                                  <span className="flex items-center gap-1 truncate">
                                    <Phone className="w-3 h-3" /> {l.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] text-ink-2 shrink-0">
                            {l.dateCreate ? new Date(l.dateCreate).toLocaleDateString('pt-BR') : ''}
                          </span>
                        </div>
                      );
                    })
                  : deals.map((d) => {
                      const isSelected = selectedIds.has(d.id);
                      return (
                        <div
                          key={d.id}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onClick={() => toggleSelect(d.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleSelect(d.id);
                            }
                          }}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-sky-500/10 border-sky-500/40 ring-1 ring-sky-500/40'
                              : 'bg-surface-2/40 border-line hover:border-brand/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="text-brand shrink-0">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4" />
                              ) : (
                                <Square className="w-4 h-4 text-ink-2" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-ink truncate">
                                  {d.title || `Negócio #${d.id}`}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-line text-ink-2 font-medium">
                                  {d.stageLabel || d.stageId}
                                </span>
                                {d.opportunity > 0 && (
                                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                    R$ {d.opportunity.toLocaleString('pt-BR')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-2">
                                {d.companyTitle && (
                                  <span className="flex items-center gap-1 truncate">
                                    <Building2 className="w-3 h-3 text-brand" /> {d.companyTitle}
                                  </span>
                                )}
                                {d.contactName && (
                                  <span className="flex items-center gap-1 truncate">
                                    <User className="w-3 h-3" /> {d.contactName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] text-ink-2 shrink-0">
                            {d.dateCreate ? new Date(d.dateCreate).toLocaleDateString('pt-BR') : ''}
                          </span>
                        </div>
                      );
                    })}
              </div>
            </>
          )}
        </div>

        {/* Footer com Ações */}
        <div className="p-6 border-t border-line bg-surface-2/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleQuickSyncRecent}
            disabled={importing}
            className="text-xs font-bold text-ink-2 hover:text-brand transition-colors flex items-center gap-1.5"
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Sincronizar 25 mais recentes automaticamente
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-line bg-surface hover:bg-surface-2 text-xs font-bold text-ink transition-colors w-full sm:w-auto"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImportSelected}
              disabled={importing || selectedIds.size === 0}
              className="px-5 py-2.5 bg-brand-active hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4 rotate-180" />
              )}
              Importar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} Selecionados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
