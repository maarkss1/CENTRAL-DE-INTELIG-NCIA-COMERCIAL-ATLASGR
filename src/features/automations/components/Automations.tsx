import { useCallback, useEffect, useState } from 'react';
import { Cpu, Plus, Trash2, Loader2, AlertTriangle, X, Zap } from 'lucide-react';

import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { toast } from '../../../lib/toast';
import {
    automationsApi, describeAutomation, TRIGGERS, ACTIONS, LEAD_STATUSES,
    type Automation, type AutomationTrigger, type AutomationAction,
} from '../automations.api';
import { ColdCallStatusCard } from './ColdCallStatusCard';

const inputClass =
    'w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder-ink-2 outline-none focus:border-atlas-orange transition-colors';

const labelClass = 'block text-[11px] uppercase tracking-wide text-ink-2 font-semibold mb-1';

function AutomationForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
    const [name, setName] = useState('');
    const [trigger, setTrigger] = useState<AutomationTrigger>('Lead mudou de status');
    const [statusCondition, setStatusCondition] = useState('');
    const [action, setAction] = useState<AutomationAction>('Notificar equipe');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [dueInDays, setDueInDays] = useState('1');
    const [saving, setSaving] = useState(false);

    // O filtro por etapa só faz sentido para o gatilho de mudança de status.
    const permiteCondicaoStatus = trigger === 'Lead mudou de status';

    const submit = useCallback(async () => {
        if (!name.trim()) {
            toast.error('Dê um nome à automação.');
            return;
        }
        setSaving(true);
        try {
            await automationsApi.create({
                name: name.trim(),
                trigger,
                action,
                conditions: permiteCondicaoStatus && statusCondition ? { status: statusCondition } : null,
                actionConfig: action === 'Notificar equipe'
                    ? { title: title.trim() || name.trim(), body: body.trim() || undefined, kind: 'Info' }
                    // A ligação não tem parâmetro: o agente e o número saem da configuração do
                    // ambiente e do cadastro do lead, não da regra.
                    : action === 'Ligar via SDR de Voz'
                        ? {}
                        : { dueInDays: Number(dueInDays) || 1, type: 'Follow_up' },
            });
            toast.success('Automação criada.');
            onSaved();
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setSaving(false);
        }
    }, [name, trigger, action, statusCondition, title, body, dueInDays, permiteCondicaoStatus, onSaved]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6">
            <Card className="w-full max-w-lg" accentBar>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-ink">Nova automação</h2>
                    <button onClick={onCancel} aria-label="Fechar" className="p-1 rounded-lg text-ink-2 hover:text-ink hover:bg-surface-2">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className={labelClass} htmlFor="auto-nome">Nome</label>
                        <input
                            id="auto-nome" value={name} onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Avisar time quando lead chegar em Proposta"
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="auto-gatilho">Quando</label>
                        <select
                            id="auto-gatilho" value={trigger}
                            onChange={(e) => setTrigger(e.target.value as AutomationTrigger)}
                            className={inputClass}
                        >
                            {TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    {permiteCondicaoStatus && (
                        <div>
                            <label className={labelClass} htmlFor="auto-status">Somente na etapa (opcional)</label>
                            <select
                                id="auto-status" value={statusCondition}
                                onChange={(e) => setStatusCondition(e.target.value)}
                                className={inputClass}
                            >
                                <option value="">Qualquer etapa</option>
                                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className={labelClass} htmlFor="auto-acao">Então</label>
                        <select
                            id="auto-acao" value={action}
                            onChange={(e) => setAction(e.target.value as AutomationAction)}
                            className={inputClass}
                        >
                            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>

                    {action === 'Notificar equipe' ? (
                        <>
                            <div>
                                <label className={labelClass} htmlFor="auto-titulo">Título do aviso</label>
                                <input
                                    id="auto-titulo" value={title} onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Use {{status}} e {{owner}} para inserir dados do lead"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass} htmlFor="auto-corpo">Detalhe (opcional)</label>
                                <input
                                    id="auto-corpo" value={body} onChange={(e) => setBody(e.target.value)}
                                    className={inputClass}
                                />
                            </div>
                        </>
                    ) : action === 'Ligar via SDR de Voz' ? (
                        <p className="text-xs text-ink-2 bg-surface-2 rounded-lg p-3">
                            O SDR de voz liga para o telefone do contato do lead (ou, na falta dele, o da
                            empresa) e registra o resultado da chamada como atividade. Leads sem telefone
                            discável são ignorados.
                        </p>
                    ) : (
                        <div>
                            <label className={labelClass} htmlFor="auto-prazo">Criar follow-up em (dias)</label>
                            <input
                                id="auto-prazo" type="number" min="1" value={dueInDays}
                                onChange={(e) => setDueInDays(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-line">
                    <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
                    <Button onClick={() => void submit()} disabled={saving}>
                        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Criar
                    </Button>
                </div>
            </Card>
        </div>
    );
}

export function Automations() {
    const accent = useBrandAccent();
    const [items, setItems] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setItems(await automationsApi.list());
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const toggle = useCallback(async (item: Automation) => {
        const anterior = items;
        setItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, enabled: !a.enabled } : a)));
        try {
            await automationsApi.update(item.id, { enabled: !item.enabled });
        } catch (err) {
            setItems(anterior);
            toast.error((err as Error).message);
        }
    }, [items]);

    const remove = useCallback(async (item: Automation) => {
        if (!window.confirm(`Remover a automação "${item.name}"?`)) return;
        setBusyId(item.id);
        try {
            await automationsApi.remove(item.id);
            setItems((prev) => prev.filter((a) => a.id !== item.id));
            toast.success('Automação removida.');
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setBusyId(null);
        }
    }, []);

    return (
        <div className="flex-1 overflow-y-auto bg-bg p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4 border-b border-line pb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent.bgSoft} ${accent.text}`}>
                            <Cpu className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-ink">Automações</h1>
                            <p className="text-sm text-ink-2">
                                {loading
                                    ? 'Carregando…'
                                    : `${items.length} regra${items.length === 1 ? '' : 's'} · ${items.filter((a) => a.enabled).length} ativa(s)`}
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Nova automação
                    </Button>
                </div>

                <ColdCallStatusCard />

                {loading && (
                    <Card padding="lg" className="text-center text-ink-2 text-sm">
                        <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> Carregando…
                    </Card>
                )}

                {error && !loading && (
                    <Card padding="lg" className="text-center">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                        <p className="text-sm text-ink-2 mb-4">{error}</p>
                        <Button variant="outline" onClick={() => void load()}>Tentar novamente</Button>
                    </Card>
                )}

                {!loading && !error && items.length === 0 && (
                    <Card padding="lg" className="text-center border-dashed">
                        <Zap className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                        <h3 className="text-lg font-semibold text-ink mb-1">Nenhuma automação ainda</h3>
                        <p className="text-sm text-ink-2 max-w-md mx-auto mb-5">
                            Regras disparam sozinhas quando um lead é criado, muda de etapa ou uma
                            atividade é concluída — avisando a equipe ou agendando o follow-up.
                        </p>
                        <Button onClick={() => setCreating(true)}>
                            <Plus className="w-4 h-4 mr-2" /> Criar a primeira
                        </Button>
                    </Card>
                )}

                <div className="space-y-2">
                    {items.map((item) => (
                        <Card key={item.id} padding="sm" className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-ink truncate">{item.name}</p>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                        item.enabled
                                            ? 'bg-emerald-500/15 text-emerald-300'
                                            : 'bg-slate-500/15 text-slate-400'
                                    }`}>
                                        {item.enabled ? 'ativa' : 'pausada'}
                                    </span>
                                </div>
                                <p className="text-xs text-ink-2 mt-0.5">{describeAutomation(item)}</p>
                                <p className="text-[11px] text-ink-2 mt-0.5">
                                    {item.runCount === 0
                                        ? 'ainda não disparou'
                                        : `${item.runCount} execução(ões)${item.lastRunAt ? ` · última em ${new Date(item.lastRunAt).toLocaleDateString('pt-BR')}` : ''}`}
                                </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => void toggle(item)}
                                    role="switch"
                                    aria-checked={item.enabled}
                                    aria-label={`${item.enabled ? 'Pausar' : 'Ativar'} ${item.name}`}
                                    className={`w-10 h-5 rounded-full transition-colors relative ${
                                        item.enabled ? accent.bg : 'bg-slate-700'
                                    }`}
                                >
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                                        item.enabled ? 'left-[22px]' : 'left-0.5'
                                    }`} />
                                </button>
                                <button
                                    onClick={() => void remove(item)}
                                    disabled={busyId === item.id}
                                    title="Remover automação"
                                    className="p-2 rounded-lg text-ink-2 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                >
                                    {busyId === item.id
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Trash2 className="w-4 h-4" />}
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            {creating && (
                <AutomationForm
                    onCancel={() => setCreating(false)}
                    onSaved={() => { setCreating(false); void load(); }}
                />
            )}
        </div>
    );
}
