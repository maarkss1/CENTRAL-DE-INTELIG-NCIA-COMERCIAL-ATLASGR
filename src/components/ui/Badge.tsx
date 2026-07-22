import React from 'react';
import { cn } from '../../lib/utils';

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline' | 'glass' | 'brand';
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    outline: 'border border-slate-200 text-slate-800',
    glass: 'glass-panel text-atlas-dark',
    brand: 'bg-atlas-orange/10 text-atlas-orange ring-1 ring-atlas-orange/20',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
