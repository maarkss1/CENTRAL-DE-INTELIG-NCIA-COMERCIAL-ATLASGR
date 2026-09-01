import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';

export interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' usa o botão vermelho (variant="destructive") — ações irreversíveis/de exclusão. */
  variant?: 'default' | 'danger';
}

/**
 * Substitui `window.confirm()` por um diálogo estilizado, reaproveitando o primitivo `Dialog` já
 * existente (foco preso, Escape, backdrop já resolvidos ali). Mantém a mesma forma de uso
 * imperativa que `confirm()` nativo tinha (`if (!(await confirm({...}))) return;`), pra minimizar
 * o diff nos ~14 call sites que já usavam `window.confirm()`/`confirm()` — troca de API, não de
 * fluxo. Renderize `dialog` uma vez no componente que chama `confirm(...)`.
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOptions(null);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const dialog = options ? (
    <Dialog
      isOpen
      onClose={() => settle(false)}
      title={options.title}
      footer={
        <>
          <Button variant="secondary" onClick={() => settle(false)}>
            {options.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            variant={options.variant === 'danger' ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {options.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{options.description}</p>
    </Dialog>
  ) : null;

  return { confirm, dialog };
}
