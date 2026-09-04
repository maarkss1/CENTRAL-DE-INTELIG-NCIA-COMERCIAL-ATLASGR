import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  Loader2,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
  Trash2,
  FileSpreadsheet,
  FileJson,
  FileText,
  Lock,
  CalendarRange,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/toast';

type ExtractionEntity = 'lead' | 'deal' | 'company' | 'contact' | 'activity' | 'user';
type ExtractionPeriod =
  | 'today'
  | 'last7days'
  | 'thisMonth'
  | 'thisQuarter'
  | 'thisSemester'
  | 'all'
  | 'custom';
type ExtractionStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'completed_partial'
  | 'failed'
  | 'cancelled';

const ENTITY_OPTIONS: { value: ExtractionEntity; label: string }[] = [
  { value: 'lead', label: 'Leads' },
  { value: 'deal', label: 'Negócios' },
  { value: 'company', label: 'Empresas' },
  { value: 'contact', label: 'Contatos' },
  { value: 'activity', label: 'Atividades' },
  { value: 'user', label: 'Usuários' },
];

const PERIOD_OPTIONS: { value: ExtractionPeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'last7days', label: 'Últimos 7 dias' },
  { value: 'thisMonth', label: 'Mês atual' },
  { value: 'thisQuarter', label: 'Trimestre atual' },
  { value: 'thisSemester', label: 'Semestre atual' },
  { value: 'all', label: 'Todas as datas' },
  { value: 'custom', label: 'Personalizado' },
];

interface ExtractionFileMeta {
  format: 'csv' | 'xlsx' | 'json';
  entity: string | null;
  filename: string;
  sizeBytes: number;
}

interface ExtractionEntityProgress {
  entity: string;
  status: 'pending' | 'running' | 'done' | 'error';
  processed: number;
  error?: string;
}

interface ExtractionRun {
  id: string;
  status: ExtractionStatus;
  entities: string[];
  totalCount: number;
  countByEntity: Record<string, number> | null;
  progress: { entities: ExtractionEntityProgress[] } | null;
  errorMessage: string | null;
  files: ExtractionFileMeta[] | null;
  createdAt: string;
  completedAt: string | null;
}

const ENTITY_LABEL = new Map<string, string>(ENTITY_OPTIONS.map((e) => [e.value, e.label]));

/**
 * "completed_partial" = extração terminou e gerou arquivo utilizável, mas atingiu o teto de
 * segurança de páginas (`PAGE_SAFETY_CAP`/`incompleteEntities` em `service/extraction.ts`) para ao
 * menos uma entidade antes de esgotar o portal — bloqueador #12 de `/AGENTS.md` ("Extrações Bitrix
 * incompletas tratadas como recurso final"). Valor de enum próprio desde a resolução do handoff
 * `.agents/handoffs/roadmap-v2-onda-1/06-para-01-status-extracao-parcial.md` — antes disso o sinal
 * vinha só de `errorMessage` não-nulo com status="completed".
 */
const STATUS_BADGE: Record<
  ExtractionStatus,
  { label: string; className: string; icon: typeof Clock }
> = {
  queued: {
    label: 'Na fila',
    className: 'bg-surface-2 text-ink-2',
    icon: Clock,
  },
  running: {
    label: 'Em andamento',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    icon: Loader2,
  },
  completed: {
    label: 'Concluída',
    className: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300',
    icon: CheckCircle2,
  },
  completed_partial: {
    label: 'Concluída (parcial)',
    className:
      'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    icon: AlertTriangle,
  },
  failed: {
    label: 'Falhou',
    className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
    icon: AlertTriangle,
  },
  cancelled: {
    label: 'Cancelada',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    icon: Ban,
  },
};

function downloadUrl(
  runId: string,
  format: 'csv' | 'xlsx' | 'json',
  entity?: string | null,
): string {
  const params = new URLSearchParams({ format });
  if (entity) params.set('entity', entity);
  return `/api/bitrix/extractions/${runId}/download?${params}`;
}

/** Autenticação é por cookie de sessão (Better Auth) — navegação direta já carrega a sessão, sem precisar recriar o header Authorization do `api` helper. */
function triggerDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const selectClass =
  'h-9 text-sm rounded-xl border border-line bg-surface text-ink px-3 disabled:opacity-40 focus:bg-surface focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none cursor-pointer';

interface BitrixExtractionPanelProps {
  connectionId: string;
  canManage: boolean;
}

/**
 * Extrações Bitrix (Onda 7, Agente 06/06A) — construído em cima do serviço real de extração
 * (`src/features/integrations/bitrix/service/extraction.ts`) e do schema `BitrixExtractionRun`
 * (Onda 6, Agente 01A). Restrito a ADMIN/GESTOR: uma extração traz dado pessoal de TODA a
 * organização de uma vez, mesma trava aplicada no backend (ver bitrix.routes.ts).
 *
 * "Analisar com IA" (seção 14 da spec do 06A) NÃO está implementado nesta rodada — depende da
 * infraestrutura de IA do Agente 07 (dono de src/lib/ai/**) e do padrão de consentimento explícito
 * que o 06A pede para ser replicado lá. Ver relatório da Onda 7 para o handoff correspondente.
 */
export function BitrixExtractionPanel({ connectionId, canManage }: BitrixExtractionPanelProps) {
  const [selectedEntities, setSelectedEntities] = useState<Set<ExtractionEntity>>(
    new Set(['lead']),
  );
  const [period, setPeriod] = useState<ExtractionPeriod>('thisMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const pollRef = useRef<number | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await api.get<ExtractionRun[]>('/api/bitrix/extractions');
      setRuns(data);
    } catch {
      // histórico é secundário à ação principal — falha ao listar não deve travar o formulário de criação.
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, canManage]);

  // Poll enquanto houver alguma extração ainda em andamento — para assim que a última terminar,
  // em vez de bater na API indefinidamente com a aba aberta e nada rodando.
  const hasActiveRun = useMemo(
    () => runs.some((r) => r.status === 'queued' || r.status === 'running'),
    [runs],
  );
  useEffect(() => {
    if (!canManage || !hasActiveRun) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      return;
    }
    pollRef.current = window.setInterval(loadRuns, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [hasActiveRun, canManage, loadRuns]);

  const toggleEntity = (entity: ExtractionEntity) => {
    setSelectedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  };

  const startExtraction = async () => {
    if (selectedEntities.size === 0) {
      setError('Selecione ao menos uma entidade.');
      return;
    }
    if (period === 'custom' && !customFrom) {
      setError('Informe a data inicial do período personalizado.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/bitrix/extractions', {
        connectionId,
        entities: Array.from(selectedEntities),
        filters: {
          period,
          customFrom: period === 'custom' ? customFrom : undefined,
          customTo: period === 'custom' ? customTo || undefined : undefined,
          search: search.trim() || undefined,
        },
      });
      toast.success('Extração iniciada — acompanhe o progresso abaixo.');
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao iniciar a extração.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRun = async (runId: string) => {
    try {
      await api.post(`/api/bitrix/extractions/${runId}/cancel`);
      await loadRuns();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar a extração.');
    }
  };

  const removeRun = async (runId: string) => {
    try {
      await api.delete(`/api/bitrix/extractions/${runId}`);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao remover a extração do histórico.');
    }
  };

  if (!canManage) {
    return (
      <div className="mt-8 pt-8 border-t border-line">
        <div className="flex items-center gap-2.5 p-4 rounded-2xl border border-line bg-surface-2 text-xs text-ink-2">
          <Lock className="w-4 h-4 shrink-0" />
          Extrações em massa (CSV/XLSX/JSON) de todo o portal exigem permissão de Gestor ou
          Administrador — envolve o dado pessoal completo da organização.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 pt-8 border-t border-line space-y-4">
      <div>
        <h3 className="text-lg font-bold text-ink flex items-center gap-2">
          <Database className="w-5 h-5 text-brand" /> Extrações
        </h3>
        <p className="text-sm text-ink-2 mt-1 max-w-2xl">
          Exporte um recorte completo do portal (Leads, Negócios, Empresas, Contatos, Atividades,
          Usuários) em CSV, XLSX ou JSON — roda em segundo plano, sem travar a tela.
        </p>
      </div>

      <div className="p-5 rounded-2xl border border-line bg-surface-2/50 space-y-4">
        <div className="flex flex-wrap gap-2">
          {ENTITY_OPTIONS.map((opt) => {
            const active = selectedEntities.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleEntity(opt.value)}
                aria-pressed={active}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${active ? 'bg-brand-active border-brand-active text-white' : 'bg-surface border-line text-ink-2 hover:border-brand/50'}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="extraction-period"
              className="text-[10px] font-bold uppercase tracking-wide text-ink-2 flex items-center gap-1"
            >
              <CalendarRange className="w-3 h-3" /> Período
            </label>
            <select
              id="extraction-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as ExtractionPeriod)}
              className={selectClass}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {period === 'custom' && (
            <>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="extraction-from"
                  className="text-[10px] font-bold uppercase tracking-wide text-ink-2"
                >
                  De
                </label>
                <input
                  id="extraction-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={selectClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="extraction-to"
                  className="text-[10px] font-bold uppercase tracking-wide text-ink-2"
                >
                  Até
                </label>
                <input
                  id="extraction-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={selectClass}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
            <label
              htmlFor="extraction-search"
              className="text-[10px] font-bold uppercase tracking-wide text-ink-2"
            >
              Buscar por título/nome (opcional)
            </label>
            <input
              id="extraction-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ex.: Transportadora"
              className="h-9 text-sm rounded-xl border border-line bg-surface text-ink px-3 placeholder:text-ink-2 focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
            />
          </div>
          <button
            onClick={startExtraction}
            disabled={submitting}
            className="h-9 flex items-center gap-2 px-4 bg-brand-active hover:bg-brand-2 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            {submitting ? 'Iniciando...' : 'Extrair'}
          </button>
        </div>

        {error && <p className="text-xs font-bold text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {loadingRuns ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-ink-2" />
        </div>
      ) : runs.length === 0 ? (
        <p className="text-xs text-ink-2 text-center py-4">
          Nenhuma extração ainda — configure os filtros acima e clique em Extrair.
        </p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const badge = STATUS_BADGE[run.status];
            const BadgeIcon = badge.icon;
            const csvFiles = (run.files || []).filter((f) => f.format === 'csv');
            const hasJson = (run.files || []).some((f) => f.format === 'json');
            const hasXlsx = (run.files || []).some((f) => f.format === 'xlsx');
            return (
              <div
                key={run.id}
                className="p-4 rounded-2xl border border-line bg-surface shadow-sm space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${badge.className}`}
                    >
                      <BadgeIcon
                        className={`w-3 h-3 ${run.status === 'running' ? 'animate-spin' : ''}`}
                      />{' '}
                      {badge.label}
                    </span>
                    <span className="text-xs text-ink-2">
                      {run.entities.map((e) => ENTITY_LABEL.get(e) || e).join(', ')}
                    </span>
                    <span className="text-xs text-ink-2">
                      {new Date(run.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(run.status === 'queued' || run.status === 'running') && (
                      <button
                        onClick={() => cancelRun(run.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 rounded-lg transition-colors"
                      >
                        <X className="w-3 h-3" /> Cancelar
                      </button>
                    )}
                    {run.status !== 'queued' && run.status !== 'running' && (
                      <button
                        onClick={() => removeRun(run.id)}
                        title="Remover do histórico (apaga os arquivos gerados)"
                        className="p-1.5 text-ink-2 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {run.status === 'running' && run.progress && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
                    {run.progress.entities.map((p) => (
                      <span key={p.entity} className="flex items-center gap-1">
                        {ENTITY_LABEL.get(p.entity) || p.entity}: {p.processed}
                        {p.status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                      </span>
                    ))}
                  </div>
                )}

                {(run.status === 'completed' || run.status === 'completed_partial') && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-ink">{run.totalCount} registro(s)</span>
                    {csvFiles.map((f) => (
                      <button
                        key={f.filename}
                        onClick={() => triggerDownload(downloadUrl(run.id, 'csv', f.entity))}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-ink bg-surface-2 hover:bg-line rounded-lg transition-colors"
                      >
                        <FileText className="w-3 h-3" /> CSV{' '}
                        {ENTITY_LABEL.get(f.entity || '') || f.entity}
                      </button>
                    ))}
                    {hasXlsx && (
                      <button
                        onClick={() => triggerDownload(downloadUrl(run.id, 'xlsx'))}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 rounded-lg transition-colors"
                      >
                        <FileSpreadsheet className="w-3 h-3" /> XLSX (todas as abas)
                      </button>
                    )}
                    {hasJson && (
                      <button
                        onClick={() => triggerDownload(downloadUrl(run.id, 'json'))}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        <FileJson className="w-3 h-3" /> JSON
                      </button>
                    )}
                    <Download className="w-3 h-3 text-ink-2/60 ml-auto shrink-0" />
                  </div>
                )}

                {run.status === 'failed' && run.errorMessage && (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {run.errorMessage}
                  </p>
                )}

                {run.status === 'completed_partial' && run.errorMessage && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {run.errorMessage}
                  </p>
                )}

                {run.status === 'cancelled' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Cancelada — nenhum arquivo foi gerado.{' '}
                    {run.totalCount > 0
                      ? `${run.totalCount} registro(s) já haviam sido lidos antes do cancelamento.`
                      : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
