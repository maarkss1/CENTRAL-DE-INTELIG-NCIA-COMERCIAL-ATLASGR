import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  side?: 'right' | 'left';
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  side = 'right'
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else {
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const slideVariants = {
    closed: {
      x: side === 'right' ? '100%' : '-100%',
      opacity: 0,
      transition: { type: 'spring' as const, damping: 25, stiffness: 250 }
    },
    open: {
      x: '0%',
      opacity: 1,
      transition: { type: 'spring' as const, damping: 25, stiffness: 250 }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
          />

          {/* Drawer Content */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            initial="closed"
            animate="open"
            exit="closed"
            variants={slideVariants}
            className={`relative z-10 w-full max-w-lg bg-surface border-l border-line shadow-2xl flex flex-col h-full ml-auto ${
              side === 'left' ? 'mr-auto ml-0 border-r border-l-0' : ''
            }`}
          >
            {/* Header */}
            <div className="p-6 border-b border-line flex items-center justify-between bg-surface backdrop-blur-md sticky top-0 z-10">
              <div>
                <h3 id="drawer-title" className="text-lg font-bold text-ink tracking-tight">{title}</h3>
                {subtitle && <p className="text-xs text-ink-2 mt-0.5">{subtitle}</p>}
              </div>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                aria-label="Fechar gaveta"
                className="p-2 rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors focus-visible:ring-2 focus-visible:ring-atlas-orange outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
