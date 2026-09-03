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

// Abaixo deste percentual de largura, o rótulo formatado (ex. "R$ 3.950") não cabe dentro do
// próprio segmento preenchido — em vez de deixar o texto vazar pra fora do track (achado real do
// code-review: só o track tinha overflow-hidden, não o preenchimento, então o texto de uma barra
// de 2% de largura aparecia solto no meio do trilho vazio), o rótulo passa a ficar fora da barra,
// à direita do trilho, em vez de sobreposto ao preenchimento.
const LABEL_OUTSIDE_THRESHOLD = 18;

function CompareBarRow({
  seriesLabel,
  value,
  widthPct,
  format,
  fillClassName,
  labelClassName,
}: {
  seriesLabel: string;
  value: number;
  widthPct: number;
  format: (value: number) => string;
  fillClassName: string;
  labelClassName: string;
}) {
  const formatted = format(value);
  const showInside = widthPct >= LABEL_OUTSIDE_THRESHOLD;
  return (
    <div className="flex items-center gap-2">
      <div
        role="img"
        aria-label={`${seriesLabel}: ${formatted}`}
        className="h-5 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn(
            'flex h-full items-center justify-end rounded-full px-2 transition-all duration-700',
            fillClassName,
          )}
          style={{ width: `${widthPct}%` }}
        >
          {showInside && (
            <span className={cn('font-mono text-[10px] font-bold tabular-nums', labelClassName)}>
              {formatted}
            </span>
          )}
        </div>
      </div>
      {!showInside && (
        <span className="whitespace-nowrap font-mono text-[10px] font-bold tabular-nums text-ink">
          {formatted}
        </span>
      )}
    </div>
  );
}

export function CompareBar({ label, seriesA, seriesB, format = defaultFormat }: CompareBarProps) {
  const max = Math.max(seriesA.value, seriesB.value, 1);
  const widthA = Math.max((seriesA.value / max) * 100, seriesA.value > 0 ? 2 : 0);
  const widthB = Math.max((seriesB.value / max) * 100, seriesB.value > 0 ? 2 : 0);
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <span className="text-xs font-semibold text-ink">{label}</span>
      <div className="space-y-1">
        <CompareBarRow
          seriesLabel={seriesA.label}
          value={seriesA.value}
          widthPct={widthA}
          format={format}
          fillClassName="bg-brand/30"
          labelClassName="text-ink"
        />
        <CompareBarRow
          seriesLabel={seriesB.label}
          value={seriesB.value}
          widthPct={widthB}
          format={format}
          fillClassName="bg-brand"
          labelClassName="text-white"
        />
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
            ? 'bg-critical/15 text-critical-active dark:text-critical'
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
