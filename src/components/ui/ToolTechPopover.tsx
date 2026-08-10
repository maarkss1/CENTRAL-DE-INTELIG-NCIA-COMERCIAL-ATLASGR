import React, { useEffect, useRef } from 'react';
import { X, Filter, Info } from 'lucide-react';
import { TechToolInfo } from './TechToolLogo';

interface ToolTechPopoverProps {
    info: TechToolInfo | null;
    onClose: () => void;
    onFilterByTool?: (toolName: string) => void;
}

export const ToolTechPopover: React.FC<ToolTechPopoverProps> = ({
    info,
    onClose,
    onFilterByTool
}) => {
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    // Escape fecha; foco vai pro botão Fechar ao abrir e volta pro controle que abriu ao fechar.
    // Escopo do popover em si (sem tocar a API pública nem os 3 consumidores) — o listener é
    // registrado de novo a cada abertura e sempre removido no cleanup, nunca acumula.
    useEffect(() => {
        if (!info) return;
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocusedRef.current?.focus?.();
        };
    }, [info, onClose]);

    if (!info) return null;

    return (
        // Backdrop de diálogo modal: clique fecha por conveniência de mouse/touch, mas o
        // equivalente de teclado é o Escape (tratado no useEffect acima) — o padrão de dismiss
        // por overlay não-focável é o mesmo endossado pelas ARIA Authoring Practices para diálogos,
        // por isso o disable pontual abaixo (mesmo raciocínio já documentado em CrmBoard.tsx).
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={(event) => {
                // Só fecha se o clique foi no próprio backdrop, não em algo dentro do painel.
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="tool-tech-popover-title"
                className="bg-surface border border-line text-ink rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-300 relative overflow-hidden"
                style={{
                    boxShadow: `0 20px 50px -10px ${info.color}25`
                }}
            >
                {/* Background glow accent */}
                <div
                    className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-30 pointer-events-none"
                    style={{ backgroundColor: info.color }}
                />

                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl border shadow-inner"
                            style={{ backgroundColor: info.bgColor, borderColor: info.borderColor, color: info.color }}
                        >
                            {info.name.charAt(0)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 id="tool-tech-popover-title" className="text-xl font-bold text-ink tracking-tight">{info.name}</h3>
                                <span
                                    className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border"
                                    style={{ backgroundColor: info.bgColor, borderColor: info.borderColor, color: info.color }}
                                >
                                    {info.category}
                                </span>
                            </div>
                            <p className="text-xs text-ink-2 mt-0.5 flex items-center gap-1">
                                <Info className="w-3 h-3 text-blue-400" />
                                Ecossistema Tecnológico Mapeado
                            </p>
                        </div>
                    </div>

                    <button
                        ref={closeButtonRef}
                        onClick={onClose}
                        aria-label="Fechar"
                        className="p-2 rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-surface-2 border border-line rounded-2xl p-4 space-y-2">
                    <p className="text-sm text-ink-2 leading-relaxed">
                        {info.description}
                    </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                    {onFilterByTool && (
                        <button
                            onClick={() => {
                                onFilterByTool(info.name);
                                onClose();
                            }}
                            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow-md hover:shadow-blue-500/25 active:scale-95"
                        >
                            <Filter className="w-4 h-4" />
                            Filtrar empresas com esta ferramenta
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 bg-surface-2 hover:bg-line text-ink-2 rounded-xl font-medium transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
