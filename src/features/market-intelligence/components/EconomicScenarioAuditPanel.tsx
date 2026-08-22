import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, History, Loader2, RotateCcw, Save } from 'lucide-react';
import { economicScenarioApi } from '../economicScenario.api';
import type {
    EconomicScenarioSaveInput,
    SavedEconomicScenario,
    SavedEconomicScenarioSummary,
} from '../domain/economicScenarioAudit';

interface Props {
    input: EconomicScenarioSaveInput;
    onLoad: (scenario: SavedEconomicScenario) => void;
}

const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function recommendationLabel(value: SavedEconomicScenarioSummary['recommendation']): string {
    if (value === 'RECOMENDADO') return 'RECOMENDADO';
    if (value === 'NAO_RECOMENDADO') return 'NÃO RECOMENDADO';
    if (value === 'POLITICA_PENDENTE') return 'POLÍTICA PENDENTE';
    return 'PREMISSAS PENDENTES';
}

export function EconomicScenarioAuditPanel({ input, onLoad }: Props) {
    const [items, setItems] = useState<SavedEconomicScenarioSummary[]>([]);
    const [label, setLabel] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [savedId, setSavedId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const data = await economicScenarioApi.list(12);
            setItems(data);
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico econômico.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const save = async () => {
        setSaving(true);
        setSavedId(null);
        try {
            const saved = await economicScenarioApi.save({ ...input, label: label.trim() || undefined });
            setSavedId(saved.id);
            setLabel('');
            setError(null);
            await refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o snapshot econômico.');
        } finally {
            setSaving(false);
        }
    };

    const load = async (id: string) => {
        setLoadingId(id);
        try {
            const scenario = await economicScenarioApi.get(id);
            onLoad(scenario);
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível reabrir o snapshot econômico.');
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7" aria-labelledby="economic-audit-title">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-3">
                    <div className="rounded-2xl bg-slate-100 p-2.5 text-[#FF5618]"><Archive className="h-5 w-5" aria-hidden="true" /></div>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF5618]">Registro de decisão · v1.4</p>
                        <h3 id="economic-audit-title" className="mt-1 text-lg font-black text-[#333333]">Snapshots econômicos imutáveis</h3>
                        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Salva território canônico, premissas, política, calibração CRM e o cálculo refeito no servidor. Reabrir um snapshot restaura as premissas, mas não reaplica automaticamente uma calibração CRM histórica em uma nova versão.</p>
                    </div>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-600"><History className="h-4 w-4" aria-hidden="true" />APPEND-ONLY</span>
            </div>

            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end">
                <label className="flex-1 text-xs font-bold text-slate-600">Nome do snapshot
                    <input aria-label="Nome do snapshot" maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Expansão SP · orçamento aprovado" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#FF5618]" />
                </label>
                <button type="button" aria-label="Salvar snapshot auditável" disabled={saving} onClick={() => void save()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#333333] px-4 py-2.5 text-xs font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    Salvar snapshot
                </button>
            </div>

            {savedId && <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Snapshot registrado. Salvar novamente sem alterar premissas reutiliza o mesmo hash.</div>}
            {error && <div role="alert" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>}

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-black text-[#333333]">Histórico recente</p>
                    <button type="button" aria-label="Atualizar histórico econômico" onClick={() => { setLoading(true); void refresh(); }} className="text-slate-500 hover:text-[#333333]"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
                </div>
                {loading ? (
                    <div className="flex items-center gap-2 p-4 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Carregando snapshots...</div>
                ) : items.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">Nenhum cenário auditável registrado para esta organização.</p>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {items.map((item) => (
                            <article key={item.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-black text-[#333333]">{item.label}</p>
                                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{recommendationLabel(item.recommendation)}</span>
                                        {item.calibrationApplied && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">CRM {item.calibrationQuality ?? 'APLICADO'}</span>}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">{item.baseCity}/{item.uf} · {item.radiusKm} km · {item.commercialScenario} · {new Date(item.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                                    <p className="mt-1 text-[11px] text-slate-400">Custo {money.format(item.monthlyFixedCost)} · Payback {item.paybackMonth === null ? 'N/A' : `${item.paybackMonth}m`} · ROI 12m {item.roi12Pct === null ? 'N/A' : `${pct.format(item.roi12Pct)}%`} · hash {item.snapshotHash.slice(0, 10)}</p>
                                </div>
                                <button type="button" aria-label={`Carregar snapshot ${item.label}`} disabled={loadingId === item.id} onClick={() => void load(item.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                    {loadingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <History className="h-4 w-4" aria-hidden="true" />}
                                    Reabrir
                                </button>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
