/**
 * AIContextPopover — popover contextual de IA usando @floating-ui/react
 *
 * Exibe insights rápidos de IA ao focar num campo/elemento ligado a um registro
 * (empresa, contato, deal). Resolve o gap mapeado no AIDockWidget: a IA não sabia
 * qual registro estava aberto — este componente entrega o contexto diretamente
 * no ponto de interação.
 *
 * Uso:
 *   <AIContextPopover entityType="company" entityId={company.id} entityName={company.tradeName}>
 *     <button>Ver insights</button>
 *   </AIContextPopover>
 */
import { useState, useRef, useCallback, type ReactNode } from 'react';
import {
  useFloating,
  useClick,
  useDismiss,
  useInteractions,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
  FloatingArrow,
  arrow,
} from '@floating-ui/react';
import { Bot, Loader2, Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api';

type EntityType = 'company' | 'contact' | 'deal';

interface AIContextPopoverProps {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  children: ReactNode;
}

interface AIInsight {
  summary: string;
  nextAction?: string;
  risk?: string;
}

const ENTITY_LABELS: Record<EntityType, string> = {
  company: 'Empresa',
  contact: 'Decisor',
  deal: 'Negócio',
};

export function AIContextPopover({
  entityType,
  entityId,
  entityName,
  children,
}: AIContextPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const arrowRef = useRef(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: 'start' }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const loadInsight = useCallback(async () => {
    if (insight || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AIInsight>(
        `/api/ai/context-insight?entityType=${entityType}&entityId=${entityId}`,
      );
      setInsight(data);
    } catch {
      setError('Não foi possível carregar o insight. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, insight, loading]);

  // Carrega insights ao abrir pela primeira vez
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) void loadInsight();
    },
    [loadInsight],
  );

  return (
    <>
      {/* Trigger — clona o filho passando a ref e props do floating */}
      <span
        ref={refs.setReference}
        {...getReferenceProps({ onClick: () => handleOpenChange(!isOpen) })}
        className="inline-flex cursor-pointer"
      >
        {children}
      </span>

      {/* Popover via portal */}
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[200] w-72 rounded-2xl border border-line bg-surface shadow-2xl backdrop-blur-xl"
            role="dialog"
            aria-label={`Insight de IA — ${ENTITY_LABELS[entityType]} ${entityName}`}
          >
            <FloatingArrow ref={arrowRef} context={context} className="fill-surface" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-active dark:text-brand-2">
                <Sparkles className="h-3.5 w-3.5" />
                IA — {ENTITY_LABELS[entityType]}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Fechar insight"
                className="rounded-lg p-1 text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Corpo */}
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold text-ink-2 truncate">{entityName}</p>

              {loading && (
                <div className="flex items-center gap-2 py-4 text-ink-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Analisando com IA…</span>
                </div>
              )}

              {error && (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
              )}

              {insight && !loading && (
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-2 mb-1">
                      Resumo
                    </p>
                    <p className="text-sm text-ink leading-relaxed">{insight.summary}</p>
                  </div>

                  {insight.nextAction && (
                    <div className="rounded-xl bg-brand/10 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-active dark:text-brand-2 mb-0.5">
                        Próxima Ação Recomendada
                      </p>
                      <p className="text-xs text-ink">{insight.nextAction}</p>
                    </div>
                  )}

                  {insight.risk && (
                    <div className="rounded-xl bg-amber-500/10 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">
                        Risco
                      </p>
                      <p className="text-xs text-ink">{insight.risk}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer — botão para abrir o copiloto completo */}
            <div className="border-t border-line px-4 py-3">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand-active dark:text-brand-2 transition-colors hover:bg-brand/20"
                onClick={() => {
                  setIsOpen(false);
                  window.dispatchEvent(new Event('atlas:open-ai-chat'));
                }}
              >
                <Bot className="h-3.5 w-3.5" />
                Abrir copiloto completo
              </button>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
