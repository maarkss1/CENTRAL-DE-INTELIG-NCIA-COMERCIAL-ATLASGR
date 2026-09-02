import { cn } from '../../lib/utils';

/* Novo primitivo — heatmap de calendário (ex.: atividades por dia). Implementado como grade
   simples (não o módulo Calendar/Heatmap do ECharts já registrado em src/components/charts):
   aquele módulo desenha em canvas e perde a legibilidade de número por célula + navegação por
   teclado que uma grade de <button> nativa já dá de graça, pro volume de dados aqui (semanas de
   um mês, não anos de série temporal — caso pro qual o módulo ECharts foi pensado). */
export interface HeatmapDay {
  /** Data no formato YYYY-MM-DD. */
  date: string;
  count: number;
}

export interface CalendarHeatmapProps {
  days: HeatmapDay[];
  onSelectDay?: (date: string) => void;
  selectedDate?: string;
}

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const LEVEL_CLASS = [
  'bg-surface-2 text-ink-2',
  'bg-brand/[0.18] text-ink',
  'bg-brand/40 text-white',
  'bg-brand/65 text-white',
  'bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_0_0_2px_color-mix(in_srgb,var(--brand)_25%,transparent)]',
];

function levelOf(count: number, max: number) {
  if (count <= 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

export function CalendarHeatmap({ days, onSelectDay, selectedDate }: CalendarHeatmapProps) {
  if (!days.length) return null;

  const byDate = new Map(days.map((d) => [d.date, d.count]));
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(`${sorted[0].date}T00:00:00`);
  const last = new Date(`${sorted[sorted.length - 1].date}T00:00:00`);
  const leadingBlanks = first.getDay();

  const cells: { date: string | null; count: number }[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null, count: 0 });
  for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const iso = cursor.toISOString().slice(0, 10);
    cells.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }

  const max = Math.max(...days.map((d) => d.count), 1);
  const clickable = Boolean(onSelectDay);

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((w) => (
          <span
            key={w}
            className="text-center text-[9.5px] font-bold uppercase tracking-wide text-ink-2"
          >
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={`blank-${i}`} aria-hidden="true" />;
          const date = cell.date;
          const level = levelOf(cell.count, max);
          const dayNum = Number(date.slice(-2));
          const selected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSelectDay?.(date) : undefined}
              aria-label={`${date}: ${cell.count} atividade${cell.count === 1 ? '' : 's'}`}
              aria-pressed={clickable ? selected : undefined}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-[11px] border border-line text-center transition-transform duration-150 disabled:cursor-default',
                LEVEL_CLASS[level],
                clickable &&
                  'cursor-pointer hover:z-10 hover:scale-[1.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                selected && 'ring-2 ring-brand scale-[1.05]',
              )}
            >
              <span className="absolute left-1.5 top-1 text-[9px] opacity-70">{dayNum}</span>
              <span className="font-mono text-[15px] font-black">{cell.count || ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
