import { useEffect, useState, useMemo } from 'react';
import {
  Loader2,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  X,
  Filter,
  Tag,
  Users,
  Lock,
  CalendarDays,
  Info,
  SlidersHorizontal,
  CheckSquare,
  Square,
  Edit3,
  Flame,
  Phone,
  Mail,
  Building2,
  DollarSign,
  Sparkles,
  Layers,
  Check,
  ExternalLink,
  ArrowUpDown,
  ShieldCheck,
  Zap,
  XCircle,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';

interface BitrixLeadSummary {
  id: string;
  title: string;
  companyTitle: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  statusLabel: string;
  sourceId: string | null;
  dateCreate: string | null;
  alreadyImported: boolean;
}

interface BitrixDealSummary {
  id: string;
  title: string;
  stageLabel: string;
  assignedById: string | null;
  dateCreate: string | null;
  opportunity: string | null;
  alreadyImported: boolean;
}

interface BitrixDealPipeline {
  id: string;
  name: string;
}

interface BitrixDealStage {
  id: string;
  name: string;
}

interface BitrixUserOption {
  id: string;
  name: string;
}

interface BitrixFieldOption {
  code: string;
  label: string;
}

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const selectClass =
  'h-9 text-sm rounded-xl border border-line bg-surface-2 text-ink px-3 disabled:opacity-40 min-w-[9rem] focus:bg-surface focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none cursor-pointer';
const filterLabelClass =
  'text-[10px] font-bold uppercase tracking-wide text-ink-2 flex items-center gap-1';

interface BitrixImportPanelProps {
  connectionId: string;
}

export function BitrixImportPanel({ connectionId }: BitrixImportPanelProps) {
  const { currentUser } = useAuth();
  const canPickAnyVendor = !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR']);
  const [mode, setMode] = useState<'deals' | 'leads'>('deals');

  // ── Modo Negócios ──
  const [pipelines, setPipelines] = useState<BitrixDealPipeline[]>([]);
  const [stages, setStages] = useState<BitrixDealStage[]>([]);
  const [users, setUsers] = useState<BitrixUserOption[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [stageId, setStageId] = useState('');
  const [assignedById, setAssignedById] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [deals, setDeals] = useState<BitrixDealSummary[]>([]);

  // ── Modo Leads ──
  const [leads, setLeads] = useState<BitrixLeadSummary[]>([]);

  // ── Filtros Locais & Ordenação ──
  const [quickFilter, setQuickFilter] = useState<'all' | 'unimported' | 'has_phone' | 'has_value'>(
    'all',
  );
  const [sortBy, setSortBy] = useState<'recent' | 'value' | 'name'>('recent');

  // ── Busca por Nome ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const [fields, setFields] = useState<BitrixFieldOption[]>([]);
  const [customFieldCode, setCustomFieldCode] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [debouncedCustomFieldValue, setDebouncedCustomFieldValue] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCustomFieldValue(customFieldValue), 400);
    return () => clearTimeout(timer);
  }, [customFieldValue]);

  // ── Estado Compartilhado ──
  const [start, setStart] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importingSingleId, setImportingSingleId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    skippedConflicts: number;
    skippedNotOwned: number;
    failed?: number;
  } | null>(null);
  const [restrictedWarning, setRestrictedWarning] = useState('');

  // ── Modal de Edição em Lote ──
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkTemperature, setBulkTemperature] = useState<'Frio' | 'Morno' | 'Quente'>('Morno');

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    api
      .get<BitrixDealPipeline[]>(`/api/bitrix/deal-pipelines?connectionId=${connectionId}`)
      .then((data) => {
        setPipelines(data);
        setCategoryId(data[0]?.id ?? '');
      })
      .catch(() => {
        setPipelines([]);
        setCategoryId('');
      });
    api
      .get<BitrixUserOption[]>(`/api/bitrix/users?connectionId=${connectionId}`)
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [connectionId]);

  useEffect(() => {
    setCustomFieldCode('');
    setCustomFieldValue('');
    const entity = mode === 'deals' ? 'deal' : 'lead';
    api
      .get<BitrixFieldOption[]>(`/api/bitrix/fields?connectionId=${connectionId}&entity=${entity}`)
      .then(setFields)
      .catch(() => setFields([]));
  }, [connectionId, mode]);

  useEffect(() => {
    setStageId('');
    if (!categoryId) {
      setStages([]);
      return;
    }
    api
      .get<BitrixDealStage[]>(
        `/api/bitrix/deal-stages?connectionId=${connectionId}&categoryId=${categoryId}`,
      )
      .then(setStages)
      .catch(() => setStages([]));
  }, [connectionId, categoryId]);

  const loadDeals = async (from: number) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ start: String(from), connectionId });
      if (categoryId) params.set('categoryId', categoryId);
      if (stageId) params.set('stageId', stageId);
      if (assignedById) params.set('assignedById', assignedById);
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (customFieldCode && debouncedCustomFieldValue.trim()) {
        params.set('customFieldCode', customFieldCode);
        params.set('customFieldValue', debouncedCustomFieldValue.trim());
      }
      const { data, meta } = await api.get<{
        data: { deals: BitrixDealSummary[]; next: number | null; total: number };
        meta: { restricted: boolean; warning?: string };
      }>(`/api/bitrix/deals?${params}`);
      setDeals(data.deals);
      setNext(data.next);
      setTotal(data.total);
      setStart(from);
      setRestrictedWarning(meta.warning || '');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Não foi possível carregar os negócios do Bitrix24.',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadLeads = async (from: number) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ start: String(from), connectionId });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (customFieldCode && debouncedCustomFieldValue.trim()) {
        params.set('customFieldCode', customFieldCode);
        params.set('customFieldValue', debouncedCustomFieldValue.trim());
      }
      const { data, meta } = await api.get<{
        data: { leads: BitrixLeadSummary[]; next: number | null; total: number };
        meta: { restricted: boolean; warning?: string };
      }>(`/api/bitrix/leads?${params}`);
      setLeads(data.leads);
      setNext(data.next);
      setTotal(data.total);
      setStart(from);
      setRestrictedWarning(meta.warning || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os leads do Bitrix24.');
    } finally {
      setLoading(false);
    }
  };

  const load = (from: number) => (mode === 'deals' ? loadDeals(from) : loadLeads(from));

  useEffect(() => {
    setSelected(new Set());
    setImportResult(null);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connectionId,
    mode,
    categoryId,
    stageId,
    assignedById,
    month,
    year,
    debouncedSearch,
    customFieldCode,
    debouncedCustomFieldValue,
  ]);

  // ── Processamento dos dados na tela (Quick Filter + Sorting) ──
  const processedDeals = useMemo(() => {
    let list = [...deals];
    if (quickFilter === 'unimported') list = list.filter((d) => !d.alreadyImported);
    if (quickFilter === 'has_value') list = list.filter((d) => Number(d.opportunity || 0) > 0);

    if (sortBy === 'value') {
      list.sort((a, b) => Number(b.opportunity || 0) - Number(a.opportunity || 0));
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'recent') {
      list.sort(
        (a, b) => new Date(b.dateCreate || 0).getTime() - new Date(a.dateCreate || 0).getTime(),
      );
    }
    return list;
  }, [deals, quickFilter, sortBy]);

  const processedLeads = useMemo(() => {
    let list = [...leads];
    if (quickFilter === 'unimported') list = list.filter((l) => !l.alreadyImported);
    if (quickFilter === 'has_phone') list = list.filter((l) => Boolean(l.phone));

    if (sortBy === 'name') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'recent') {
      list.sort(
        (a, b) => new Date(b.dateCreate || 0).getTime() - new Date(a.dateCreate || 0).getTime(),
      );
    }
    return list;
  }, [leads, quickFilter, sortBy]);

  const availableItems =
    mode === 'deals'
      ? processedDeals.filter((d) => !d.alreadyImported)
      : processedLeads.filter((l) => !l.alreadyImported);

  const totalSelectedValue = useMemo(() => {
    if (mode !== 'deals') return 0;
    return deals
      .filter((d) => selected.has(d.id))
      .reduce((acc, d) => acc + Number(d.opportunity || 0), 0);
  }, [deals, selected, mode]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  };

  const allPageSelected =
    availableItems.length > 0 && availableItems.every((item) => selected.has(item.id));

  const toggleAllPage = () => {
    if (allPageSelected) {
      setSelected(new Set());
    } else {
      const nextSet = new Set(selected);
      availableItems.forEach((item) => {
        nextSet.add(item.id);
      });
      setSelected(nextSet);
    }
  };

  const selectAllAvailable = () => {
    const nextSet = new Set(selected);
    availableItems.forEach((item) => {
      nextSet.add(item.id);
    });
    setSelected(nextSet);
  };

  // Importação em Lote
  const importSelected = async () => {
    if (selected.size === 0) return null;
    setImporting(true);
    setError('');
    setImportResult(null);
    try {
      const endpoint = mode === 'deals' ? '/api/bitrix/deals/import' : '/api/bitrix/leads/import';
      const body =
        mode === 'deals'
          ? { connectionId, bitrixDealIds: Array.from(selected) }
          : { connectionId, bitrixLeadIds: Array.from(selected) };
      const result = await api.post<{
        imported: number;
        skipped: number;
        skippedConflicts: number;
        skippedNotOwned: number;
        failed: number;
        importedLeadIds: string[];
      }>(endpoint, body, { timeoutMs: 90_000 });
      setImportResult(result);
      setSelected(new Set());
      setShowBulkEditModal(false);
      await load(start);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar os itens selecionados.');
      return null;
    } finally {
      setImporting(false);
    }
  };

  // Confirmação do modal "Editar em Lote": importa e, em seguida, aplica a temperatura inicial
  // escolhida a cada lead realmente criado. Antes desta correção, bulkTemperature/bulkTriggerVoice
  // eram só estado local — o usuário configurava, via importSelected (mesma função do botão
  // "Importar Selecionados" simples), recebia toast de sucesso, e nada era de fato aplicado.
  const applyBulkEditAndImport = async () => {
    const result = await importSelected();
    if (!result?.importedLeadIds?.length) return;

    const outcomes = await Promise.allSettled(
      result.importedLeadIds.map((id) =>
        api.put(`/api/leads/${id}`, { temperature: bulkTemperature }),
      ),
    );
    const failedCount = outcomes.filter((o) => o.status === 'rejected').length;
    if (failedCount > 0) {
      setError(
        `Importação concluída, mas a temperatura inicial não pôde ser aplicada a ${failedCount} de ${result.importedLeadIds.length} lead(s) — os demais foram atualizados normalmente.`,
      );
    }
  };

  // Importação Individual de 1 Clique
  const importSingle = async (id: string) => {
    setImportingSingleId(id);
    setError('');
    try {
      const endpoint = mode === 'deals' ? '/api/bitrix/deals/import' : '/api/bitrix/leads/import';
      const body =
        mode === 'deals'
          ? { connectionId, bitrixDealIds: [id] }
          : { connectionId, bitrixLeadIds: [id] };
      const result = await api.post<{
        imported: number;
        skipped: number;
        skippedConflicts: number;
        skippedNotOwned: number;
        failed: number;
      }>(endpoint, body, { timeoutMs: 30_000 });
      setImportResult(result);
      await load(start);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar o item.');
    } finally {
      setImportingSingleId(null);
    }
  };

  const userName = (id: string | null) =>
    (id && users.find((u) => u.id === id)?.name) || (id ? `Usuário #${id}` : null);

  return (
    <div className="mt-6 pt-6 border-t border-line space-y-4">
      {/* Header com Indicador de Saúde do Portal Bitrix */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-brand/10 via-brand-2/5 to-transparent p-5 rounded-3xl border border-brand/20 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-2 flex items-center justify-center text-white shadow-lg shadow-brand/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              Importador Inteligente Bitrix24
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Conexão Segura & Ativa
              </span>
            </h3>
            <p className="text-xs text-ink-2">
              Filtre por vendedor, etapa e oportunidade. Importe com 1 clique.{' '}
              {total > 0 && (
                <strong className="text-ink font-bold">{total} registro(s) no portal.</strong>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load(start)}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-ink-2 hover:text-ink bg-surface border border-line rounded-2xl shadow-sm hover:shadow transition-all disabled:opacity-50"
            title="Recarregar dados do Bitrix24"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Portal
          </button>
        </div>
      </div>

      {/* Alternador de Modo: Negócios x Leads + Indicadores de Valor */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1.5 p-1.5 bg-surface-2 rounded-2xl border border-line w-fit">
          <button
            onClick={() => setMode('deals')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${mode === 'deals' ? 'bg-gradient-to-r from-brand-active to-brand-2 text-white shadow-md shadow-brand-active/30' : 'text-ink-2 hover:text-ink'}`}
          >
            <Building2 className="w-4 h-4" />
            Negócios (Comercial)
          </button>
          <button
            onClick={() => setMode('leads')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all ${mode === 'leads' ? 'bg-gradient-to-r from-brand-active to-brand-2 text-white shadow-md shadow-brand-active/30' : 'text-ink-2 hover:text-ink'}`}
          >
            <Users className="w-4 h-4" />
            Leads (Todos)
          </button>
        </div>

        {/* Métricas dos Selecionados */}
        <div className="flex items-center gap-3">
          {mode === 'deals' && totalSelectedValue > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 text-xs font-bold">
              <DollarSign className="w-4 h-4" />
              Total Selecionado: R$ {totalSelectedValue.toLocaleString('pt-BR')}
            </div>
          )}

          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkEditModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-2 hover:bg-line text-ink text-xs font-bold rounded-xl transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar em Lote ({selected.size})
              </button>
              <button
                onClick={importSelected}
                disabled={importing}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-brand-active to-brand-2 hover:brightness-110 text-white text-xs font-bold rounded-xl shadow-md shadow-brand-active/20 transition-all disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {importing ? 'Importando...' : `Importar Selecionados (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Painel Avançado de Filtros e Busca */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                mode === 'deals'
                  ? 'Buscar por empresa, oportunidade ou negócio...'
                  : 'Buscar por nome do lead, empresa, e-mail...'
              }
              className="w-full h-10 text-sm rounded-2xl border border-line bg-surface-2 text-ink pl-10 pr-9 placeholder:text-ink-2 focus:bg-surface focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-2 hover:text-ink p-1"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtros Rápidos (Pills) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setQuickFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${quickFilter === 'all' ? 'bg-ink text-surface shadow-sm' : 'bg-surface-2 text-ink-2 hover:text-ink'}`}
            >
              Todos ({mode === 'deals' ? deals.length : leads.length})
            </button>
            <button
              onClick={() => setQuickFilter('unimported')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${quickFilter === 'unimported' ? 'bg-brand-active text-white shadow-sm shadow-brand-active/20' : 'bg-surface-2 text-ink-2 hover:text-ink'}`}
            >
              Disponíveis para Importar
            </button>
            {mode === 'deals' && (
              <button
                onClick={() => setQuickFilter('has_value')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${quickFilter === 'has_value' ? 'bg-green-600 text-white shadow-sm shadow-green-600/20' : 'bg-surface-2 text-ink-2 hover:text-ink'}`}
              >
                Com Valor (R$)
              </button>
            )}
            {mode === 'leads' && (
              <button
                onClick={() => setQuickFilter('has_phone')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${quickFilter === 'has_phone' ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'bg-surface-2 text-ink-2 hover:text-ink'}`}
              >
                Com Telefone
              </button>
            )}
          </div>
        </div>

        {mode === 'deals' &&
          (pipelines.length === 0 ? (
            <p className="text-xs text-ink-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Este portal não tem um pipeline &quot;Comercial&quot; — as vendas dele provavelmente
              ficam na aba Leads, não em Negócios.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-line">
              <div className="flex flex-col gap-1">
                <span className={filterLabelClass}>
                  <Filter className="w-3 h-3" /> Pipeline
                </span>
                <span className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-soft border border-brand/20 text-brand-active dark:text-brand-2 text-sm font-bold whitespace-nowrap">
                  {pipelines[0].name}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="bitrix-filter-stage" className={filterLabelClass}>
                  <Tag className="w-3 h-3" /> Etapa
                </label>
                <select
                  id="bitrix-filter-stage"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Todas as etapas</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="bitrix-filter-vendor" className={filterLabelClass}>
                  {canPickAnyVendor ? <Users className="w-3 h-3" /> : <Lock className="w-3 h-3" />}{' '}
                  Vendedor
                </label>
                {canPickAnyVendor ? (
                  <select
                    id="bitrix-filter-vendor"
                    value={assignedById}
                    onChange={(e) => setAssignedById(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Todos os vendedores</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    id="bitrix-filter-vendor"
                    className="flex items-center h-9 px-3 rounded-xl bg-surface-2 text-ink-2 text-sm font-medium"
                    title="Você só vê e importa o seu próprio dado do Bitrix24 (Trava de Isolamento por Vendedor)."
                  >
                    Exclusivo do Seu Usuário
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="bitrix-filter-month" className={filterLabelClass}>
                  <CalendarDays className="w-3 h-3" /> Mês
                </label>
                <select
                  id="bitrix-filter-month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className={`${selectClass} min-w-[7rem]`}
                >
                  <option value="">Todos</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="bitrix-filter-year" className={filterLabelClass}>
                  Ano
                </label>
                <select
                  id="bitrix-filter-year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className={`${selectClass} min-w-[5rem]`}
                >
                  <option value="">Todos</option>
                  {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 ml-auto">
                <label htmlFor="bitrix-filter-sort" className={filterLabelClass}>
                  <ArrowUpDown className="w-3 h-3" /> Ordenar Por
                </label>
                <select
                  id="bitrix-filter-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'recent' | 'value' | 'name')}
                  className={selectClass}
                >
                  <option value="recent">Mais Recentes</option>
                  <option value="value">Maior Valor (R$)</option>
                  <option value="name">Nome (A-Z)</option>
                </select>
              </div>
            </div>
          ))}

        {fields.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-line">
            <div className="flex flex-col gap-1">
              <label htmlFor="bitrix-import-custom-field" className={filterLabelClass}>
                <SlidersHorizontal className="w-3 h-3" /> Campo personalizado
              </label>
              <select
                id="bitrix-import-custom-field"
                value={customFieldCode}
                onChange={(e) => setCustomFieldCode(e.target.value)}
                className={`${selectClass} min-w-[13rem]`}
              >
                <option value="">Nenhum (não filtrar)</option>
                {fields.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {customFieldCode && (
              <div className="flex flex-col gap-1">
                <label htmlFor="bitrix-import-custom-field-value" className={filterLabelClass}>
                  Valor exato a filtrar
                </label>
                <input
                  id="bitrix-import-custom-field-value"
                  type="text"
                  value={customFieldValue}
                  onChange={(e) => setCustomFieldValue(e.target.value)}
                  placeholder="Ex: Transportadora"
                  className="h-9 text-sm rounded-xl border border-line bg-surface-2 text-ink px-3 min-w-[11rem] placeholder:text-ink-2 focus:bg-surface focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 p-3.5 rounded-2xl border border-red-200">
          {error}
        </p>
      )}
      {!error && restrictedWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 p-3.5 rounded-2xl border border-amber-200 font-medium">
          <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600" /> {restrictedWarning}
        </p>
      )}

      {importResult && (
        <div className="text-xs space-y-1 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-3xl shadow-sm">
          <p className="text-green-700 dark:text-green-400 font-bold flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-600" /> {importResult.imported} registro(s)
            importado(s) com sucesso
            {importResult.skipped > 0 ? `, ${importResult.skipped} já existiam` : ''}.
          </p>
          {importResult.skippedConflicts > 0 && (
            <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5 pl-6">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {importResult.skippedConflicts}{' '}
              bloqueado(s) — pertenciam a outro responsável.
            </p>
          )}
          {importResult.skippedNotOwned > 0 && (
            <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5 pl-6">
              <Lock className="w-3.5 h-3.5 shrink-0" /> {importResult.skippedNotOwned} ignorado(s) —
              não atribuídos a você no Bitrix24.
            </p>
          )}
          {!!importResult.failed && importResult.failed > 0 && (
            <p className="text-red-600 dark:text-red-400 flex items-center gap-1.5 pl-6">
              <XCircle className="w-3.5 h-3.5 shrink-0" /> {importResult.failed} falharam de verdade
              (erro de rede/Bitrix) — os demais itens foram importados normalmente; tente novamente
              só para estes.
            </p>
          )}
        </div>
      )}

      {/* Barra Superior de Seleção em Massa */}
      {!loading && availableItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-gradient-to-r from-surface-2 to-soft border border-line rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAllPage}
              className="flex items-center gap-2 text-xs font-bold text-ink hover:text-brand dark:hover:text-brand-2 transition-colors"
            >
              {allPageSelected ? (
                <CheckSquare className="w-4 h-4 text-brand" />
              ) : (
                <Square className="w-4 h-4 text-ink-2" />
              )}
              <span>Selecionar Todos da Página ({availableItems.length} disponíveis)</span>
            </button>

            <button
              onClick={selectAllAvailable}
              className="text-xs font-bold text-brand-active hover:brightness-110 dark:text-brand-2 flex items-center gap-1 underline underline-offset-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Marcar Todos
            </button>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-brand-active dark:text-brand-2 bg-soft px-3 py-1 rounded-full">
                {selected.size} selecionado(s)
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs font-bold text-ink-2 hover:text-red-500 transition-colors"
              >
                Desmarcar Tudo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista de Cards Ricos para Registros de Clientes */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand" />
          <p className="text-xs font-bold text-ink-2">Carregando dados do Bitrix24...</p>
        </div>
      ) : (
        <div className="max-h-[34rem] overflow-y-auto space-y-3 pr-1">
          {mode === 'deals'
            ? processedDeals.map((deal) => {
                const isSelected = selected.has(deal.id);
                const isSingleImporting = importingSingleId === deal.id;

                return (
                  <div
                    key={deal.id}
                    className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl border transition-all ${
                      deal.alreadyImported
                        ? 'opacity-50 bg-surface-2 border-line'
                        : isSelected
                          ? 'bg-brand/10 border-brand/50 shadow-md shadow-brand/5 ring-1 ring-brand/30'
                          : 'bg-surface border-line hover:border-brand/40 hover:bg-soft shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="pt-1 shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={deal.alreadyImported}
                          onChange={() => toggle(deal.id)}
                          className="w-4 h-4 rounded border-line text-brand focus:ring-brand cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-soft text-brand-active dark:text-brand-2 flex items-center justify-center shrink-0 font-bold text-xs">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <h4 className="font-bold text-ink text-sm truncate">{deal.title}</h4>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-soft text-brand-active dark:text-brand-2 border border-brand/20 text-[10px] font-bold">
                            <Tag className="w-3 h-3" />
                            {deal.stageLabel}
                          </span>
                          {deal.alreadyImported && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 text-ink-2 text-[10px] font-bold">
                              <Check className="w-3 h-3" /> Já Importado
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-ink-2">
                          {deal.assignedById && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-ink-2" />
                              {userName(deal.assignedById)}
                            </span>
                          )}
                          {deal.opportunity && (
                            <span className="flex items-center gap-1 font-bold text-green-600 dark:text-green-400">
                              <DollarSign className="w-3.5 h-3.5" />
                              R$ {Number(deal.opportunity).toLocaleString('pt-BR')}
                            </span>
                          )}
                          {deal.dateCreate && (
                            <span className="flex items-center gap-1 text-ink-2">
                              <CalendarDays className="w-3.5 h-3.5" />
                              {new Date(deal.dateCreate).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ação Individual de 1 Clique */}
                    {!deal.alreadyImported && (
                      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-line">
                        <button
                          onClick={() => importSingle(deal.id)}
                          disabled={isSingleImporting || importing}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-soft hover:bg-brand/20 text-brand-active dark:text-brand-2 border border-brand/20 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        >
                          {isSingleImporting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 text-brand" />
                          )}
                          {isSingleImporting ? 'Importando...' : 'Importar Agora'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            : processedLeads.map((lead) => {
                const isSelected = selected.has(lead.id);
                const isSingleImporting = importingSingleId === lead.id;
                const whatsappUrl = lead.phone
                  ? `https://wa.me/${lead.phone.replace(/\D/g, '')}`
                  : null;

                return (
                  <div
                    key={lead.id}
                    className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl border transition-all ${
                      lead.alreadyImported
                        ? 'opacity-50 bg-surface-2 border-line'
                        : isSelected
                          ? 'bg-brand/10 border-brand/50 shadow-md shadow-brand/5 ring-1 ring-brand/30'
                          : 'bg-surface border-line hover:border-brand/40 hover:bg-soft shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="pt-1 shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={lead.alreadyImported}
                          onChange={() => toggle(lead.id)}
                          className="w-4 h-4 rounded border-line text-brand focus:ring-brand cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-soft text-brand-active dark:text-brand-2 flex items-center justify-center shrink-0 font-bold text-xs">
                            <Users className="w-4 h-4" />
                          </div>
                          <h4 className="font-bold text-ink text-sm truncate">{lead.title}</h4>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-soft text-brand-active dark:text-brand-2 border border-brand/20 text-[10px] font-bold">
                            <Tag className="w-3 h-3" />
                            {lead.statusLabel}
                          </span>
                          {lead.alreadyImported && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 text-ink-2 text-[10px] font-bold">
                              <Check className="w-3 h-3" /> Já Importado
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-ink">
                          {lead.contactName && (
                            <span className="flex items-center gap-1 font-semibold">
                              <Users className="w-3.5 h-3.5 text-ink-2" />
                              {lead.contactName}
                            </span>
                          )}

                          {lead.phone && (
                            <span className="flex items-center gap-1 text-ink-2">
                              <Phone className="w-3.5 h-3.5 text-green-500" />
                              {lead.phone}
                              {whatsappUrl && (
                                <a
                                  href={whatsappUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 text-green-600 hover:text-green-700 inline-flex items-center gap-0.5 text-[10px] font-bold bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded"
                                  title="Abrir no WhatsApp"
                                >
                                  WhatsApp <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </span>
                          )}

                          {lead.email && (
                            <span className="flex items-center gap-1 text-ink-2">
                              <Mail className="w-3.5 h-3.5 text-blue-500" />
                              <a href={`mailto:${lead.email}`} className="hover:underline">
                                {lead.email}
                              </a>
                            </span>
                          )}

                          {lead.dateCreate && (
                            <span className="flex items-center gap-1 text-ink-2 ml-auto">
                              <CalendarDays className="w-3.5 h-3.5" />
                              {new Date(lead.dateCreate).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ação Individual de 1 Clique */}
                    {!lead.alreadyImported && (
                      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-line">
                        <button
                          onClick={() => importSingle(lead.id)}
                          disabled={isSingleImporting || importing}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-soft hover:bg-brand/20 text-brand-active dark:text-brand-2 border border-brand/20 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        >
                          {isSingleImporting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 text-brand" />
                          )}
                          {isSingleImporting ? 'Importando...' : 'Importar Agora'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

          {(mode === 'deals' ? processedDeals.length : processedLeads.length) === 0 && (
            <div className="p-10 text-center bg-surface-2 rounded-3xl border border-dashed border-line space-y-2">
              <Info className="w-8 h-8 text-ink-2 mx-auto" />
              <p className="text-sm font-bold text-ink">Nenhum registro encontrado</p>
              <p className="text-xs text-ink-2">
                Tente ajustar os filtros, mudar a busca ou selecionar outra aba.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Paginação Inferior */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(Math.max(0, start - 50))}
            disabled={loading || start === 0}
            className="px-4 py-2 border border-line rounded-2xl text-xs font-bold text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors"
          >
            ← Anterior
          </button>
          <button
            onClick={() => next != null && load(next)}
            disabled={loading || next == null}
            className="px-4 py-2 border border-line rounded-2xl text-xs font-bold text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors"
          >
            Próxima →
          </button>
          <span className="text-xs text-ink-2 pl-2">
            Exibindo {start + 1}–{start + (mode === 'deals' ? deals.length : leads.length)} de{' '}
            {total}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setShowBulkEditModal(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-surface-2 hover:bg-line text-ink text-xs font-bold rounded-2xl transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar ({selected.size})
            </button>
          )}
          <button
            onClick={importSelected}
            disabled={importing || selected.size === 0}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-gradient-to-r from-brand-active to-brand-2 hover:brightness-110 text-white text-xs font-bold rounded-2xl shadow-md shadow-brand-active/20 transition-all disabled:opacity-40"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {importing
              ? 'Importando...'
              : `Importar ${selected.size > 0 ? `(${selected.size})` : 'selecionados'}`}
          </button>
        </div>
      </div>

      {/* Modal de Configurações e Edição em Lote */}
      {showBulkEditModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-6 max-w-md w-full border border-line shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-soft text-brand-active dark:text-brand-2 flex items-center justify-center font-bold">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">
                    Editar em Lote ({selected.size} itens)
                  </h3>
                  <p className="text-[11px] text-ink-2">
                    Defina os parâmetros padrão de importação.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkEditModal(false)}
                aria-label="Fechar"
                className="text-ink-2 hover:text-ink p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span id="bulk-temperature-label" className="block text-xs font-bold text-ink mb-2">
                  Temperatura Inicial do Lead no AtlasGR
                </span>
                <div
                  role="group"
                  aria-labelledby="bulk-temperature-label"
                  className="grid grid-cols-3 gap-2"
                >
                  {(['Frio', 'Morno', 'Quente'] as const).map((temp) => (
                    <button
                      key={temp}
                      type="button"
                      onClick={() => setBulkTemperature(temp)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-2xl border transition-all ${
                        bulkTemperature === temp
                          ? 'bg-gradient-to-r from-brand-active to-brand-2 text-white border-brand-active shadow-md shadow-brand-active/20'
                          : 'bg-surface-2 border-line text-ink hover:bg-line'
                      }`}
                    >
                      <Flame
                        className={`w-3.5 h-3.5 ${temp === 'Quente' ? 'text-red-400' : temp === 'Morno' ? 'text-amber-400' : 'text-blue-400'}`}
                      />
                      {temp}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-line">
                {/* SEC/UX (achado de auditoria): este controle disparava até 100 ligações reais via
                   provedor pago (Bland AI/Birthub Voices) sem nenhuma proteção de volume — a opção
                   nunca foi de fato conectada ao backend (o usuário configurava, recebia toast de
                   sucesso, e nenhuma ligação saía). Em vez de ligar isso silenciosamente numa
                   correção de bug (decisão de produto/custo/compliance que exige throttling
                   dedicado, não algo para decidir aqui), o controle fica desabilitado e honesto até
                   ter uma implementação própria — qualificação por voz individual já funciona (ver
                   o lead importado no CRM). */}
                <div className="flex items-start gap-3 p-3.5 bg-surface-2 border border-line rounded-2xl opacity-70">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled
                    aria-label="Qualificar via Voz — ainda não disponível para importação em lote"
                    className="w-4 h-4 rounded border-line mt-0.5 cursor-not-allowed"
                  />
                  <div>
                    <span className="block text-xs font-bold text-ink-2 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      Qualificar via Voz — em breve
                    </span>
                    <span className="block text-[11px] text-ink-2 mt-0.5">
                      Disparo em lote ainda não está disponível. Depois de importado, você pode
                      qualificar cada lead individualmente pela ficha dele no CRM.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setShowBulkEditModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-ink-2 hover:bg-surface-2 rounded-2xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={applyBulkEditAndImport}
                disabled={importing}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-brand-active to-brand-2 hover:brightness-110 text-white text-xs font-bold rounded-2xl shadow-md shadow-brand-active/20 transition-all disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Aplicar & Importar ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
