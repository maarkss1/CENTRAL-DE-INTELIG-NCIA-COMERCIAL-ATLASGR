import { X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Normalmente uma string simples; aceita ReactNode para cabeçalhos com ícone/subtítulo (ex.:
      SavedSearchesModal) sem duplicar a estrutura de header fora deste componente. */
  title: React.ReactNode;
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

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
  footer,
  preventClose = false,
}: DialogProps) {
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

  // Bug real de acessibilidade/teclado corrigido (Onda 3, Agente 03): este componente tinha um
  // onKeyDown('Enter') no <dialog> que chamava onClose() a cada Enter, sem checar o alvo do
  // evento. Como Enter borbulha de qualquer <input>/<textarea>/<button> focado dentro do corpo
  // (todo formulário em Dialog — ContactForm, CompanyForm, PropostaForm, GoalEditorDialog etc. —
  // tem campos de texto), digitar num campo e apertar Enter fechava o modal e descartava o que a
  // pessoa tinha acabado de preencher, sem aviso. Escape para fechar já é tratado nativamente
  // acima ('cancel', disparado pelo <dialog>); Enter deve continuar tendo o comportamento nativo
  // de cada controle focado (ativar o botão em foco, ou nada em texto livre), não fechar o modal.
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (preventClose) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;
    if (!isInDialog) {
      onClose();
    }
  };

  return (
    // <dialog> nativo (não um <div> genérico): já tem semântica própria de modal, foco preso
    // dentro dele via showModal(), e Escape tratado pelo evento nativo 'cancel' (acima) — o
    // jsx-a11y não reconhece <dialog> como elemento interativo, então sinaliza o onClick de
    // "clicar fora fecha" como se fosse um <div> qualquer sem teclado. Padrão documentado pelo
    // próprio MDN para <dialog> + clique no backdrop; nenhum atalho de teclado fica sem
    // equivalente (Escape já fecha, foco já é gerenciado nativamente).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className={cn(
        'backdrop:bg-ink/50 backdrop:backdrop-blur-sm bg-surface rounded-card-lg shadow-card w-full p-0 outline-none overflow-hidden max-h-[90vh] open:flex open:flex-col',
        maxWidth,
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-line shrink-0">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="p-1 rounded-md text-ink-2 hover:text-ink hover:bg-surface-2 transition focus-visible:ring-2 focus-visible:ring-brand outline-none"
        >
          <X size={20} />
        </button>
      </div>
      <div className="p-4 overflow-y-auto">{children}</div>
      {footer && (
        <div className="p-4 border-t border-line shrink-0 flex justify-end gap-3">{footer}</div>
      )}
    </dialog>
  );
}
