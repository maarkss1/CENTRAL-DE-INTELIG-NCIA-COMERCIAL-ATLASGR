/**
 * BottomSheet — wrapper sobre Vaul (https://github.com/emilkowalski/vaul)
 *
 * Substitui modais/drawers em viewports mobile (< 768px) por um bottom sheet
 * deslizável nativo-like, mantendo o Drawer.tsx existente para desktop.
 *
 * Uso:
 *   <BottomSheet open={open} onOpenChange={setOpen} title="Detalhe">
 *     ...conteúdo...
 *   </BottomSheet>
 */
import type { ReactNode } from 'react';
import { Drawer } from 'vaul';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Snap points em fração da viewport (ex.: [0.5, 1]). Default: [0.85] */
  snapPoints?: (number | string)[];
  /** Índice do snap point ativo inicial. */
  defaultSnapPoint?: number | string | null;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  snapPoints = [0.85],
  defaultSnapPoint = 0.85,
}: BottomSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={snapPoints}
      activeSnapPoint={defaultSnapPoint}
      setActiveSnapPoint={() => {}}
      // shouldScaleBackground=true aplica o efeito visual de zoom na página ao abrir
      shouldScaleBackground
    >
      <Drawer.Portal>
        {/* Overlay semi-transparente */}
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />

        {/* Painel deslizável */}
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl border-t border-line bg-surface focus:outline-none"
          aria-describedby={description ? 'bottom-sheet-description' : undefined}
        >
          {/* Handle de arraste */}
          <div
            className="mx-auto mt-3 h-1.5 w-12 flex-shrink-0 rounded-full bg-line"
            aria-hidden="true"
          />

          {/* Header opcional */}
          {(title || description) && (
            <div className="px-6 pb-2 pt-4">
              {title && (
                <Drawer.Title className="text-base font-bold text-ink">{title}</Drawer.Title>
              )}
              {description && (
                <Drawer.Description
                  id="bottom-sheet-description"
                  className="mt-0.5 text-xs text-ink-2"
                >
                  {description}
                </Drawer.Description>
              )}
            </div>
          )}

          {/* Conteúdo com scroll próprio */}
          <div className="flex-1 overflow-y-auto px-6 pb-safe-area-inset-bottom pb-6">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * Hook utilitário: retorna true quando a viewport é mobile (< 768px).
 * Permite ao chamador decidir entre <BottomSheet> e <Drawer> de forma idiomática.
 *
 * Exemplo:
 *   const isMobile = useIsMobile();
 *   return isMobile
 *     ? <BottomSheet open={open} onOpenChange={setOpen}>...</BottomSheet>
 *     : <Drawer isOpen={open} onClose={() => setOpen(false)} title="...">...</Drawer>;
 */
export function useIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}
