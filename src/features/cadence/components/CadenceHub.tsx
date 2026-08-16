import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Repeat, ShieldOff } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge, type BadgeProps } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
    cadenceApi,
    type CadenceChannel,
    type CadenceRunDTO,
    type CadenceRunStatus,
    type CadenceStopReason,
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
};

const STOP_REASON_LABEL: Record<CadenceStopReason, string> = {
    'opt-out': 'Opt-out',
    'lead-reply': 'Lead respondeu',
    completed: 'Sequência concluída',
    'manual-stop': 'Parada manual',
};

const TOUCH_RESULT_LABEL: Record<CadenceTouchResult, string> = {
    sent: 'Enviado',
    failed: 'Falhou',
    skipped: 'Pulado',
};

const STATUS_FILTERS: CadenceRunStatus[] = ['active', 'paused', 'stopped'];

function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function runStatusBadgeVariant(status: CadenceRunStatus): BadgeProps['variant'] {
    if (status === 'active') return 'success';
    if (status === 'paused') return 'warning';
    return 'default';
}

function stopReasonBadgeVariant(reason: CadenceStopReason): BadgeProps['variant'] {
    if (reason === 'opt-out') return 'danger';
    if (reason === 'lead-reply') return 'info';
    if (reason === 'manual-stop') return 'outline';
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

function CadenceRunRow({ run }: { run: CadenceRunDTO }) {
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
                <td className="py-1.5 text-right text-ink-2 [font-variant-numeric:tabular-nums]">{formatDateTime(run.startedAt)}</td>
            </tr>
            {expanded && run.attempts.length > 0 && (
                <tr className="border-b border-line last:border-0">
                    <td colSpan={6} className="py-2 pl-8 pr-3 bg-surface-2">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="text-ink-2">
                                    <th className="text-left font-semibold py-1 pr-3">Toque</th>
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
                                <th className="text-right font-semibold py-1.5">Iniciada em</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((run) => <CadenceRunRow key={run.id} run={run} />)}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

// ── Página ───────────────────────────────────────────────────────────────

export function CadenceHub() {
    return (
        <main className="flex-1 overflow-y-auto bg-bg text-ink p-6 md:p-8 space-y-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <header className="flex flex-col gap-1">
                    <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2 tracking-tight">
                        <Repeat className="w-5 h-5 text-brand" aria-hidden="true" />
                        Cadência & Ciclo de Receita
                    </h1>
                    <p className="text-sm text-ink-2 max-w-2xl">
                        Opt-outs unificados por lead/canal e o estado real de cada sequência multicanal em
                        andamento — nada aqui é inferido, é o que os canais confirmaram de verdade.
                    </p>
                </header>

                <CadenceRunsSection />
                <OptOutsSection />

                <Card padding="sm" variant="outline" className="border-dashed">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-ink-2 mb-1.5">Em breve nesta tela</h2>
                    <p className="text-xs text-ink-2 leading-relaxed">
                        Reply-tracking de e-mail, agendamento no Google Calendar e proposta/assinatura/fechamento
                        (entregas 3–5 do ciclo de receita) ainda não têm API própria — quando existirem, entram
                        aqui como novas seções. Esta nota é só um aviso honesto do escopo atual, não um espaço
                        reservado com dado de exemplo.
                    </p>
                </Card>
            </div>
        </main>
    );
}
