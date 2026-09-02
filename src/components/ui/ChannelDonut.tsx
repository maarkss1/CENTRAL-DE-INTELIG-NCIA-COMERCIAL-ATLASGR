/* Generalizado a partir de `ChannelDonut` (JoaoReisDiagnosticHub.tsx) — o mapa de cor por canal
   (Ligação/WhatsApp/E-mail/LinkedIn) era vocabulário fixo de SDR; virou prop `colorMap` pra não
   carregar regra de negócio no componente base (ver AGENTS.md desta pasta). */
export interface ChannelDonutProps {
  data: Record<string, number>;
  /** Cor por rótulo (token CSS, ex. `var(--brand)`) — sem entrada usa `var(--ink-2)`. */
  colorMap?: Record<string, string>;
  totalLabel?: string;
  formatLabel?: (label: string) => string;
}

export function ChannelDonut({
  data,
  colorMap = {},
  totalLabel = 'total',
  formatLabel = (label) => label,
}: ChannelDonutProps) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  let acc = 0;
  const stops = sorted
    .map(([label, value]) => {
      const from = total ? (acc / total) * 100 : 0;
      acc += value;
      const to = total ? (acc / total) * 100 : 0;
      return `${colorMap[label] ?? 'var(--ink-2)'} ${from}% ${to}%`;
    })
    .join(', ');

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        role="img"
        aria-label={`${total} ${totalLabel}`}
        className="relative h-32 w-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
      >
        <div className="absolute inset-[16%] flex flex-col items-center justify-center rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
          <span className="font-mono text-xl font-bold tabular-nums text-ink">{total}</span>
          <span className="text-[9px] uppercase tracking-wide text-ink-2">{totalLabel}</span>
        </div>
      </div>
      <div className="min-w-[220px] flex-1 space-y-2">
        {sorted.map(([label, value]) => {
          const pct = total ? Math.round((value / total) * 1000) / 10 : 0;
          return (
            <div key={label} className="grid grid-cols-[8px_1fr_64px] items-center gap-2.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-sm"
                style={{ background: colorMap[label] ?? 'var(--ink-2)' }}
              />
              <span className="truncate text-[11px] font-semibold text-ink">
                {formatLabel(label)}
              </span>
              <span className="text-right font-mono text-[10px] tabular-nums text-ink-2">
                {value} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
