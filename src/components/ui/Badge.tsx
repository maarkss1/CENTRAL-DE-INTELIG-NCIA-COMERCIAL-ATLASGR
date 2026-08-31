/* eslint-disable react-refresh/only-export-components */
import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg',
  {
    variants: {
      variant: {
        default: 'bg-surface-2 text-ink-2 focus:ring-white/30',
        // text-success/warning/danger/info crus direto sobre a superfície clara caem abaixo de
        // 4.5:1 (achado do axe-core, tests/e2e/accessibility.spec.ts) — as variantes -active
        // (globals.css) escurecem só no tema claro, onde o texto saturado cru falha; no escuro a
        // cor crua já passa e as tokens -active reaproveitam o mesmo valor.
        success: 'bg-success/15 text-success-active dark:text-success focus:ring-success/40',
        warning: 'bg-warning/15 text-warning-active dark:text-warning focus:ring-warning/40',
        danger: 'bg-danger/15 text-danger-active dark:text-danger focus:ring-danger/40',
        info: 'bg-info/15 text-info-active dark:text-info focus:ring-info/40',
        neon: 'bg-brand/15 text-brand focus:ring-brand/40',
        gradient:
          'bg-gradient-to-r from-brand to-white text-slate-950 font-black shadow-[0_0_12px_-2px_color-mix(in_srgb,var(--brand)_60%,transparent)] focus:ring-brand/40',
        outline: 'border border-line text-ink-2 focus:ring-white/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
