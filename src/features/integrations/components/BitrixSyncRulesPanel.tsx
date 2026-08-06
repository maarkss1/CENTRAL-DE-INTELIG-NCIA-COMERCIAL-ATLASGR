import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Zap } from 'lucide-react';
import { api } from '../../../lib/api';

interface BitrixDealPipeline {
    id: string;
    name: string;
}

interface BitrixStageOption {
    id: string;
    name: string;
}

interface BitrixUserOption {
    id: string;
    name: string;
}

interface BitrixSyncRule {
    id: string;
    source: 'lead' | 'deal';
    categoryId: string | null;
    stageId: string | null;
    assignedById: string | null;
    active: boolean;
    lastRunAt: string | null;
    lastImportedCount: number;
}

const selectClass = 'h-9 text-sm rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white px-3 disabled:opacity-40 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none cursor-pointer';

/**
 * Regras de sincronização automática Bitrix → Atlas: diferente do BitrixImportPanel (sempre
 * manual, clique a clique), aqui o usuário define um filtro uma vez, e o worker periódico
 * (bitrixSync.worker.ts, a cada 15 min) traz sozinho o que bater — escopado pela regra, nunca
 * "importar tudo do portal". Cobre os dois objetos do Bitrix: Lead (lista plana de status, sem
 * pipeline) e Deal/Negócio (pipeline + etapa reais) — portais diferentes usam um, outro, ou os
 * dois em paralelo.
 */
interface BitrixSyncRulesPanelProps {
    /** Qual portal Bitrix as regras desta lista pertencem/consultam. */
    connectionId: string;
}

export function BitrixSyncRulesPanel({ connectionId }: BitrixSyncRulesPanelProps) {
    const [pipelines, setPipelines] = useState<BitrixDealPipeline[]>([]);
    const [leadStatuses, setLeadStatuses] = useState<BitrixStageOption[]>([]);
    const [dealStages, setDealStages] = useState<BitrixStageOption[]>([]);
    const [users, setUsers] = useState<BitrixUserOption[]>([]);
    const [rules, setRules] = useState<BitrixSyncRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [newSource, setNewSource] = useState<'lead' | 'deal'>('lead');
    const [newCategoryId, setNewCategoryId] = useState('');
    const [newStageId, setNewStageId] = useState('');
    const [newAssignedById, setNewAssignedById] = useState('');
    const [creating, setCreating] = useState(false);

    const loadRules = () => api.get<BitrixSyncRule[]>(`/api/bitrix/sync-rules?connectionId=${connectionId}`).then(setRules).catch(() => setRules([]));

    useEffect(() => {
        setLoading(true);
        Promise.all([
            // O backend só devolve o pipeline Comercial (os demais são operacionais, não funil de
            // vendas) — pré-seleciona ele em vez de deixar a pessoa escolher entre uma opção só.
            api.get<BitrixDealPipeline[]>(`/api/bitrix/deal-pipelines?connectionId=${connectionId}`).then((data) => {
                setPipelines(data);
                setNewCategoryId(data[0]?.id ?? '');
            }).catch(() => { setPipelines([]); setNewCategoryId(''); }),
            api.get<BitrixStageOption[]>(`/api/bitrix/lead-statuses?connectionId=${connectionId}`).then(setLeadStatuses).catch(() => setLeadStatuses([])),
            api.get<BitrixUserOption[]>(`/api/bitrix/users?connectionId=${connectionId}`).then(setUsers).catch(() => setUsers([])),
            loadRules(),
        ]).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionId]);

    // Etapas de Negócio dependem do pipeline escolhido; status de Lead já vieram prontos (sem pipeline).
    useEffect(() => {
        setNewStageId('');
        if (newSource !== 'deal' || !newCategoryId) { setDealStages([]); return; }
        api.get<BitrixStageOption[]>(`/api/bitrix/deal-stages?connectionId=${connectionId}&categoryId=${newCategoryId}`).then(setDealStages).catch(() => setDealStages([]));
    }, [connectionId, newSource, newCategoryId]);

    const pipelineName = (id: string | null) => (id && pipelines.find((p) => p.id === id)?.name) || (id ? `Pipeline #${id}` : null);
    const userName = (id: string | null) => (id && users.find((u) => u.id === id)?.name) || (id ? `Usuário #${id}` : null);
    const stageName = (rule: BitrixSyncRule) => {
        if (!rule.stageId) return null;
        const options = rule.source === 'lead' ? leadStatuses : dealStages;
        return options.find((s) => s.id === rule.stageId)?.name || rule.stageId;
    };

    const addRule = async () => {
        if (newSource === 'deal' && !newCategoryId) return;
        setCreating(true);
        setError('');
        try {
            await api.post('/api/bitrix/sync-rules', {
                connectionId,
                source: newSource,
                categoryId: newSource === 'deal' ? newCategoryId : null,
                stageId: newStageId || null,
                assignedById: newAssignedById || null,
            });
            setNewCategoryId('');
            setNewStageId('');
            setNewAssignedById('');
            await loadRules();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao criar a regra.');
        } finally {
            setCreating(false);
        }
    };

    const toggleRule = async (rule: BitrixSyncRule) => {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)));
        try {
            await api.put(`/api/bitrix/sync-rules/${rule.id}`, { active: !rule.active });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao atualizar a regra.');
            await loadRules();
        }
    };

    const removeRule = async (ruleId: string) => {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
        try {
            await api.delete(`/api/bitrix/sync-rules/${ruleId}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao remover a regra.');
            await loadRules();
        }
    };

    // Para a regra em criação: status de Lead ou etapa de Negócio, conforme o source escolhido.
    const newStageOptions = newSource === 'lead' ? leadStatuses : dealStages;

    return (
        <div className="mt-8 pt-8 border-t border-gray-100 dark:border-white/10 space-y-4">
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-orange-500" /> Sincronização automática
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
                    O Atlas verifica cada regra a cada 15 minutos e importa sozinho só o que bater com o filtro — sem regra ativa, nada é trazido automaticamente.
                </p>
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
            ) : (
                <>
                    {rules.length > 0 && (
                        <div className="space-y-2">
                            {rules.map((rule) => (
                                <div key={rule.id} className="flex items-center gap-4 p-4 text-sm rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm transition-all hover:border-gray-200">
                                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                        <input type="checkbox" checked={rule.active} onChange={() => toggleRule(rule)} className="sr-only peer" />
                                        <div className="w-8 h-4.5 bg-gray-200 dark:bg-white/10 rounded-full peer-checked:bg-orange-600 transition-colors" />
                                        <div className="absolute left-0.5 top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform peer-checked:translate-x-3.5" />
                                    </label>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-gray-900 dark:text-white truncate">
                                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[10px] uppercase mr-1.5">{rule.source === 'lead' ? 'Lead' : 'Negócio'}</span>
                                            {rule.source === 'deal' ? pipelineName(rule.categoryId) : 'Todos os leads'}
                                            {stageName(rule) && <span className="font-normal text-gray-500 dark:text-gray-400"> · {stageName(rule)}</span>}
                                            {rule.assignedById && <span className="font-normal text-gray-500 dark:text-gray-400"> · {userName(rule.assignedById)}</span>}
                                        </div>
                                        <p className="text-gray-500 dark:text-gray-400">
                                            {rule.lastRunAt
                                                ? `Última rodada: ${new Date(rule.lastRunAt).toLocaleString('pt-BR')} — ${rule.lastImportedCount} importado(s)`
                                                : 'Ainda não rodou'}
                                        </p>
                                    </div>
                                    <button onClick={() => removeRule(rule.id)} className="shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors dark:hover:text-red-400" title="Remover regra">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex gap-1 p-1.5 bg-gray-100/80 dark:bg-white/5 rounded-xl">
                            <button
                                onClick={() => setNewSource('lead')}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${newSource === 'lead' ? 'bg-white dark:bg-white/10 text-orange-600 dark:text-orange-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                            >
                                Lead
                            </button>
                            <button
                                onClick={() => setNewSource('deal')}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${newSource === 'deal' ? 'bg-white dark:bg-white/10 text-orange-600 dark:text-orange-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                            >
                                Negócio
                            </button>
                        </div>
                        {newSource === 'deal' && (
                            pipelines.length > 0 ? (
                                <span className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 text-orange-700 dark:text-orange-300 text-sm font-bold whitespace-nowrap">
                                    {pipelines[0].name}
                                </span>
                            ) : (
                                <span className="text-[11px] text-gray-400 italic">
                                    Este portal não tem pipeline Comercial — use uma regra de Lead.
                                </span>
                            )
                        )}
                        <select
                            value={newStageId}
                            onChange={(e) => setNewStageId(e.target.value)}
                            disabled={newSource === 'deal' && !newCategoryId}
                            className={selectClass}
                        >
                            <option value="">{newSource === 'lead' ? 'Todos os status' : 'Todas as etapas'}</option>
                            {newStageOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select value={newAssignedById} onChange={(e) => setNewAssignedById(e.target.value)} className={selectClass}>
                            <option value="">Todos os vendedores</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                        <button
                            onClick={addRule}
                            disabled={(newSource === 'deal' && !newCategoryId) || creating}
                            className="flex items-center gap-2 h-9 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                        >
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Nova regra
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
