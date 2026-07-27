import React from 'react';
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
    if (!info) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div 
                className="bg-gray-900 border border-gray-800 text-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-300 relative overflow-hidden"
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
                                <h3 className="text-xl font-bold text-white tracking-tight">{info.name}</h3>
                                <span 
                                    className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border"
                                    style={{ backgroundColor: info.bgColor, borderColor: info.borderColor, color: info.color }}
                                >
                                    {info.category}
                                </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                <Info className="w-3 h-3 text-blue-400" />
                                Ecossistema Tecnológico Mapeado
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={onClose}
                        className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-4 space-y-2">
                    <p className="text-sm text-gray-300 leading-relaxed">
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
                        className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
