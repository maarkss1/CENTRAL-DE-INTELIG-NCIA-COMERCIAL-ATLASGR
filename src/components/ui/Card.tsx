import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useTilt } from '../../lib/motion';

type ConflictingProps = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, ConflictingProps> {
  variant?: 'default' | 'glass' | 'elevated' | 'interactive';
  /** Ativa inclinação 3D sutil que segue o cursor (desativada com prefers-reduced-motion). */
  tilt?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<CardProps['variant']>, string> = {
  default: 'bg-white border border-slate-100 elevation-1',
  glass: 'glass-panel elevation-2',
  elevated: 'bg-white border border-slate-100 elevation-3',
  interactive:
    'bg-white border border-slate-100 elevation-2 hover:elevation-3 hover:border-atlas-orange/25 hover:-translate-y-1 transition-all duration-300 cursor-pointer',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', tilt = false, children, style, onClick, onKeyDown, role, tabIndex, ...props }, forwardedRef) => {
    const { ref: tiltRef, style: tiltStyle, onPointerMove, onPointerLeave } = useTilt(6);

    // Cards clicáveis precisam ser alcançáveis e ativáveis por teclado (WCAG 2.1.1),
    // já que renderizam como <div> em vez de <button>.
    const a11yProps = onClick
      ? {
          role: role ?? 'button',
          tabIndex: tabIndex ?? 0,
          onClick,
          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
            onKeyDown?.(event);
            if (!event.defaultPrevented && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              (onClick as React.MouseEventHandler<HTMLDivElement>)(event as unknown as React.MouseEvent<HTMLDivElement>);
            }
          },
        }
      : { role, tabIndex, onClick, onKeyDown };

    if (!tilt) {
      return (
        <div
          ref={forwardedRef}
          style={style}
          className={cn('rounded-2xl', VARIANT_CLASSES[variant], className)}
          {...a11yProps}
          {...props}
        >
          {children}
        </div>
      );
    }

    return (
      <motion.div
        ref={(node) => {
          tiltRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={{ ...style, ...tiltStyle, transformStyle: 'preserve-3d' }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className={cn('rounded-2xl', VARIANT_CLASSES[variant], className)}
        {...a11yProps}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
Card.displayName = 'Card';
