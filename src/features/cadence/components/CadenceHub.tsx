import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Pause, Play, Plus, RefreshCw, Repeat, ShieldOff, Square, Trash2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge, type BadgeProps } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { toast } from '../../../lib/toast';
import {
    cadenceApi,
    type CadenceChannel,
    type CadenceRunDTO,
    type CadenceRunStatus,
    type CadenceSequenceDTO,
    type CadenceStopReason,
    type CadenceTouchInput,
    type CadenceTouchResult,
    type OptOutRecordDTO,
    type OptOutOriginChannel,
    type OptOutScope,
} from '../cadence.api';

/**
 * Tela de cadência multicanal e ciclo de receita (Agente 17, Onda 10) — ver
 * `.agents/handoffs/onda-7/17-para-02-rota-cadencia.md`. Densidade alta, sem hero centralizada
 * (constituição de design, `.claude/CLAUDE.md` §4/§7): duas seções de dado real (execuções de
 * cadência, registros de opt-out) mais uma nota honesta do que ainda não existe — nada de dado
 * fictício preenchendo espaço.
 *
 * Cada seção busca e trata seu próprio loading/erro/vazio de forma independente (mesmo padrão de
 * `AgingTab.tsx`/`CrmQualityTab.tsx`): uma falha em `/api/cadence/opt-outs` não deve impedir
 * `/api/cadence/runs` de aparecer, e vice-versa.
 */

const CHANNEL_LABEL: Record<CadenceChannel, string> = {
    email: 'E-mail',
    whatsapp: 'WhatsApp',
    voice: 'Voz',
};

const SCOPE_LABEL: Record<OptOutScope, string> = {
    email: 'E-mail',
    whatsapp: 'WhatsApp',
    voice: 'Voz',
    global: 'Global (todos os canais)',
};

const ORIGIN_LABEL: Record<OptOutOriginChannel, string> = {
    email: 'E-mail',
    whatsapp: 'WhatsApp',
    voice: 'Voz',
    manual: 'Registro manual',
    import: 'Importação',
};

const STATUS_LABEL: Record<CadenceRunStatus, string> = {
    active: 'Ativa',
    paused: 'Pausada',
    stopped: 'Encerrada',
    completed: 'Concluída',
    failed: 'Falhou',
};

const STOP_REASON_LABEL: Record<CadenceStopReason, string> = {
    'opt-out': 'Opt-out',
    'lead-reply': 'Lead respondeu',
    completed: 'Sequência concluída',
    'manual-stop': 'Parada manual',
    'policy-guardrail': 'Falha estrutural (sequência inválida)',
};

const TOUCH_RESULT_LABEL: Record<CadenceTouchResult, string> = {
    sent: 'Enviado',
    failed: 'Falhou',
    skipped: 'Pulado',
};

const STATUS_FILTERS: CadenceRunStatus[] = ['active', 'paused', 'stopped', 'completed', 'failed'];

function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function runStatusBadgeVariant(status: CadenceRunStatus): BadgeProps['variant'] {
    if (status === 'active') return 'success';
    if (status === 'paused') return 'warning';
    if (status === 'completed') return 'info';
    if (status === 'failed') return 'danger';
    return 'default';
}

function stopReasonBadgeVariant(reason: CadenceStopReason): BadgeProps['variant'] {
    if (reason === 'opt-out') return 'danger';
    if (reason === 'lead-reply') return 'info';
    if (reason === 'manual-stop') return 'outline';
    if (reason === 'policy-guardrail') return 'danger';
    return 'default';
}

function scopeBadgeVariant(scope: OptOutScope): BadgeProps['variant'] {
    return scope === 'global' ? 'danger' : 'info';
}

function touchResultBadgeVariant(result: CadenceTouchResult): BadgeProps['variant'] {
    if (result === 'sent') return 'success';
    if (result === 'failed') return 'danger';
    return 'outline';
}

// ── Opt-outs ─────────────────────────────────────────────────────────────

function OptOutsSection() {
    const [data, setData] = useState<OptOutRecordDTO[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        cadenceApi
            .optOuts()
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => load(), [load]);

    return (
        <Card padding="sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <ShieldOff className="w-4 h-4 text-brand" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-ink">Opt-outs registrados</h2>
                    {data && data.length > 0 && (
                        <span className="text-[11px] font-semibold text-ink-2 bg-surface-2 border border-line rounded-full px-2 py-0.5">
                            {data.length}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={load}
                    className="p-1.5 text-ink-2 hover:text-ink hover:bg-surface-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    title="Atualizar"
                    aria-label="Atualizar registros de opt-out"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {loading ? (
                <div className="space-y-2" role="status" aria-live="polite" aria-label="Carregando opt-outs">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                </div>
            ) : error ? (
                <div className="flex items-center justify-between gap-3 text-sm text-danger py-4" role="alert">
                    <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</span>
                    <button type="button" onClick={load} className="text-xs font-semibold underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
                        Tentar de novo
                    </button>
                </div>
            ) : !data || data.length === 0 ? (
                <EmptyState
                    title="Nenhum opt-out registrado"
                    description="Quando um lead pedir para não ser contatado (por e-mail, WhatsApp ou voz), o registro aparece aqui e bloqueia os três canais a partir do mesmo pedido."
                    icon={<ShieldOff className="w-8 h-8 text-brand" />}
                />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-ink-2 border-b border-line">
                                <th className="text-left font-semibold py-1.5 pr-3">Escopo</th>
                                <th className="text-left font-semibold py-1.5 pr-3">Origem do pedido</th>
                                <th className="text-left font-semibold py-1.5 pr-3">Motivo</th>
                                <th className="text-left font-semibold py-1.5 pr-3">Lead</th>
                                <th className="text-right font-semibold py-1.5">Registrado em</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((record) => (
                                <tr key={record.id} className="border-b border-line last:border-0">
                                    <td className="py-1.5 pr-3">
                                        <Badge variant={scopeBadgeVariant(record.scope)}>{SCOPE_LABEL[record.scope]}</Badge>
                                    </td>
                                    <td className="py-1.5 pr-3 text-ink-2">{ORIGIN_LABEL[record.originChannel]}</td>
                                    <td className="py-1.5 pr-3 text-ink-2 max-w-xs truncate" title={record.reason ?? undefined}>
                                        {record.reason ?? '—'}
                                    </td>
                                    <td className="py-1.5 pr-3 text-ink-2 font-mono" title={record.leadId ?? undefined}>
                                        {record.leadId ? `${record.leadId.slice(0, 8)}…` : '—'}
                                    </td>
                                    <td className="py-1.5 text-right text-ink-2 [font-variant-numeric:tabular-nums]">
                                        {formatDateTime(record.createdAt)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

// ── Cadence runs ─────────────────────────────────────────────────────────

/** CYC-009 (onda 29) — as únicas duas ações reais possíveis num run não-terminal (`pauseCadenceRun`/`resumeCadenceRun`/`stopCadenceManually` já existiam no domínio, só sem rota nenhuma chamando-os). Parar é irreversível (mesmo raciocínio de `stopCadenceManually` — "distinta de pausa: não tem retomada") — por isso exige confirmação, mesmo padrão de `window.confirm` já usado em `LeadDetailDrawer.tsx` para excluir um lead. */
function CadenceRunActions({ run, onChanged }: { run: CadenceRunDTO; onChanged: () => void }) {
    const [pending, setPending] = useState<'pause' | 'resume' | 'stop' | null>(null);

    const runAction = async (action: 'pause' | 'resume' | 'stop', fn: () => Promise<CadenceRunDTO>, successMessage: string) => {
        setPending(action);
        try {
            await fn();
            toast.success(successMessage);
            onChanged();
        } catch (err) {
            toast.error((err as Error).message || 'Não foi possível concluir a ação.');
        } finally {
            setPending(null);
        }
    };

    if (run.status === 'active') {
        return (
            <div className="flex items-center justify-end gap-1">
                <button
                    type="button"
                    onClick={() => runAction('pause', () => cadenceApi.pauseRun(run.id), 'Cadência pausada.')}
                    disabled={pending !== null}
                    aria-label={`Pausar cadência do lead ${run.leadId}`}
                    title="Pausar"
                    className="p-1.5 text-ink-2 hover:text-brand hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                    <Pause className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (!window.confirm('Parar esta cadência? Diferente de pausar, uma cadência parada não pode ser retomada.')) return;
                        void runAction('stop', () => cadenceApi.stopRun(run.id), 'Cadência parada.');
                    }}
                    disabled={pending !== null}
                    aria-label={`Parar cadência do lead ${run.leadId}`}
                    title="Parar"
                    className="p-1.5 text-ink-2 hover:text-danger hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                    <Square className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    if (run.status === 'paused') {
        return (
            <div className="flex items-center justify-end gap-1">
                <button
                    type="button"
                    onClick={() => runAction('resume', () => cadenceApi.resumeRun(run.id), 'Cadência retomada.')}
                    disabled={pending !== null}
                    aria-label={`Retomar cadência do lead ${run.leadId}`}
                    title="Retomar"
                    className="p-1.5 text-ink-2 hover:text-brand hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                    <Play className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (!window.confirm('Parar esta cadência? Diferente de pausar, uma cadência parada não pode ser retomada.')) return;
                        void runAction('stop', () => cadenceApi.stopRun(run.id), 'Cadência parada.');
                    }}
                    disabled={pending !== null}
                    aria-label={`Parar cadência do lead ${run.leadId}`}
                    title="Parar"
                    className="p-1.5 text-ink-2 hover:text-danger hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                    <Square className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    return <span className="text-ink-2 text-right block">—</span>;
}

function CadenceRunRow({ run, onChanged }: { run: CadenceRunDTO; onChanged: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const lastAttempt = run.attempts[run.attempts.length - 1] ?? null;

    return (
        <>
            <tr className="border-b border-line last:border-0 align-top">
                <td className="py-1.5 pr-3">
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        disabled={run.attempts.length === 0}
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Ocultar histórico de tentativas' : 'Ver histórico de tentativas'}
                        className="flex items-center gap-1 text-ink hover:text-brand disabled:text-ink-2 disabled:cursor-default transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                    >
                        {run.attempts.length > 0 && (expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />)}
                        <span className="font-mono" title={run.leadId}>{run.leadId.slice(0, 8)}…</span>
                    </button>
                </td>
                <td className="py-1.5 pr-3">
                    <Badge variant={runStatusBadgeVariant(run.status)}>{STATUS_LABEL[run.status]}</Badge>
                </td>
                <td className="py-1.5 pr-3 text-ink-2">
                    {run.stopReason ? (
                        <Badge variant={stopReasonBadgeVariant(run.stopReason)}>{STOP_REASON_LABEL[run.stopReason]}</Badge>
                    ) : '—'}
                </td>
                <td className="py-1.5 pr-3 text-ink-2 text-center [font-variant-numeric:tabular-nums]">{run.currentTouchOrder}</td>
                <td className="py-1.5 pr-3 text-ink-2">
                    {lastAttempt ? (
                        <span className="flex items-center gap-1.5">
                            {CHANNEL_LABEL[lastAttempt.channel]}
                            <Badge variant={touchResultBadgeVariant(lastAttempt.result)}>{TOUCH_RESULT_LABEL[lastAttempt.result]}</Badge>
                        </span>
                    ) : 'Sem tentativa ainda'}
                </td>
                <td className="py-1.5 pr-3 text-ink-2 text-right [font-variant-numeric:tabular-nums]">{formatDateTime(run.startedAt)}</td>
                <td className="py-1.5 text-right">
                    <CadenceRunActions run={run} onChanged={onChanged} />
                </td>
            </tr>
            {expanded && run.attempts.length > 0 && (
                <tr className="border-b border-line last:border-0">
                    <td colSpan={7} className="py-2 pl-8 pr-3 bg-surface-2">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="text-ink-2">
                                    <th className="text-left font-semibold py-1 pr-3">Toque</th>
                                    <th className="text-left font-semibold py-1 pr-3">Tentativa</th>
                                    <th className="text-left font-semibold py-1 pr-3">Canal</th>
                                    <th className="text-left font-semibold py-1 pr-3">Resultado</th>
                                    <th className="text-left font-semibold py-1 pr-3">Erro</th>
                                    <th className="text-right font-semibold py-1">Quando</th>
                                </tr>
                            </thead>
                            <tbody>
                                {run.attempts.map((attempt, idx) => (

                                    <tr key={idx}>
                                        <td className="py-1 pr-3 text-ink-2">{attempt.touchOrder}</td>
                                        <td className="py-1 pr-3 text-ink-2 [font-variant-numeric:tabular-nums]">{attempt.attemptNumber}</td>
                                        <td className="py-1 pr-3 text-ink-2">{CHANNEL_LABEL[attempt.channel]}</td>
                                        <td className="py-1 pr-3"><Badge variant={touchResultBadgeVariant(attempt.result)}>{TOUCH_RESULT_LABEL[attempt.result]}</Badge></td>
                                        <td className="py-1 pr-3 text-ink-2 max-w-xs truncate" title={attempt.error ?? undefined}>{attempt.error ?? '—'}</td>
                                        <td className="py-1 text-right text-ink-2 [font-variant-numeric:tabular-nums]">{formatDateTime(attempt.attemptedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </td>
                </tr>
            )}
        </>
    );
}

function CadenceRunsSection() {
    const [data, setData] = useState<CadenceRunDTO[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<Set<CadenceRunStatus>>(new Set(['active', 'paused']));

    const load = useCallback(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        cadenceApi
            .runs(statusFilter.size > 0 ? [...statusFilter] : undefined)
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
         
    }, [statusFilter]);

    useEffect(() => load(), [load]);

    const toggleStatus = (status: CadenceRunStatus) => {
        setStatusFilter((prev) => {
            const next = new Set(prev);
            if (next.has(status)) next.delete(status);
            else next.add(status);
            return next;
        });
    };

    return (
        <Card padding="sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-brand" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-ink">Execuções de cadência</h2>
                    {data && data.length > 0 && (
                        <span className="text-[11px] font-semibold text-ink-2 bg-surface-2 border border-line rounded-full px-2 py-0.5">
                            {data.length}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1" role="group" aria-label="Filtrar por status">
                        {STATUS_FILTERS.map((status) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => toggleStatus(status)}
                                aria-pressed={statusFilter.has(status)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                    statusFilter.has(status)
                                        ? 'bg-brand-active text-white border-brand-active'
                                        : 'bg-surface-2 text-ink-2 border-line hover:text-ink'
                                }`}
                            >
                                {STATUS_LABEL[status]}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={load}
                        className="p-1.5 text-ink-2 hover:text-ink hover:bg-surface-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        title="Atualizar"
                        aria-label="Atualizar execuções de cadência"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="space-y-2" role="status" aria-live="polite" aria-label="Carregando execuções de cadência">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                </div>
            ) : error ? (
                <div className="flex items-center justify-between gap-3 text-sm text-danger py-4" role="alert">
                    <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</span>
                    <button type="button" onClick={load} className="text-xs font-semibold underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
                        Tentar de novo
                    </button>
                </div>
            ) : !data || data.length === 0 ? (
                <EmptyState
                    title={statusFilter.size < STATUS_FILTERS.length ? 'Nenhuma execução para este filtro' : 'Nenhuma execução de cadência'}
                    description="Quando uma sequência multicanal for iniciada para um lead, o progresso, pausas e motivo de parada aparecem aqui."
                    icon={<Repeat className="w-8 h-8 text-brand" />}
                />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-ink-2 border-b border-line">
                                <th className="text-left font-semibold py-1.5 pr-3">Lead</th>
                                <th className="text-left font-semibold py-1.5 pr-3">Status</th>
                                <th className="text-left font-semibold py-1.5 pr-3">Motivo de parada</th>
                                <th className="text-center font-semibold py-1.5 pr-3">Toque atual</th>
                                <th className="text-left font-semibold py-1.5 pr-3">Última tentativa</th>
                                <th className="text-right font-semibold py-1.5 pr-3">Iniciada em</th>
                                <th className="text-right font-semibold py-1.5">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((run) => <CadenceRunRow key={run.id} run={run} onChanged={load} />)}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

// ── Nova sequência ───────────────────────────────────────────────────────

const CHANNEL_OPTIONS: CadenceChannel[] = ['email', 'whatsapp', 'voice'];
const EMPTY_TOUCH: CadenceTouchInput = { order: 1, channel: 'email', delayHoursFromPrevious: 0, templateRef: '' };

function NewSequenceDialog({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('');
    const [touches, setTouches] = useState<CadenceTouchInput[]>([{ ...EMPTY_TOUCH }]);
    const [submitting, setSubmitting] = useState(false);

    const reset = () => {
        setName('');
        setTouches([{ ...EMPTY_TOUCH }]);
    };

    const addTouch = () => {
        setTouches((prev) => [...prev, { ...EMPTY_TOUCH, order: prev.length + 1 }]);
    };

    const removeTouch = (index: number) => {
        setTouches((prev) => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, order: i + 1 })));
    };

    const updateTouch = (index: number, patch: Partial<CadenceTouchInput>) => {
        setTouches((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error('Dê um nome para a sequência.');
            return;
        }
        if (touches.some((t) => !t.templateRef?.trim())) {
            toast.error('Toda mensagem precisa de conteúdo — nenhum toque pode ficar vazio.');
            return;
        }
        setSubmitting(true);
        try {
            await cadenceApi.createSequence({ name: name.trim(), touches });
            toast.success('Sequência criada.');
            reset();
            onCreated();
            onClose();
        } catch (err) {
            toast.error((err as Error).message || 'Não foi possível criar a sequência.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={() => { if (!submitting) { reset(); onClose(); } }}
            title="Nova sequência de cadência"
            maxWidth="max-w-2xl"
            preventClose={submitting}
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
                    <Button type="button" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Criando…' : 'Criar sequência'}
                    </Button>
                </>
            }
        >
            {/* Corpo só renderiza aberto — o <dialog> nativo não desmonta filhos ao fechar, e um
                <select> de canal sempre presente no DOM (mesmo fechado) colidiria com badges de
                canal renderizados em outras seções da mesma tela para queries de teste/a11y. */}
            {isOpen && <div className="space-y-4">
                <div>
                    <label htmlFor="sequence-name" className="block text-xs font-semibold text-ink-2 mb-1">Nome da sequência</label>
                    <input
                        id="sequence-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex.: E-mail → WhatsApp (follow-up padrão)"
                        className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-2">Toques (na ordem em que disparam)</span>
                        <Button type="button" variant="outline" size="sm" onClick={addTouch}>
                            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Adicionar toque
                        </Button>
                    </div>
                    {touches.map((touch, index) => (
                        <div key={index} className="rounded-lg border border-line p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-ink">Toque {touch.order}</span>
                                {touches.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeTouch(index)}
                                        aria-label={`Remover toque ${touch.order}`}
                                        className="p-1 text-ink-2 hover:text-danger rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label htmlFor={`touch-channel-${index}`} className="block text-[11px] font-semibold text-ink-2 mb-1">Canal</label>
                                    <select
                                        id={`touch-channel-${index}`}
                                        value={touch.channel}
                                        onChange={(e) => updateTouch(index, { channel: e.target.value as CadenceChannel })}
                                        className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                    >
                                        {CHANNEL_OPTIONS.map((c) => (
                                            <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor={`touch-delay-${index}`} className="block text-[11px] font-semibold text-ink-2 mb-1">
                                        Horas após o toque anterior
                                    </label>
                                    <input
                                        id={`touch-delay-${index}`}
                                        type="number"
                                        min={0}
                                        value={touch.delayHoursFromPrevious}
                                        onChange={(e) => updateTouch(index, { delayHoursFromPrevious: Math.max(0, Number(e.target.value)) })}
                                        className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor={`touch-content-${index}`} className="block text-[11px] font-semibold text-ink-2 mb-1">
                                    Conteúdo da mensagem (sem sistema de template ainda — é o texto final)
                                </label>
                                <textarea
                                    id={`touch-content-${index}`}
                                    value={touch.templateRef ?? ''}
                                    onChange={(e) => updateTouch(index, { templateRef: e.target.value })}
                                    rows={2}
                                    className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>}
        </Dialog>
    );
}

// ── Iniciar cadência ─────────────────────────────────────────────────────

function StartRunDialog({ isOpen, onClose, onStarted }: { isOpen: boolean; onClose: () => void; onStarted: () => void }) {
    const [leadId, setLeadId] = useState('');
    const [sequenceId, setSequenceId] = useState('');
    const [sequences, setSequences] = useState<CadenceSequenceDTO[] | null>(null);
    const [loadingSequences, setLoadingSequences] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setLoadingSequences(true);
        cadenceApi.sequences()
            .then((result) => { if (!cancelled) { setSequences(result); if (result[0]) setSequenceId(result[0].id); } })
            .catch((err) => !cancelled && toast.error((err as Error).message || 'Não foi possível carregar as sequências.'))
            .finally(() => !cancelled && setLoadingSequences(false));
        return () => { cancelled = true; };
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!leadId.trim() || !sequenceId) {
            toast.error('Informe o lead e escolha uma sequência.');
            return;
        }
        setSubmitting(true);
        try {
            const result = await cadenceApi.startRun({ leadId: leadId.trim(), sequenceId });
            toast.success(`Cadência "${result.sequenceName}" iniciada para o lead.`);
            setLeadId('');
            onStarted();
            onClose();
        } catch (err) {
            toast.error((err as Error).message || 'Não foi possível iniciar a cadência.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={() => { if (!submitting) onClose(); }}
            title="Iniciar cadência para um lead"
            preventClose={submitting}
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
                    <Button type="button" onClick={handleSubmit} disabled={submitting || !sequences || sequences.length === 0}>
                        {submitting ? 'Iniciando…' : 'Iniciar'}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div>
                    <label htmlFor="run-lead-id" className="block text-xs font-semibold text-ink-2 mb-1">ID do lead</label>
                    <input
                        id="run-lead-id"
                        type="text"
                        value={leadId}
                        onChange={(e) => setLeadId(e.target.value)}
                        placeholder="Cole o ID do lead (visível na tabela de execuções ou no CRM)"
                        className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                </div>
                <div>
                    <label htmlFor="run-sequence" className="block text-xs font-semibold text-ink-2 mb-1">Sequência</label>
                    {loadingSequences ? (
                        <Skeleton className="h-9 w-full" />
                    ) : !sequences || sequences.length === 0 ? (
                        <p className="text-xs text-ink-2">Nenhuma sequência criada ainda — crie uma primeiro em &ldquo;Nova sequência&rdquo;.</p>
                    ) : (
                        <select
                            id="run-sequence"
                            value={sequenceId}
                            onChange={(e) => setSequenceId(e.target.value)}
                            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                            {sequences.map((seq) => (
                                <option key={seq.id} value={seq.id}>{seq.name} ({seq.touches.length} toque{seq.touches.length === 1 ? '' : 's'})</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>
        </Dialog>
    );
}

// ── Página ───────────────────────────────────────────────────────────────

export function CadenceHub() {
    const [runsKey, setRunsKey] = useState(0);
    const [newSequenceOpen, setNewSequenceOpen] = useState(false);
    const [startRunOpen, setStartRunOpen] = useState(false);

    return (
        <main className="flex-1 overflow-y-auto bg-bg text-ink p-6 md:p-8 space-y-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2 tracking-tight">
                            <Repeat className="w-5 h-5 text-brand" aria-hidden="true" />
                            Cadência & Ciclo de Receita
                        </h1>
                        <p className="text-sm text-ink-2 max-w-2xl">
                            Opt-outs unificados por lead/canal e o estado real de cada sequência multicanal em
                            andamento — nada aqui é inferido, é o que os canais confirmaram de verdade.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button type="button" variant="outline" size="sm" onClick={() => setNewSequenceOpen(true)}>
                            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Nova sequência
                        </Button>
                        <Button type="button" size="sm" onClick={() => setStartRunOpen(true)}>
                            <Play className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Iniciar cadência
                        </Button>
                    </div>
                </header>

                <CadenceRunsSection key={runsKey} />
                <OptOutsSection />

                <Card padding="sm" variant="outline" className="border-dashed">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-ink-2 mb-1.5">Em breve nesta tela</h2>
                    <p className="text-xs text-ink-2 leading-relaxed">
                        Reply-tracking de e-mail, agendamento no Google Calendar e proposta/assinatura/fechamento
                        (entregas 3–5 do ciclo de receita) já têm API real, mas ainda não têm seção própria nesta
                        tela — hoje aparecem em outros pontos do CRM (ex.: ações de documento comercial). Quando
                        ganharem uma visão dedicada de cadência, entram aqui. Esta nota é só um aviso honesto do
                        escopo atual, não um espaço reservado com dado de exemplo.
                    </p>
                </Card>
            </div>

            <NewSequenceDialog isOpen={newSequenceOpen} onClose={() => setNewSequenceOpen(false)} onCreated={() => setRunsKey((k) => k + 1)} />
            <StartRunDialog isOpen={startRunOpen} onClose={() => setStartRunOpen(false)} onStarted={() => setRunsKey((k) => k + 1)} />
        </main>
    );
}
