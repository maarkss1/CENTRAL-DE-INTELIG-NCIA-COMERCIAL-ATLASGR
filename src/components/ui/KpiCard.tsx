import type { ComponentType } from 'react';
import { cn } from '../../lib/utils';

/* Generalizado a partir de `KpiStat` (JoaoReisDiagnosticHub.tsx) — mesmo vocabulário visual
   (barra de destaque no topo, chip de ícone, valor em mono tabular), promovido pra cá porque
   passou a ser reaproveitado fora do diagnóstico SDR. Tons "ok"/"gold" usam a mesma variante
   -active/dark: já estabelecida em Badge.tsx (achado real do axe-core: cor saturada crua sobre
   --surface clara cai abaixo de 4.5:1) — o KpiStat original usava a cor crua (bg-ok/10 text-ok),
   corrigido aqui na extração. */
const KPI_TONES = {
  brand: { bar: 'bg-brand', chip: 'bg-brand/10 text-brand', value: 'text-brand' },
  ink: { bar: 'bg-ink-2/30', chip: 'bg-surface-2 text-ink-2', value: 'text-ink' },
  ok: {
    bar: 'bg-ok',
    chip: 'bg-ok/15 text-ok-active dark:text-ok',
    value: 'text-ok-active dark:text-ok',
  },
  gold: {
    bar: 'bg-gold',
    chip: 'bg-gold/15 text-warn-active dark:text-gold',
    value: 'text-warn-active dark:text-gold',
  },
  critical: { bar: 'bg-critical', chip: 'bg-critical/10 text-critical', value: 'text-critical' },
} as const;

export type KpiTone = keyof typeof KPI_TONES;

export interface KpiCardProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  caption?: string;
  tone?: KpiTone;
  /** Torna o card um botão de drill-down (ex.: abrir modal com a lista por trás do número). */
  onSelect?: () => void;
  /** Estado ativo do drill-down — gira o chevron e destaca a borda. */
  active?: boolean;
  className?: string;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  caption,
  tone = 'ink',
  onSelect,
  active = false,
  className,
}: KpiCardProps) {
  const t = KPI_TONES[tone];
  const sharedClassName = cn(
    'relative w-full overflow-hidden rounded-card border border-line bg-surface p-4 text-left shadow-card transition-[transform,box-shadow,border-color] duration-200',
    onSelect &&
      'cursor-pointer hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    active && 'border-brand/50 shadow-[0_0_0_2px_color-mix(in_srgb,var(--brand)_28%,transparent)]',
    className,
  );

  const content = (
    <>
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', t.bar)} aria-hidden="true" />
      <span className="flex items-center justify-between">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', t.chip)}>
          <Icon className="h-4 w-4" />
        </span>
        {onSelect && (
          <span
            aria-hidden="true"
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors duration-200',
              active && 'bg-brand text-white',
            )}
          >
            <svg
              viewBox="0 0 10 10"
              fill="none"
              className={cn(
                'h-2.5 w-2.5 transition-transform duration-200',
                active && 'rotate-180',
              )}
            >
              <path
                d="M2 3.5 5 6.5 8 3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </span>
      <p className={cn('mt-3 font-mono text-2xl font-bold tabular-nums', t.value)}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-ink-2">{label}</p>
      {caption && <p className="mt-0.5 text-[10px] text-ink-2">{caption}</p>}
    </>
  );

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} aria-pressed={active} className={sharedClassName}>
        {content}
      </button>
    );
  }

  return <div className={sharedClassName}>{content}</div>;
}
