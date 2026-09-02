import type { ComponentType } from 'react';
import { cn } from '../../lib/utils';

/* Novo primitivo — navegação em cards grandes (ícone + título + subtítulo), usado como troca de
   aba/seção quando cada opção carrega contexto suficiente pra merecer um card em vez de um tab
   de texto simples (ex.: home do portal, hub de relatórios). */
export interface TabCardItem {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}

export function TabNavCards({
  items,
  activeId,
  onSelect,
}: {
  items: TabCardItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.id)}
            className={cn(
              'relative flex items-center gap-3.5 overflow-hidden rounded-card border border-line bg-surface p-4 px-5 text-left shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              active ? 'border-brand/45' : 'hover:shadow-card-hover',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-0 top-0 h-1',
                active ? 'bg-gradient-to-r from-brand to-brand-2' : 'bg-ink-2/20',
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] transition-[background-color,color,transform] duration-200',
                active ? 'scale-105 bg-brand text-white' : 'bg-brand/[0.08] text-brand',
              )}
            >
              <item.icon className="h-[22px] w-[22px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15.5px] font-black tracking-tight text-ink">
                {item.title}
              </span>
              {item.subtitle && (
                <span className="mt-0.5 block text-[11px] leading-snug text-ink-2">
                  {item.subtitle}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
