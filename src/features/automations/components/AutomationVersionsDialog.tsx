import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, AlertTriangle, RefreshCw, Trash2, Pencil } from 'lucide-react';

import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  automationsApi,
  type Automation,
  type AutomationVersionTimelineEntry,
} from '../automations.api';

function formatEditedAt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Diff textual básico: uma linha por campo alterado, "Campo: antes → depois". */
function DiffList({ diff }: { diff: AutomationVersionTimelineEntry['diffToNext'] }) {
  if (diff.length === 0) {
    return <p className="text-xs text-ink-2 italic">Sem alterações de conteúdo detectadas.</p>;
  }
  return (
    <ul className="space-y-1">
      {diff.map((line) => (
        <li key={line.field} className="text-xs text-ink-2">
          <span className="font-semibold text-ink">{line.field}:</span>{' '}
          <span className="line-through decoration-danger/60">{line.before}</span>
          {' → '}
          <span className="text-ink">{line.after}</span>
        </li>
      ))}
    </ul>
  );
}

function VersionEntry({ entry }: { entry: AutomationVersionTimelineEntry }) {
  const isDelete = entry.changeReason === 'delete';
  return (
    <li className="relative pl-6 pb-5 last:pb-0">
      <span className="absolute left-0 top-1 w-3 h-3 rounded-full bg-surface-2 border-2 border-line" />
      <span className="absolute left-[5px] top-4 bottom-0 w-px bg-line" aria-hidden="true" />
      <div className="flex items-center gap-2 flex-wrap">
        {isDelete ? (
          <Trash2 className="w-3.5 h-3.5 text-danger-active dark:text-danger" aria-hidden="true" />
        ) : (
          <Pencil className="w-3.5 h-3.5 text-ink-2" aria-hidden="true" />
        )}
        <span className="text-xs text-ink-2">{formatEditedAt(entry.editedAt)}</span>
        {entry.editedByEmail && <span className="text-xs text-ink-2">· {entry.editedByEmail}</span>}
        <Badge variant={isDelete ? 'danger' : 'outline'}>{isDelete ? 'removida' : 'editada'}</Badge>
      </div>
      <div className="mt-2 pl-1">
        <DiffList diff={entry.diffToNext} />
      </div>
    </li>
  );
}

interface AutomationVersionsDialogProps {
  automation: Automation | null;
  onClose: () => void;
}

/**
 * Histórico de versões da REGRA (trigger/condições/ação) — não das execuções dela (isso já existe
 * em outro lugar, ver `automation-history.service.ts`). Onda 42 (dossiê CPI, DEC-14, opção A).
 */
export function AutomationVersionsDialog({ automation, onClose }: AutomationVersionsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Awaited<
    ReturnType<typeof automationsApi.versions>
  > | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setTimeline(await automationsApi.versions(id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTimeline(null);
    setError(null);
    if (automation) void load(automation.id);
  }, [automation, load]);

  return (
    <Dialog
      isOpen={automation != null}
      onClose={onClose}
      title={automation ? `Histórico de versões: ${automation.name}` : 'Histórico de versões'}
      maxWidth="max-w-xl"
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-ink-2 py-10">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando histórico…
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-8">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-warning-active dark:text-warning" />
          <p className="text-sm text-ink-2 mb-4">{error}</p>
          {automation && (
            <Button variant="outline" size="sm" onClick={() => void load(automation.id)}>
              <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
            </Button>
          )}
        </div>
      )}

      {!loading && !error && timeline && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-ink-2 font-semibold mb-0.5">
              Estado atual
            </p>
            <p className="text-sm text-ink">
              &ldquo;{timeline.current.trigger}&rdquo; → {timeline.current.action}
              {timeline.current.enabled ? '' : ' (pausada)'}
            </p>
          </div>

          {timeline.history.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-line rounded-xl">
              <History className="w-8 h-8 mx-auto mb-3 text-ink-2" />
              <p className="text-sm text-ink-2">
                Esta automação ainda não foi editada desde a criação.
              </p>
            </div>
          ) : (
            <ol>
              {timeline.history.map((entry) => (
                <VersionEntry key={entry.id} entry={entry} />
              ))}
            </ol>
          )}
        </div>
      )}
    </Dialog>
  );
}
