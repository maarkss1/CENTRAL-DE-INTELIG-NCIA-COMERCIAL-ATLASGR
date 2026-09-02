import { cn } from '../../lib/utils';

/* Generalizado a partir de `FunnelBars` (JoaoReisDiagnosticHub.tsx) — o mapeamento de status
   Bitrix (CONVERTED/JUNK → tom ok/critical) é regra de negócio e fica com quem chama, não aqui
   (ver AGENTS.md de src/components/ui/: "não inserir regra de negócio em componente base"). */
export interface FunnelBarItem {
  id: string;
  label: string;
  value: number;
  tone?: 'brand' | 'ok' | 'critical';
}

const TONE_BAR = { brand: 'bg-brand', ok: 'bg-ok', critical: 'bg-critical' } as const;

export function FunnelBars({ items }: { items: FunnelBarItem[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const widthPct = Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0);
        return (
          <div key={item.id} className="grid grid-cols-[140px_1fr_44px] items-center gap-3 text-xs">
            <span className="truncate font-semibold text-ink">{item.label}</span>
            <div
              role="img"
              aria-label={`${item.label}: ${item.value}`}
              className="h-4 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  TONE_BAR[item.tone ?? 'brand'],
                )}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="text-right font-mono font-bold tabular-nums text-ink">
              {item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
