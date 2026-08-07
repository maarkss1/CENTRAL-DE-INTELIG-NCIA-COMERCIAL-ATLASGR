import { useEffect, useState } from 'react';
import { Loader2, Download, CheckCircle2, RefreshCw, Search, X, Filter, Tag, Users, CalendarDays, Info } from 'lucide-react';
import { api } from '../../../lib/api';

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

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const selectClass = 'h-9 text-sm rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white px-3 disabled:opacity-40 min-w-[9rem] focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none cursor-pointer';
const filterLabelClass = 'text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 flex items-center gap-1';

interface BitrixImportPanelProps {
    /** Qual portal Bitrix consultar/importar — uma organização pode ter mais de um conectado. */
    connectionId: string;
}

export function BitrixImportPanel({ connectionId }: BitrixImportPanelProps) {
    const [mode, setMode] = useState<'deals' | 'leads'>('deals');

    // ── Modo Negócios (pipeline real) ───────────────────────────────────────────────────────
    const [pipelines, setPipelines] = useState<BitrixDealPipeline[]>([]);
    const [stages, setStages] = useState<BitrixDealStage[]>([]);
    const [users, setUsers] = useState<BitrixUserOption[]>([]);
    const [categoryId, setCategoryId] = useState('');
    const [stageId, setStageId] = useState('');
    const [assignedById, setAssignedById] = useState('');
    const [month, setMonth] = useState('');
    const [year, setYear] = useState('');
    const [deals, setDeals] = useState<BitrixDealSummary[]>([]);

    // ── Modo Leads (lista crua, sem pipeline) ───────────────────────────────────────────────
    const [leads, setLeads] = useState<BitrixLeadSummary[]>([]);

    // ── Busca por nome (comum aos dois modos) ───────────────────────────────────────────────
    // Debounced: dispara a busca de verdade (%TITLE, resolvida no servidor do Bitrix) só 400ms
    // depois da última tecla digitada, senão cada letra digitada vira uma requisição.
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

    // ── Estado compartilhado ─────────────────────────────────────────────────────────────────
    const [start, setStart] = useState(0);
    const [next, setNext] = useState<number | null>(null);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

    const currentYear = new Date().getFullYear();

    // Pipelines + usuários carregam uma vez (independem de filtro/paginação). O backend já só
    // devolve o pipeline Comercial (getDealPipelines filtra os outros pipelines operacionais do
    // portal) — seleciona ele automaticamente em vez de deixar o filtro "vazio" por padrão, senão
    // a etapa fica sem poder ser escolhida até a pessoa clicar manualmente num dropdown que só tem
    // uma opção mesmo.
    useEffect(() => {
        api.get<BitrixDealPipeline[]>(`/api/bitrix/deal-pipelines?connectionId=${connectionId}`).then((data) => {
            setPipelines(data);
            setCategoryId(data[0]?.id ?? '');
        }).catch(() => { setPipelines([]); setCategoryId(''); });
        api.get<BitrixUserOption[]>(`/api/bitrix/users?connectionId=${connectionId}`).then(setUsers).catch(() => setUsers([]));
    }, [connectionId]);

    // Etapas dependem do pipeline escolhido — recarrega ao trocar, e limpa a etapa selecionada
    // (uma etapa de outro pipeline não existe mais no novo contexto).
    useEffect(() => {
        setStageId('');
        if (!categoryId) { setStages([]); return; }
        api.get<BitrixDealStage[]>(`/api/bitrix/deal-stages?connectionId=${connectionId}&categoryId=${categoryId}`).then(setStages).catch(() => setStages([]));
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
            const data = await api.get<{ deals: BitrixDealSummary[]; next: number | null; total: number }>(`/api/bitrix/deals?${params}`);
            setDeals(data.deals);
            setNext(data.next);
            setTotal(data.total);
            setStart(from);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Não foi possível carregar os negócios do Bitrix24.');
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
            const data = await api.get<{ leads: BitrixLeadSummary[]; next: number | null; total: number }>(`/api/bitrix/leads?${params}`);
            setLeads(data.leads);
            setNext(data.next);
            setTotal(data.total);
            setStart(from);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Não foi possível carregar os leads do Bitrix24.');
        } finally {
            setLoading(false);
        }
    };

    const load = (from: number) => (mode === 'deals' ? loadDeals(from) : loadLeads(from));

    // Troca de modo ou de filtro reinicia a listagem do zero — mistura de resultado de filtros
    // diferentes na mesma tela seria confuso, e a seleção antiga não faz mais sentido no novo contexto.
    useEffect(() => {
        setSelected(new Set());
        setImportResult(null);
        load(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionId, mode, categoryId, stageId, assignedById, month, year, debouncedSearch]);

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const importSelected = async () => {
        if (selected.size === 0) return;
        setImporting(true);
        setError('');
        setImportResult(null);
        try {
            const endpoint = mode === 'deals' ? '/api/bitrix/deals/import' : '/api/bitrix/leads/import';
            const body = mode === 'deals'
                ? { connectionId, bitrixDealIds: Array.from(selected) }
                : { connectionId, bitrixLeadIds: Array.from(selected) };
            const result = await api.post<{ imported: number; skipped: number }>(endpoint, body, { timeoutMs: 60_000 });
            setImportResult(result);
            setSelected(new Set());
            await load(start);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao importar os itens selecionados.');
        } finally {
            setImporting(false);
        }
    };

    const userName = (id: string | null) => (id && users.find((u) => u.id === id)?.name) || (id ? `Usuário #${id}` : null);

    return (
        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Importar do Bitrix24</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Escolha manualmente o que trazer — nada é importado sozinho. {total > 0 && `${total} registro(s) no portal.`}</p>
                </div>
                <button
                    onClick={() => load(start)}
                    disabled={loading}
                    className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                    title="Recarregar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="flex gap-1 p-1.5 bg-gray-100/80 dark:bg-white/5 rounded-xl w-fit">
                <button
                    onClick={() => setMode('deals')}
                    className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'deals' ? 'bg-white dark:bg-white/10 text-orange-600 dark:text-orange-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                >
                    Negócios (Comercial)
                </button>
                <button
                    onClick={() => setMode('leads')}
                    className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'leads' ? 'bg-white dark:bg-white/10 text-orange-600 dark:text-orange-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                >
                    Leads (todos)
                </button>
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 p-5 shadow-sm space-y-4">
                <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={mode === 'deals' ? 'Pesquisar por nome da empresa/negócio…' : 'Pesquisar por nome do lead/empresa…'}
                        className="w-full h-9 text-sm rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white pl-9 pr-8 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white"
                            title="Limpar busca"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {mode === 'deals' && (
                    pipelines.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0" />
                            Este portal não tem um pipeline &quot;Comercial&quot; — as vendas dele provavelmente ficam na aba Leads, não em Negócios.
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1">
                                <span className={filterLabelClass}><Filter className="w-3 h-3" /> Pipeline</span>
                                <span className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 text-orange-700 dark:text-orange-300 text-sm font-bold whitespace-nowrap">
                                    {pipelines[0].name}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={filterLabelClass}><Tag className="w-3 h-3" /> Etapa</label>
                                <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={selectClass}>
                                    <option value="">Todas as etapas</option>
                                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={filterLabelClass}><Users className="w-3 h-3" /> Vendedor</label>
                                <select value={assignedById} onChange={(e) => setAssignedById(e.target.value)} className={selectClass}>
                                    <option value="">Todos os vendedores</option>
                                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={filterLabelClass}><CalendarDays className="w-3 h-3" /> Mês</label>
                                <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${selectClass} min-w-[7rem]`}>
                                    <option value="">Todos</option>
                                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={filterLabelClass}>Ano</label>
                                <select value={year} onChange={(e) => setYear(e.target.value)} className={`${selectClass} min-w-[5rem]`}>
                                    <option value="">Todos</option>
                                    {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                    )
                )}
                {mode === 'deals' && pipelines.length > 0 && users.length === 0 && (
                    <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <Info className="w-3 h-3 shrink-0" />
                        O webhook do Bitrix não tem permissão para listar usuários — o filtro de vendedor mostra só o ID bruto. Adicione o escopo &quot;user&quot; ao webhook para ver nomes.
                    </p>
                )}
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            {importResult && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {importResult.imported} registro(s) importado(s){importResult.skipped > 0 ? `, ${importResult.skipped} já existiam` : ''}.
                </p>
            )}

            {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : (
                <div className="max-h-[22rem] overflow-y-auto rounded-2xl border border-gray-100 dark:border-white/10 divide-y divide-gray-100 dark:divide-white/10 shadow-sm bg-white">
                    {mode === 'deals' ? deals.map((deal) => (
                        <label
                            key={deal.id}
                            className={`flex items-start gap-4 p-4 text-sm cursor-pointer transition-colors ${deal.alreadyImported ? 'opacity-50 bg-gray-50' : 'hover:bg-orange-50/50 dark:hover:bg-white/5'}`}
                        >
                            <input type="checkbox" checked={selected.has(deal.id)} disabled={deal.alreadyImported} onChange={() => toggle(deal.id)} className="mt-0.5" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900 dark:text-white truncate">{deal.title}</span>
                                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300 text-[10px] font-bold">{deal.stageLabel}</span>
                                    {deal.alreadyImported && <span className="shrink-0 text-[10px] text-gray-400">já importado</span>}
                                </div>
                                <p className="text-gray-500 dark:text-gray-400 truncate">
                                    {[userName(deal.assignedById), deal.opportunity && `R$ ${Number(deal.opportunity).toLocaleString('pt-BR')}`, deal.dateCreate && new Date(deal.dateCreate).toLocaleDateString('pt-BR')].filter(Boolean).join(' · ') || 'Sem dados adicionais'}
                                </p>
                            </div>
                        </label>
                    )) : leads.map((lead) => (
                        <label
                            key={lead.id}
                            className={`flex items-start gap-4 p-4 text-sm cursor-pointer transition-colors ${lead.alreadyImported ? 'opacity-50 bg-gray-50' : 'hover:bg-orange-50/50 dark:hover:bg-white/5'}`}
                        >
                            <input type="checkbox" checked={selected.has(lead.id)} disabled={lead.alreadyImported} onChange={() => toggle(lead.id)} className="mt-0.5" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900 dark:text-white truncate">{lead.title}</span>
                                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300 text-[10px] font-bold">{lead.statusLabel}</span>
                                    {lead.alreadyImported && <span className="shrink-0 text-[10px] text-gray-400">já importado</span>}
                                </div>
                                <p className="text-gray-500 dark:text-gray-400 truncate">
                                    {[lead.contactName, lead.phone, lead.email].filter(Boolean).join(' · ') || 'Sem contato/telefone/e-mail'}
                                </p>
                            </div>
                        </label>
                    ))}
                    {(mode === 'deals' ? deals.length : leads.length) === 0 && <p className="p-4 text-xs text-gray-500 text-center">Nenhum registro encontrado com esses filtros.</p>}
                </div>
            )}

            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => load(Math.max(0, start - 50))}
                        disabled={loading || start === 0}
                        className="text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30"
                    >
                        ← Anterior
                    </button>
                    <button
                        onClick={() => next != null && load(next)}
                        disabled={loading || next == null}
                        className="text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30"
                    >
                        Próxima →
                    </button>
                </div>
                <button
                    onClick={importSelected}
                    disabled={importing || selected.size === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
                >
                    {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {importing ? 'Importando...' : `Importar ${selected.size > 0 ? `(${selected.size})` : 'selecionados'}`}
                </button>
            </div>
        </div>
    );
}
