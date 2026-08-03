import React, { useState } from 'react';
import { Lightbulb, ChevronRight, X, Sparkles } from 'lucide-react';

interface ContextualTipProps {
    id: string;
    title: string;
    description: string;
    badgeText?: string;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export const ContextualTip: React.FC<ContextualTipProps> = ({
    id: _id,
    title,
    description,
    badgeText = '💡 Dica da IA Atlas',
    actionLabel,
    onAction,
    className = ''
}) => {
    const [dismissed, setDismissed] = useState(false);
    const [expanded, setExpanded] = useState(true);

    if (dismissed) return null;

    return (
        <div 
            className={`relative bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-blue-500/10 border border-amber-500/20 rounded-2xl p-4 backdrop-blur-md shadow-xs transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${className}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 animate-pulse">
                        <Lightbulb className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                                {badgeText}
                            </span>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1">
                                {title}
                            </h4>
                        </div>
                        {expanded && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-1">
                                {description}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs text-ink-2 hover:text-amber-400 p-1 rounded-lg hover:bg-surface-2 transition-colors"
                        title={expanded ? "Recolher dica" : "Expandir dica"}
                    >
                        <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-xs text-ink-2 hover:text-red-400 p-1 rounded-lg hover:bg-surface-2 transition-colors"
                        title="Fechar dica"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {expanded && actionLabel && onAction && (
                <div className="mt-3 pt-2 border-t border-amber-500/10 flex justify-end">
                    <button
                        onClick={onAction}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30 cursor-pointer"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        {actionLabel}
                    </button>
                </div>
            )}
        </div>
    );
};
