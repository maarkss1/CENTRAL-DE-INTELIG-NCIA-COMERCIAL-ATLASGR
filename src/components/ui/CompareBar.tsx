import { cn } from '../../lib/utils';

/* Generalizado a partir de `CompareBar`/`DeltaPill` (JoaoReisDiagnosticHub.tsx) — os rótulos de
   período (jul/ago) e a formatação em BRL eram fixos ao diagnóstico SDR; viraram props pra
   qualquer comparação de duas séries reaproveitar (ver AGENTS.md desta pasta). */
export interface CompareBarSeries {
  label: string;
  value: number;
}

export interface CompareBarProps {
  label: string;
  seriesA: CompareBarSeries;
  seriesB: CompareBarSeries;
  format?: (value: number) => string;
}

const defaultFormat = (value: number) => value.toLocaleString('pt-BR');

export function CompareBar({ label, seriesA, seriesB, format = defaultFormat }: CompareBarProps) {
  const max = Math.max(seriesA.value, seriesB.value, 1);
  const widthA = Math.max((seriesA.value / max) * 100, seriesA.value > 0 ? 2 : 0);
  const widthB = Math.max((seriesB.value / max) * 100, seriesB.value > 0 ? 2 : 0);
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <span className="text-xs font-semibold text-ink">{label}</span>
      <div className="space-y-1">
        <div
          role="img"
          aria-label={`${seriesA.label}: ${format(seriesA.value)}`}
          className="h-5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="flex h-full items-center justify-end rounded-full bg-brand/30 px-2 font-mono text-[10px] font-bold tabular-nums text-ink transition-all duration-700"
            style={{ width: `${widthA}%` }}
          >
            {format(seriesA.value)}
          </div>
        </div>
        <div
          role="img"
          aria-label={`${seriesB.label}: ${format(seriesB.value)}`}
          className="h-5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="flex h-full items-center justify-end rounded-full bg-brand px-2 font-mono text-[10px] font-bold tabular-nums text-white transition-all duration-700"
            style={{ width: `${widthB}%` }}
          >
            {format(seriesB.value)}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface DeltaPillProps {
  value: number;
  suffix?: string;
  note?: string;
}

export function DeltaPill({ value, suffix = '%', note }: DeltaPillProps) {
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums',
        positive
          ? 'bg-ok/15 text-ok-active dark:text-ok'
          : negative
            ? 'bg-critical/15 text-critical'
            : 'bg-surface-2 text-ink-2',
      )}
    >
      {positive ? '+' : ''}
      {value}
      {suffix}
      {note ? ` (${note})` : ''}
    </span>
  );
}
