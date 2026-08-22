import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Classe Tailwind de largura máxima do painel (ex.: "max-w-2xl"). Default: "max-w-md". */
  maxWidth?: string;
  /** Rodapé fixo (ex.: botões Cancelar/Salvar), renderizado fora da área rolável do corpo. */
  footer?: React.ReactNode;
  /** Quando true, clique no backdrop e Escape não fecham o dialog — use durante um submit em
      andamento. O botão de fechar (X) e qualquer botão dentro de `footer`/`children` continuam
      funcionando normalmente; é uma proteção contra fechamento acidental, não um lock total. */
  preventClose?: boolean;
};

export function Dialog({ isOpen, onClose, title, children, maxWidth = 'max-w-md', footer, preventClose = false }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
        document.body.style.overflow = 'hidden';
      }
    } else {
      if (dialog.open) {
        dialog.close();
        document.body.style.overflow = '';
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      if (preventClose) return;
      onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
    };
  }, [onClose, preventClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (preventClose) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onKeyDown={(e) => { if (e.key === 'Enter' && !preventClose) onClose(); }}
      className={cn(
        'backdrop:bg-ink/50 backdrop:backdrop-blur-sm bg-surface rounded-card-lg shadow-card w-full p-0 outline-none overflow-hidden max-h-[90vh] flex flex-col',
        maxWidth
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-line shrink-0">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="p-1 rounded-md text-ink-2 hover:text-ink hover:bg-surface-2 transition focus-visible:ring-2 focus-visible:ring-brand outline-none"
        >
          <X size={20} />
        </button>
      </div>
      <div className="p-4 overflow-y-auto">
        {children}
      </div>
      {footer && (
        <div className="p-4 border-t border-line shrink-0 flex justify-end gap-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
