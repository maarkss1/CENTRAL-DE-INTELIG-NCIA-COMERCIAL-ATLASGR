import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

/* Novo primitivo — checklist de leitura/orientação (ex.: pontos de um relatório, não uma lista
   de tarefas com estado). Para checklist interativo com toggle/progresso, veja o padrão já usado
   em JoaoReisDiagnosticHub.tsx ("Roteiro do Dia") — mais rico (bloco de horário, meta, progresso)
   e deliberadamente não generalizado aqui pra não perder esse detalhe. */
export interface ChecklistItemData {
  id: string;
  text: ReactNode;
  /** Marca o item como já cumprido — só muda o tom do ícone, não é interativo aqui. */
  checked?: boolean;
}

export function Checklist({ items }: { items: ChecklistItemData[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-2.5 rounded-card border border-line bg-surface-2 p-3 px-3.5 transition-[transform,box-shadow,background-color] duration-150 hover:translate-x-1 hover:bg-surface hover:shadow-[0_8px_18px_-12px_rgba(0,0,0,0.18)]"
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px]',
              item.checked ? 'bg-ok/15 text-ok-active dark:text-ok' : 'bg-brand/10 text-brand',
            )}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          <span className="text-[13px] leading-relaxed text-ink">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
