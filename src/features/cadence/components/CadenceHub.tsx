import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Loader2,
  Pause,
  Play,
  Plus,
  PowerOff,
  RefreshCw,
  Repeat,
  ShieldOff,
  Square,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge, type BadgeProps } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { toast } from '../../../lib/toast';
import { leadsDB } from '../../../lib/db';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';
import type { Lead } from '../../../types';
import type { CadenceJourneyTemplate } from '../domain/cadenceTemplates';
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

/** Mesmo conjunto de `writeRoles` do backend (`cadence.routes.ts`) — criar/iniciar/encerrar
 * sequência e pausar/retomar/parar um run exigem todos o mesmo papel mínimo. Duplicado aqui (não
 * importável do backend no bundle do cliente) como o resto do app já faz — ver
 * `ObjectionsMatrixPage.tsx`/`QualificationMatrixPage.tsx`. */
const CADENCE_WRITE_ROLES = ['ADMIN', 'GESTOR', 'CLOSER', 'SDR'];

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function leadLabel(lead: Lead): string {
  const company = lead.company?.tradeName || lead.company?.legalName;
  return [lead.title || 'Negócio sem título', company].filter(Boolean).join(' — ');
}

/**
 * `POST /leads/:leadId/schedule-meeting` (CYC-004) já existia, testado (confirmação verificável,
 * cria Note + evento de calendário), mas sem nenhum ponto de acionamento na UI — nenhum vendedor
 * conseguia registrar uma reunião confirmada a partir desta tela (achado do Piloto 016).
 */
function ScheduleMeetingDialog({
  leadId,
  isOpen,
  onClose,
}: {
  leadId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStart('');
    setEnd('');
  };

  const handleSubmit = async () => {
    if (!leadId || !start || !end) {
      toast.error('Informe o início e o fim da reunião.');
      return;
    }
    setSubmitting(true);
    try {
      await cadenceApi.scheduleMeeting(leadId, {
        proposedStart: new Date(start).toISOString(),
        proposedEnd: new Date(end).toISOString(),
      });
      toast.success('Reunião confirmada e registrada no calendário.');
      reset();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível registrar a reunião.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) {
          reset();
          onClose();
        }
      }}
      title="Agendar reunião confirmada"
      preventClose={submitting}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Registrando…' : 'Confirmar reunião'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-ink-2">
          Use somente após confirmação verbal/escrita real do lead — esta ação registra a reunião
          como confirmada manualmente e cria o evento no calendário.
        </p>
        <div>
          <label htmlFor="meeting-start" className="block text-xs font-semibold text-ink-2 mb-1">
            Início
          </label>
          <input
            id="meeting-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="meeting-end" className="block text-xs font-semibold text-ink-2 mb-1">
            Fim
          </label>
          <input
            id="meeting-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
      </div>
    </Dialog>
  );
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
    return () => {
      cancelled = true;
    };
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
        <div
          className="space-y-2"
          role="status"
          aria-live="polite"
          aria-label="Carregando opt-outs"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        <div
          className="flex items-center justify-between gap-3 text-sm text-danger-active dark:text-danger py-4"
          role="alert"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </span>
          <button
            type="button"
            onClick={load}
            className="text-xs font-semibold underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
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
                <th className="text-left font-semibold py-1.5 pr-3">Evidência</th>
                <th className="text-left font-semibold py-1.5 pr-3">Lead</th>
                <th className="text-right font-semibold py-1.5">Registrado em</th>
              </tr>
            </thead>
            <tbody>
              {data.map((record) => (
                <tr key={record.id} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-3">
                    <Badge variant={scopeBadgeVariant(record.scope)}>
                      {SCOPE_LABEL[record.scope]}
                    </Badge>
                  </td>
                  <td className="py-1.5 pr-3 text-ink-2">{ORIGIN_LABEL[record.originChannel]}</td>
                  <td
                    className="py-1.5 pr-3 text-ink-2 max-w-xs truncate"
                    title={record.reason ?? undefined}
                  >
                    {record.reason ?? '—'}
                  </td>
                  {/* Coletado deliberadamente pro domínio (`OptOutRecord.evidence`, "texto/trecho
                      real da mensagem que motivou o opt-out — nunca inferência da IA") e já vinha
                      até o cliente, mas nunca era exibido — o dado mais valioso pra auditar o
                      pedido ficava descartado (achado do Piloto 016). */}
                  <td
                    className="py-1.5 pr-3 text-ink-2 max-w-xs truncate"
                    title={record.evidence ?? undefined}
                  >
                    {record.evidence ?? '—'}
                  </td>
                  <td
                    className="py-1.5 pr-3 text-ink-2 font-mono"
                    title={record.leadId ?? undefined}
                  >
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
function CadenceRunActions({
  run,
  onChanged,
  onScheduleMeeting,
}: {
  run: CadenceRunDTO;
  onChanged: () => void;
  onScheduleMeeting: () => void;
}) {
  const [pending, setPending] = useState<'pause' | 'resume' | 'stop' | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const confirmStop = () =>
    confirm({
      title: 'Parar cadência',
      description:
        'Parar esta cadência? Diferente de pausar, uma cadência parada não pode ser retomada.',
      confirmLabel: 'Parar',
      variant: 'danger',
    });

  const scheduleButton = (
    <button
      type="button"
      onClick={onScheduleMeeting}
      aria-label={`Agendar reunião confirmada com o lead ${run.leadId}`}
      title="Agendar reunião confirmada"
      className="p-1.5 text-ink-2 hover:text-brand hover:bg-surface-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <CalendarClock className="w-3.5 h-3.5" />
    </button>
  );

  const runAction = async (
    action: 'pause' | 'resume' | 'stop',
    fn: () => Promise<CadenceRunDTO>,
    successMessage: string,
  ) => {
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
        {scheduleButton}
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
          onClick={async () => {
            if (!(await confirmStop())) return;
            void runAction('stop', () => cadenceApi.stopRun(run.id), 'Cadência parada.');
          }}
          disabled={pending !== null}
          aria-label={`Parar cadência do lead ${run.leadId}`}
          title="Parar"
          className="p-1.5 text-ink-2 hover:text-danger-active dark:hover:text-danger hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        {dialog}
      </div>
    );
  }

  if (run.status === 'paused') {
    return (
      <div className="flex items-center justify-end gap-1">
        {scheduleButton}
        <button
          type="button"
          onClick={() =>
            runAction('resume', () => cadenceApi.resumeRun(run.id), 'Cadência retomada.')
          }
          disabled={pending !== null}
          aria-label={`Retomar cadência do lead ${run.leadId}`}
          title="Retomar"
          className="p-1.5 text-ink-2 hover:text-brand hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!(await confirmStop())) return;
            void runAction('stop', () => cadenceApi.stopRun(run.id), 'Cadência parada.');
          }}
          disabled={pending !== null}
          aria-label={`Parar cadência do lead ${run.leadId}`}
          title="Parar"
          className="p-1.5 text-ink-2 hover:text-danger-active dark:hover:text-danger hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        {dialog}
      </div>
    );
  }

  return <span className="text-ink-2 text-right block">—</span>;
}

function CadenceRunRow({
  run,
  onChanged,
  onScheduleMeeting,
}: {
  run: CadenceRunDTO;
  onChanged: () => void;
  onScheduleMeeting: (leadId: string) => void;
}) {
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
            aria-label={
              expanded ? 'Ocultar histórico de tentativas' : 'Ver histórico de tentativas'
            }
            className="flex items-center gap-1 text-ink hover:text-brand disabled:text-ink-2 disabled:cursor-default transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            {run.attempts.length > 0 &&
              (expanded ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              ))}
            <span className="font-mono" title={run.leadId}>
              {run.leadId.slice(0, 8)}…
            </span>
          </button>
        </td>
        <td className="py-1.5 pr-3">
          <Badge variant={runStatusBadgeVariant(run.status)}>{STATUS_LABEL[run.status]}</Badge>
        </td>
        <td className="py-1.5 pr-3 text-ink-2">
          {run.stopReason ? (
            <Badge variant={stopReasonBadgeVariant(run.stopReason)}>
              {STOP_REASON_LABEL[run.stopReason]}
            </Badge>
          ) : (
            '—'
          )}
        </td>
        <td className="py-1.5 pr-3 text-ink-2 text-center [font-variant-numeric:tabular-nums]">
          {run.currentTouchOrder}
        </td>
        <td className="py-1.5 pr-3 text-ink-2">
          {lastAttempt ? (
            <span className="flex items-center gap-1.5">
              {CHANNEL_LABEL[lastAttempt.channel]}
              <Badge variant={touchResultBadgeVariant(lastAttempt.result)}>
                {TOUCH_RESULT_LABEL[lastAttempt.result]}
              </Badge>
            </span>
          ) : (
            'Sem tentativa ainda'
          )}
        </td>
        <td className="py-1.5 pr-3 text-ink-2 text-right [font-variant-numeric:tabular-nums]">
          {formatDateTime(run.startedAt)}
        </td>
        <td className="py-1.5 text-right">
          <CadenceRunActions
            run={run}
            onChanged={onChanged}
            onScheduleMeeting={() => onScheduleMeeting(run.leadId)}
          />
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
                  {/* `CadenceTouchAttempt.providerMessageId` — id da mensagem no provedor
                      (WhatsApp/e-mail), coletado e salvo de verdade mas nunca exibido antes
                      (achado do Piloto 016). Só existe quando `result === 'sent'`, por isso a
                      célula fica em branco (não "—") nas linhas sem esse dado, em vez de sujar a
                      tabela com um traço em toda tentativa falha/pulada. */}
                  <th className="text-left font-semibold py-1 pr-3">ID da mensagem</th>
                  <th className="text-right font-semibold py-1">Quando</th>
                </tr>
              </thead>
              <tbody>
                {run.attempts.map((attempt, idx) => (
                  <tr key={idx}>
                    <td className="py-1 pr-3 text-ink-2">{attempt.touchOrder}</td>
                    <td className="py-1 pr-3 text-ink-2 [font-variant-numeric:tabular-nums]">
                      {attempt.attemptNumber}
                    </td>
                    <td className="py-1 pr-3 text-ink-2">{CHANNEL_LABEL[attempt.channel]}</td>
                    <td className="py-1 pr-3">
                      <Badge variant={touchResultBadgeVariant(attempt.result)}>
                        {TOUCH_RESULT_LABEL[attempt.result]}
                      </Badge>
                    </td>
                    <td
                      className="py-1 pr-3 text-ink-2 max-w-xs truncate"
                      title={attempt.error ?? undefined}
                    >
                      {attempt.error ?? '—'}
                    </td>
                    <td
                      className="py-1 pr-3 text-ink-2 font-mono max-w-[10rem] truncate"
                      title={attempt.providerMessageId ?? undefined}
                    >
                      {attempt.providerMessageId ?? ''}
                    </td>
                    <td className="py-1 text-right text-ink-2 [font-variant-numeric:tabular-nums]">
                      {formatDateTime(attempt.attemptedAt)}
                    </td>
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
  const [statusFilter, setStatusFilter] = useState<Set<CadenceRunStatus>>(
    new Set(['active', 'paused']),
  );
  const [schedulingLeadId, setSchedulingLeadId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    cadenceApi
      .runs(statusFilter.size > 0 ? [...statusFilter] : undefined)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
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
        <div
          className="space-y-2"
          role="status"
          aria-live="polite"
          aria-label="Carregando execuções de cadência"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        <div
          className="flex items-center justify-between gap-3 text-sm text-danger-active dark:text-danger py-4"
          role="alert"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </span>
          <button
            type="button"
            onClick={load}
            className="text-xs font-semibold underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            Tentar de novo
          </button>
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title={
            statusFilter.size < STATUS_FILTERS.length
              ? 'Nenhuma execução para este filtro'
              : 'Nenhuma execução de cadência'
          }
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
              {data.map((run) => (
                <CadenceRunRow
                  key={run.id}
                  run={run}
                  onChanged={load}
                  onScheduleMeeting={setSchedulingLeadId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ScheduleMeetingDialog
        leadId={schedulingLeadId}
        isOpen={schedulingLeadId != null}
        onClose={() => setSchedulingLeadId(null)}
      />
    </Card>
  );
}

// ── Sequências ───────────────────────────────────────────────────────────

/**
 * Achado "fora de escopo" do Piloto 016: `CadenceSequence.active`/`deletedAt` já existiam no
 * schema e já eram filtrados em toda leitura, mas não existia nenhuma tela listando as sequências
 * já criadas, nem ação nenhuma pra desligar uma. Esta seção lista o que `GET /sequences` já expõe
 * (só sequências ativas — o mesmo filtro `active: true, deletedAt: null` de sempre) e adiciona a
 * única ação de escrita que faltava: encerrar. Distinta de `CadenceRunActions`/`stopRun` (que para
 * uma EXECUÇÃO de um lead específico) — aqui a ação impede que a SEQUÊNCIA seja escolhida em novas
 * execuções dali em diante; o histórico de runs já iniciados a partir dela não muda.
 *
 * Como `GET /sequences` só devolve sequências ativas, uma sequência encerrada simplesmente some
 * desta lista na próxima busca — não existe um estado "Encerrada" pra badge aqui, diferente do
 * status de um run (`CadenceRunStatus`), que é uma máquina de estados com histórico visível.
 */
function SequencesSection({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<CadenceSequenceDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    cadenceApi
      .sequences()
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  const handleDeactivate = async (sequence: CadenceSequenceDTO) => {
    if (
      !(await confirm({
        title: 'Encerrar sequência',
        description: `Encerrar a sequência "${sequence.name}"? Ela deixa de poder ser escolhida para novas cadências — execuções já em andamento não são afetadas.`,
        confirmLabel: 'Encerrar',
        variant: 'danger',
      }))
    )
      return;
    setDeactivatingId(sequence.id);
    try {
      await cadenceApi.deactivateSequence(sequence.id);
      toast.success(`Sequência "${sequence.name}" encerrada.`);
      load();
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível encerrar a sequência.');
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-brand" aria-hidden="true" />
          <h2 className="text-sm font-bold text-ink">Sequências</h2>
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
          aria-label="Atualizar sequências"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-live="polite" aria-label="Carregando sequências">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        <div
          className="flex items-center justify-between gap-3 text-sm text-danger-active dark:text-danger py-4"
          role="alert"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </span>
          <button
            type="button"
            onClick={load}
            className="text-xs font-semibold underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            Tentar de novo
          </button>
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="Nenhuma sequência ativa"
          description="Crie uma sequência ou use um modelo de jornada para poder iniciar cadências para leads."
          icon={<ListChecks className="w-8 h-8 text-brand" />}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink-2 border-b border-line">
                <th className="text-left font-semibold py-1.5 pr-3">Nome</th>
                <th className="text-center font-semibold py-1.5 pr-3">Toques</th>
                <th className="text-right font-semibold py-1.5 pr-3">Criada em</th>
                <th className="text-right font-semibold py-1.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.map((sequence) => (
                <tr key={sequence.id} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-3">
                    <div className="font-semibold text-ink">{sequence.name}</div>
                    {sequence.description && (
                      <div
                        className="text-ink-2 max-w-sm truncate"
                        title={sequence.description}
                      >
                        {sequence.description}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-center text-ink-2 [font-variant-numeric:tabular-nums]">
                    {sequence.touches.length}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-ink-2 [font-variant-numeric:tabular-nums]">
                    {formatDateTime(sequence.createdAt)}
                  </td>
                  <td className="py-1.5 text-right">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(sequence)}
                        disabled={deactivatingId !== null}
                        aria-label={`Encerrar sequência ${sequence.name}`}
                        title="Encerrar sequência"
                        className="inline-flex items-center gap-1 p-1.5 text-ink-2 hover:text-danger-active dark:hover:text-danger hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <PowerOff className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-ink-2">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog}
    </Card>
  );
}

// ── Nova sequência ───────────────────────────────────────────────────────

const CHANNEL_OPTIONS: CadenceChannel[] = ['email', 'whatsapp', 'voice'];
const EMPTY_TOUCH: CadenceTouchInput = {
  order: 1,
  channel: 'email',
  delayHoursFromPrevious: 0,
  templateRef: '',
};

function NewSequenceDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [touches, setTouches] = useState<CadenceTouchInput[]>([{ ...EMPTY_TOUCH }]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
    setTouches([{ ...EMPTY_TOUCH }]);
  };

  const addTouch = () => {
    setTouches((prev) => [...prev, { ...EMPTY_TOUCH, order: prev.length + 1 }]);
  };

  const removeTouch = (index: number) => {
    setTouches((prev) =>
      prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, order: i + 1 })),
    );
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
      await cadenceApi.createSequence({
        name: name.trim(),
        description: description.trim() || undefined,
        touches,
      });
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
      onClose={() => {
        if (!submitting) {
          reset();
          onClose();
        }
      }}
      title="Nova sequência de cadência"
      maxWidth="max-w-2xl"
      preventClose={submitting}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar sequência'}
          </Button>
        </>
      }
    >
      {/* Corpo só renderiza aberto — o <dialog> nativo não desmonta filhos ao fechar, e um
                <select> de canal sempre presente no DOM (mesmo fechado) colidiria com badges de
                canal renderizados em outras seções da mesma tela para queries de teste/a11y. */}
      {isOpen && (
        <div className="space-y-4">
          <div>
            <label htmlFor="sequence-name" className="block text-xs font-semibold text-ink-2 mb-1">
              Nome da sequência
            </label>
            <input
              id="sequence-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: E-mail → WhatsApp (follow-up padrão)"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>

          <div>
            <label
              htmlFor="sequence-description"
              className="block text-xs font-semibold text-ink-2 mb-1"
            >
              Descrição (opcional)
            </label>
            <textarea
              id="sequence-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Para que serve esta sequência e quando usá-la"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-2">
                Toques (na ordem em que disparam)
              </span>
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
                      className="p-1 text-ink-2 hover:text-danger-active dark:hover:text-danger rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor={`touch-channel-${index}`}
                      className="block text-[11px] font-semibold text-ink-2 mb-1"
                    >
                      Canal
                    </label>
                    <select
                      id={`touch-channel-${index}`}
                      value={touch.channel}
                      onChange={(e) =>
                        updateTouch(index, { channel: e.target.value as CadenceChannel })
                      }
                      className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {CHANNEL_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`touch-delay-${index}`}
                      className="block text-[11px] font-semibold text-ink-2 mb-1"
                    >
                      Horas após o anterior
                    </label>
                    <input
                      id={`touch-delay-${index}`}
                      type="number"
                      min={0}
                      max={720}
                      value={touch.delayHoursFromPrevious}
                      onChange={(e) =>
                        updateTouch(index, {
                          delayHoursFromPrevious: Math.min(
                            720,
                            Math.max(0, Number(e.target.value)),
                          ),
                        })
                      }
                      className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`touch-max-attempts-${index}`}
                      className="block text-[11px] font-semibold text-ink-2 mb-1"
                    >
                      Tentativas se falhar
                    </label>
                    <input
                      id={`touch-max-attempts-${index}`}
                      type="number"
                      min={1}
                      max={5}
                      value={touch.maxAttempts ?? 1}
                      onChange={(e) =>
                        updateTouch(index, {
                          maxAttempts: Math.min(5, Math.max(1, Number(e.target.value))),
                        })
                      }
                      className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor={`touch-content-${index}`}
                    className="block text-[11px] font-semibold text-ink-2 mb-1"
                  >
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
        </div>
      )}
    </Dialog>
  );
}

// ── Iniciar cadência ─────────────────────────────────────────────────────

function StartRunDialog({
  isOpen,
  onClose,
  onStarted,
}: {
  isOpen: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [leadId, setLeadId] = useState('');
  const [sequenceId, setSequenceId] = useState('');
  const [sequences, setSequences] = useState<CadenceSequenceDTO[] | null>(null);
  const [loadingSequences, setLoadingSequences] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Busca de lead por nome/empresa como atalho — antes só existia um campo de texto livre pedindo
  // pra colar o cuid do lead, que ninguém sabe de cor (achado do Piloto 016). O E2E oficial
  // (`tests/e2e/cadence.spec.ts`) já automatiza `getByLabel('ID do lead').fill(leadId)` direto —
  // por isso o campo continua sendo o próprio `leadId` (mesmo id/label/comportamento de sempre), só
  // com uma lista de sugestões por baixo que, ao clicar, preenche esse mesmo campo.
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!isOpen || !showResults || leadId.trim().length < 2) {
      setLeadResults([]);
      return;
    }
    let cancelled = false;
    setLeadSearchLoading(true);
    const timer = window.setTimeout(() => {
      leadsDB
        .list({ search: leadId, limit: 6 })
        .then((res) => {
          if (!cancelled) setLeadResults(res.data);
        })
        .catch(() => {
          if (!cancelled) setLeadResults([]);
        })
        .finally(() => {
          if (!cancelled) setLeadSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [leadId, isOpen, showResults]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingSequences(true);
    cadenceApi
      .sequences()
      .then((result) => {
        if (!cancelled) {
          setSequences(result);
          if (result[0]) setSequenceId(result[0].id);
        }
      })
      .catch(
        (err) =>
          !cancelled &&
          toast.error((err as Error).message || 'Não foi possível carregar as sequências.'),
      )
      .finally(() => !cancelled && setLoadingSequences(false));
    return () => {
      cancelled = true;
    };
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
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Iniciar cadência para um lead"
      preventClose={submitting}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !sequences || sequences.length === 0}
          >
            {submitting ? 'Iniciando…' : 'Iniciar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <label htmlFor="run-lead-id" className="block text-xs font-semibold text-ink-2 mb-1">
            ID do lead
          </label>
          <input
            id="run-lead-id"
            type="text"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            onFocus={() => setShowResults(true)}
            onBlur={() => window.setTimeout(() => setShowResults(false), 150)}
            placeholder="Cole o ID do lead ou busque por nome/empresa"
            autoComplete="off"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          {leadSearchLoading && (
            <div className="absolute right-3 top-9">
              <Loader2 className="w-4 h-4 animate-spin text-ink-2" />
            </div>
          )}
          {showResults && leadResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {leadResults.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => {
                    setLeadId(lead.id);
                    setShowResults(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-2 transition-colors border-b border-line last:border-b-0"
                >
                  {leadLabel(lead)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="run-sequence" className="block text-xs font-semibold text-ink-2 mb-1">
            Sequência
          </label>
          {loadingSequences ? (
            <Skeleton className="h-9 w-full" />
          ) : !sequences || sequences.length === 0 ? (
            <p className="text-xs text-ink-2">
              Nenhuma sequência criada ainda — crie uma primeiro em &ldquo;Nova sequência&rdquo;.
            </p>
          ) : (
            <select
              id="run-sequence"
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {sequences.map((seq) => (
                <option key={seq.id} value={seq.id}>
                  {seq.name} ({seq.touches.length} toque{seq.touches.length === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function JourneyTemplatesDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [instantiating, setInstantiating] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<CadenceJourneyTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // GET /api/cadence/templates já existia, testado, mas o diálogo importava a mesma constante
  // diretamente do domínio backend em vez de chamar a API — mesmo padrão de rota órfã já
  // confirmado em Contacts/Companies/Activities (achado do Piloto 016).
  useEffect(() => {
    if (!isOpen || templates.length > 0) return;
    setLoadingTemplates(true);
    cadenceApi
      .templates()
      .then(setTemplates)
      .catch(() => toast.error('Falha ao carregar os modelos de jornada.'))
      .finally(() => setLoadingTemplates(false));
  }, [isOpen, templates.length]);

  const handleUseTemplate = async (templateId: string) => {
    setInstantiating(templateId);
    try {
      await cadenceApi.createSequenceFromTemplate(templateId);
      toast.success('Sequência de jornada criada com sucesso!');
      onCreated();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || 'Falha ao criar sequência a partir do modelo');
    } finally {
      setInstantiating(null);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Modelos de Jornada do Cliente (AtlasGR & TotalTrac)"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <p className="text-xs text-ink-2">
          Sequências multicanais desenhadas sob medida para as jornadas de decisão de gestores de
          frota pesada, logística e segurança veicular:
        </p>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-8 text-ink-2">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            templates.map((tpl) => {
              const isExpanded = expandedTemplate === tpl.id;
              return (
                <div
                  key={tpl.id}
                  className="rounded-2xl border border-line bg-surface-2/40 p-4 space-y-3 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-ink">{tpl.name}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand-active dark:text-brand-2">
                          {tpl.category}
                        </span>
                      </div>
                      <p className="text-xs text-ink-2">{tpl.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedTemplate(isExpanded ? null : tpl.id)}
                      >
                        {isExpanded ? 'Ocultar' : `Ver ${tpl.touches.length} Toques`}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={instantiating === tpl.id}
                        onClick={() => handleUseTemplate(tpl.id)}
                      >
                        {instantiating === tpl.id ? 'Criando…' : 'Usar Modelo'}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-2 pt-2 border-t border-line">
                      <span className="text-[11px] font-bold uppercase text-ink-2">
                        Roteiro de Toques da Jornada:
                      </span>
                      <div className="space-y-1.5">
                        {tpl.touches.map((t) => (
                          <div
                            key={t.order}
                            className="p-2.5 rounded-xl bg-surface border border-line text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-ink">
                                Toque {t.order}: {t.stepTitle} ({CHANNEL_LABEL[t.channel]})
                              </span>
                              <span className="text-[10px] text-ink-2 font-mono">
                                +{t.delayHoursFromPrevious}h
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-2 whitespace-pre-wrap">
                              {t.templateRef}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ── Página ───────────────────────────────────────────────────────────────

export function CadenceHub() {
  const { currentUser } = useAuth();
  // Mesmo achado de RBAC do Piloto 017 (Playbook): o botão de encerrar sequência só some pra quem
  // já não pode escrever neste módulo (mesmas `writeRoles` do backend) — a rota já protege de
  // verdade, isto é só não mostrar uma ação que resultaria em 403.
  const canManage = !!currentUser && hasRequiredRole(currentUser.role, CADENCE_WRITE_ROLES);
  const [runsKey, setRunsKey] = useState(0);
  const [sequencesKey, setSequencesKey] = useState(0);
  const [newSequenceOpen, setNewSequenceOpen] = useState(false);
  const [startRunOpen, setStartRunOpen] = useState(false);
  const [journeyTemplatesOpen, setJourneyTemplatesOpen] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto bg-bg text-ink p-6 md:p-8 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2 tracking-tight">
              <Repeat className="w-5 h-5 text-brand" aria-hidden="true" />
              Cadência & Ciclo de Receita
            </h1>
            <p className="text-sm text-ink-2 max-w-2xl">
              Opt-outs unificados por lead/canal, detecção inteligente de resposta (Reply Tracking)
              e o estado real de cada sequência multicanal em andamento.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setJourneyTemplatesOpen(true)}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Modelos de Jornada
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNewSequenceOpen(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Nova sequência
            </Button>
            <Button type="button" size="sm" onClick={() => setStartRunOpen(true)}>
              <Play className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Iniciar cadência
            </Button>
          </div>
        </header>

        {/* Prefixo distinto por seção: `runsKey`/`sequencesKey` são contadores independentes que
            começam em 0 e são incrementados juntos em vários callbacks (`onCreated` de
            NewSequenceDialog/JourneyTemplatesDialog) — sem o prefixo, os dois `key` numéricos
            coincidem (0 com 0, depois 1 com 1) entre estes dois elementos IRMÃOS, o que o React
            trata como colisão de key na reconciliação (mesmo sendo tipos de componente
            diferentes — o namespace de key é por lista de filhos, não por tipo). O resultado
            observado era o warning real "Encountered two children with the same key" e a seção
            de execuções ficando duplicada na tela (achado real, `tests/e2e/cadence.spec.ts`). */}
        <CadenceRunsSection key={`runs-${runsKey}`} />
        <SequencesSection key={`sequences-${sequencesKey}`} canManage={canManage} />
        <OptOutsSection />
      </div>

      <JourneyTemplatesDialog
        isOpen={journeyTemplatesOpen}
        onClose={() => setJourneyTemplatesOpen(false)}
        onCreated={() => {
          setRunsKey((k) => k + 1);
          setSequencesKey((k) => k + 1);
        }}
      />
      <NewSequenceDialog
        isOpen={newSequenceOpen}
        onClose={() => setNewSequenceOpen(false)}
        onCreated={() => {
          setRunsKey((k) => k + 1);
          setSequencesKey((k) => k + 1);
        }}
      />
      <StartRunDialog
        isOpen={startRunOpen}
        onClose={() => setStartRunOpen(false)}
        onStarted={() => setRunsKey((k) => k + 1)}
      />
    </div>
  );
}
