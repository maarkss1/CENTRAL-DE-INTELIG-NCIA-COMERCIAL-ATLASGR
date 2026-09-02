import type { ReactNode } from 'react';

/* Novo primitivo — "plano de ação" numerado (passo a passo). `<ol>/<li>` reais (não divs com
   número decorativo) pra leitor de tela anunciar "item 1 de N" — a contagem já vem da própria
   lista, sem precisar de contador CSS. */
export interface PlanStepDetail {
  label: string;
  value: ReactNode;
}

export interface PlanStep {
  id: string;
  text: ReactNode;
  details?: PlanStepDetail[];
}

export function ActionPlanSteps({ steps }: { steps: PlanStep[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className="flex gap-3 rounded-card border border-line bg-surface-2 p-3.5 transition-[transform,box-shadow,background-color] duration-150 hover:translate-x-1 hover:bg-surface hover:shadow-[0_8px_18px_-12px_rgba(0,0,0,0.18)]"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 font-mono text-xs font-black text-white shadow-[0_3px_8px_-3px_color-mix(in_srgb,var(--brand)_60%,transparent)]"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-relaxed text-ink">{step.text}</p>
            {step.details && step.details.length > 0 && (
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {step.details.map((detail) => (
                  <div
                    key={detail.label}
                    className="rounded-[9px] border border-line bg-surface p-2 px-2.5"
                  >
                    <p className="mb-0.5 text-[9px] font-black uppercase tracking-wide text-brand">
                      {detail.label}
                    </p>
                    <p className="text-[11.5px] leading-snug text-ink">{detail.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
