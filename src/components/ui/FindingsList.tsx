import type { ComponentType, ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils';

/* Novo primitivo — "achados" (findings) de um relatório: cada item marca um ganho (win) ou uma
   lacuna (gap) encontrada na análise, com destaque opcional de 2 pulsos (nunca em loop — regra
   §6 da Constituição: toda animação contínua precisa justificar o que comunica; aqui é "achado
   novo/crítico", disparo único no mount, respeita prefers-reduced-motion). */
export interface Finding {
  id: string;
  tone: 'win' | 'gap';
  icon: ComponentType<{ className?: string }>;
  text: ReactNode;
  meta?: string;
  /** Pisca a borda do marcador 2x pra chamar atenção — nunca em loop. */
  emphasize?: boolean;
}

const TONE = {
  win: {
    border: 'border-l-ok',
    chip: 'bg-ok/15 text-ok-active dark:text-ok',
    ring: 'rgba(15,157,100,.55)',
  },
  gap: {
    border: 'border-l-critical',
    chip: 'bg-critical/15 text-critical',
    ring: 'rgba(214,69,69,.55)',
  },
} as const;

export function FindingsList({ items }: { items: Finding[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <FindingRow key={item.id} {...item} />
      ))}
    </div>
  );
}

function FindingRow({ tone, icon: Icon, text, meta, emphasize }: Finding) {
  const reduceMotion = useReducedMotion();
  const t = TONE[tone];
  const shouldEmphasize = Boolean(emphasize) && !reduceMotion;
  return (
    <div
      className={cn(
        'flex gap-3 rounded-card border border-l-[3px] border-line bg-surface-2 p-3.5 transition-[transform,box-shadow,background-color] duration-150 hover:translate-x-1 hover:bg-surface hover:shadow-[0_8px_18px_-12px_rgba(0,0,0,0.18)]',
        t.border,
      )}
    >
      <motion.span
        aria-hidden="true"
        className={cn(
          'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px]',
          t.chip,
        )}
        animate={
          shouldEmphasize
            ? {
                boxShadow: [
                  `0 0 0 0 ${t.ring}`,
                  '0 0 0 12px rgba(0,0,0,0)',
                  '0 0 0 0 rgba(0,0,0,0)',
                ],
              }
            : undefined
        }
        transition={shouldEmphasize ? { duration: 1.4, ease: 'easeOut', repeat: 1 } : undefined}
      >
        <Icon className="h-3.5 w-3.5" />
      </motion.span>
      <p className="text-[13px] leading-relaxed text-ink">
        {text}
        {meta && <span className="mt-0.5 block text-[11px] text-ink-2">{meta}</span>}
      </p>
    </div>
  );
}
