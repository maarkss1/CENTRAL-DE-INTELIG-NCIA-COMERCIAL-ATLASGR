import { cn } from '../../lib/utils';

/* Generalizado a partir de `DealsGrid` (JoaoReisDiagnosticHub.tsx) — o mapa de estágio Bitrix
   (DEAL_STAGE_LABEL, IDs tipo UC_A0VPC5) é regra de negócio e fica com quem chama: o componente
   recebe `status`/`statusLabel` já resolvidos (ver AGENTS.md desta pasta). */
export interface DealCardData {
  id: string;
  title: string;
  status: 'won' | 'lost' | 'open';
  statusLabel: string;
  value: number;
}

const defaultFormatValue = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function DealCard({
  deal,
  formatValue = defaultFormatValue,
}: {
  deal: DealCardData;
  formatValue?: (value: number) => string;
}) {
  const { status, statusLabel, title, value } = deal;
  const borderTone =
    status === 'won'
      ? 'border-l-ok'
      : status === 'lost'
        ? 'border-l-critical'
        : 'border-l-ink-2/50';
  const badgeClass =
    status === 'won'
      ? 'bg-ok/15 text-ok-active dark:text-ok'
      : status === 'lost'
        ? 'bg-critical/15 text-critical'
        : 'bg-surface text-ink-2 border border-line';
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-card border border-l-[3px] border-line bg-surface-2 p-3.5',
        borderTone,
      )}
    >
      <p className="min-h-[2.2em] text-xs font-bold leading-snug text-ink line-clamp-2">{title}</p>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'whitespace-nowrap rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
            badgeClass,
          )}
        >
          {statusLabel}
        </span>
        <span className="whitespace-nowrap font-mono text-sm font-bold tabular-nums text-ink">
          {formatValue(value)}
        </span>
      </div>
    </div>
  );
}

export function DealsGrid({
  deals,
  emptyLabel = 'Nenhum negócio rastreado neste período.',
  formatValue,
}: {
  deals: DealCardData[];
  emptyLabel?: string;
  formatValue?: (value: number) => string;
}) {
  if (!deals.length) {
    return <p className="text-xs text-ink-2">{emptyLabel}</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} formatValue={formatValue} />
      ))}
    </div>
  );
}
