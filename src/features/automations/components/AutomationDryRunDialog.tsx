import { useCallback, useEffect, useState } from 'react';
import {
  FlaskConical,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  RefreshCw,
} from 'lucide-react';

import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { automationsApi, type Automation, type DryRunRecord } from '../automations.api';

/** Uma linha do que "aconteceria" — mensagem curta e específica por tipo de ação, montada a partir
 *  de `outcome.details` (o mesmo objeto que o backend já monta pronto para exibição). */
function describeOutcome(record: DryRunRecord): string {
  const { action, details } = record.outcome;
  if (action === 'Notificar equipe') {
    const channel =
      details.channel === 'email' ? `e-mail para ${String(details.to ?? '?')}` : 'aviso interno';
    return `${channel}: "${String(details.title ?? '')}"`;
  }
  if (action === 'Criar atividade') {
    const due = details.dueDate
      ? new Date(String(details.dueDate)).toLocaleDateString('pt-BR')
      : '?';
    return `${String(details.type ?? 'Follow_up')} para ${String(details.owner ?? '—')}, prazo ${due}`;
  }
  if (action === 'Ligar via SDR de Voz') {
    return details.targetNumber
      ? `Ligar para ${String(details.targetNumber)}`
      : 'Ligação de SDR de voz';
  }
  return action;
}

function ResultRow({ record }: { record: DryRunRecord }) {
  const { wouldFire, blockedReason } = record.outcome;
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 border-b border-line last:border-b-0">
      {wouldFire ? (
        <CheckCircle2
          className="w-4 h-4 mt-0.5 shrink-0 text-ok-active dark:text-ok"
          aria-hidden="true"
        />
      ) : (
        <CircleSlash className="w-4 h-4 mt-0.5 shrink-0 text-ink-2" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink truncate">{record.label}</p>
        <p className="text-xs text-ink-2 mt-0.5">{describeOutcome(record)}</p>
        {blockedReason && (
          <p className="text-xs text-warning-active dark:text-warning mt-0.5">{blockedReason}</p>
        )}
      </div>
      <Badge variant={wouldFire ? 'success' : 'outline'} className="shrink-0">
        {wouldFire ? 'dispararia' : 'não dispararia'}
      </Badge>
    </li>
  );
}

interface AutomationDryRunDialogProps {
  automation: Automation | null;
  onClose: () => void;
}

/**
 * Preview de "o que aconteceria" antes de confiar numa regra — nunca executa a ação de verdade
 * (ver `automation-dry-run.service.ts` no backend). Onda 42 (dossiê CPI, DEC-14, opção A).
 */
export function AutomationDryRunDialog({ automation, onClose }: AutomationDryRunDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof automationsApi.dryRun>> | null>(
    null,
  );

  const run = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await automationsApi.dryRun(id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setResult(null);
    setError(null);
    if (automation) void run(automation.id);
  }, [automation, run]);

  return (
    <Dialog
      isOpen={automation != null}
      onClose={onClose}
      title={automation ? `Simular: ${automation.name}` : 'Simular automação'}
      maxWidth="max-w-2xl"
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-ink-2 py-10">
          <Loader2 className="w-5 h-5 animate-spin" /> Simulando contra os dados atuais…
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-8">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-warning-active dark:text-warning" />
          <p className="text-sm text-ink-2 mb-4">{error}</p>
          {automation && (
            <Button variant="outline" size="sm" onClick={() => void run(automation.id)}>
              <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
            </Button>
          )}
        </div>
      )}

      {!loading && !error && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-center">
              <p className="text-lg font-bold text-ink">{result.sampleSize}</p>
              <p className="text-[11px] text-ink-2 uppercase tracking-wide">amostrados</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-center">
              <p className="text-lg font-bold text-ink">{result.matchedCount}</p>
              <p className="text-[11px] text-ink-2 uppercase tracking-wide">bateram a condição</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-center">
              <p className="text-lg font-bold text-ok-active dark:text-ok">
                {result.wouldFireCount}
              </p>
              <p className="text-[11px] text-ink-2 uppercase tracking-wide">disparariam a ação</p>
            </div>
          </div>

          {result.records.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-line rounded-xl">
              <FlaskConical className="w-8 h-8 mx-auto mb-3 text-ink-2" />
              <p className="text-sm text-ink-2">
                Nenhum registro da amostra bateu a condição desta regra agora.
              </p>
            </div>
          ) : (
            <ul className="border border-line rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              {result.records.map((record) => (
                <ResultRow key={`${record.entity}-${record.entityId}`} record={record} />
              ))}
            </ul>
          )}

          <p className="text-[11px] text-ink-2 leading-relaxed">{result.methodologyNote}</p>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => automation && void run(automation.id)}
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Simular novamente
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
