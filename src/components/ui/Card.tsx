/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const cardVariants = cva('relative overflow-hidden rounded-card text-ink', {
  variants: {
    variant: {
      // shadow-card/shadow-card-hover (não rgba cru) — a sombra anterior era calibrada só pro
      // tema claro (praticamente invisível sobre --surface escura, o tema padrão do produto por
      // CREATIVE_SYSTEM_01.md seção C) e usava border-gray-200, que não reage a tema nenhum.
      default:
        'bg-surface border border-line shadow-card transition-shadow hover:shadow-card-hover',
      // Gradiente sutil (não decorativo à toa: distingue KPI/métrica de conteúdo comum, os 3
      // consumidores reais são todos tiles de indicador — KpiTile, Analytics, Billing) trocado
      // de from-gray-50/to-white (fixo, só funcionava no tema claro) pros próprios tokens de
      // superfície, que já reagem a tema.
      stat: 'bg-gradient-to-br from-surface to-surface-2 border border-line shadow-card transition-shadow hover:shadow-card-hover',
      outline: 'border border-line bg-transparent',
      accent: 'bg-surface border border-brand/30 shadow-glow-brand',
    },
    padding: {
      default: 'p-6',
      sm: 'p-4',
      lg: 'p-8',
      none: 'p-0',
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'default',
  },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  /** Faixa de destaque laranja→branco no topo do card — assinatura visual da marca Atlas. */
  accentBar?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, accentBar, children, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant, padding, className }))} {...props}>
      {accentBar && (
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand via-brand-2 to-white" />
      )}
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1 mb-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    // eslint-disable-next-line jsx-a11y/heading-has-content -- children chega via {...props} (wrapper genérico), o lint não enxerga isso estaticamente
    <h3
      ref={ref}
      className={cn('font-display text-lg font-bold text-ink tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-ink-2', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-ink-2', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-3 mt-4 pt-4 border-t border-line', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants };
