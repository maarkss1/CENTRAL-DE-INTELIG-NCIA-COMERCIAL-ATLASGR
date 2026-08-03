import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Filter, Search, Shield } from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { BRAND_OBJECTIONS } from '../../chatbook/constants/brandMatrices';

export function ObjectionsMatrixPage() {
    const { activeBrand, brandInfo } = useBrand();
    const [selectedSegment, setSelectedSegment] = useState('todos');
    const [selectedPersona, setSelectedPersona] = useState('todos');
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const brandObjections = useMemo(
        () => BRAND_OBJECTIONS.filter((item) => item.brand === activeBrand),
        [activeBrand],
    );
    const segments = useMemo(
        () => Array.from(new Set(brandObjections.map((item) => item.segment))).sort(),
        [brandObjections],
    );
    const personas = useMemo(
        () => Array.from(new Set(brandObjections.map((item) => item.persona))).sort(),
        [brandObjections],
    );
    const filtered = brandObjections.filter((item) => {
        if (selectedSegment !== 'todos' && item.segment !== selectedSegment) return false;
        if (selectedPersona !== 'todos' && item.persona !== selectedPersona) return false;
        const q = searchTerm.trim().toLowerCase();
        if (q) {
            const haystack = `${item.objectionTitle} ${item.objectionText} ${item.responseScript} ${item.keyDifferentiator}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-6 sm:p-8 font-sans">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="space-y-3">
                    <h1 className="text-4xl font-black tracking-tight text-ink flex items-center gap-3">
                        <Shield className="text-atlas-orange" size={32} /> Matriz de Objeções
                    </h1>
                    <p className="text-ink-2 text-sm font-medium">
                        {brandObjections.length} objeções mapeadas para {brandInfo.name} com script de contorno recomendado e diferencial-chave.
                    </p>
                </div>

                <div className="bg-surface/80 p-4 rounded-2xl border border-line flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5 shrink-0">
                        <Filter size={14} className="text-atlas-orange" /> Filtros
                    </span>
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por palavra-chave..."
                            className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-2 text-ink text-xs font-semibold border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                        />
                    </div>
                    <select
                        value={selectedSegment}
                        onChange={(e) => setSelectedSegment(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-surface-2 text-ink text-xs font-semibold border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                    >
                        <option value="todos">Todos os Segmentos</option>
                        {segments.map((seg) => <option key={seg} value={seg}>{seg}</option>)}
                    </select>
                    <select
                        value={selectedPersona}
                        onChange={(e) => setSelectedPersona(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-surface-2 text-ink text-xs font-semibold border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                    >
                        <option value="todos">Todas as Personas</option>
                        {personas.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <span className="text-[11px] text-ink-2 ml-auto">{filtered.length} resultado(s)</span>
                </div>

                <div className="space-y-4">
                    {filtered.length === 0 ? (
                        <div className="text-center py-12 text-sm text-ink-2 bg-surface/60 rounded-2xl border border-dashed border-line">
                            Nenhuma objeção encontrada para os filtros selecionados.
                        </div>
                    ) : (
                        filtered.map((item) => (
                            <div key={item.id} className="bg-surface/80 p-6 rounded-2xl border border-line space-y-3 shadow-sm">
                                <div className="flex items-center justify-between pb-3 border-b border-line flex-wrap gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 text-danger font-bold">{item.segment}</span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/15 text-info font-bold">{item.persona}</span>
                                    </div>
                                    <button
                                        onClick={() => handleCopy(item.responseScript, item.id)}
                                        className="text-xs text-ink-2 hover:text-ink flex items-center gap-1.5 shrink-0"
                                    >
                                        {copiedKey === item.id ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                        {copiedKey === item.id ? 'Copiado' : 'Copiar resposta'}
                                    </button>
                                </div>

                                <div>
                                    <h3 className="font-black text-sm text-ink mb-1 flex items-center gap-1.5">
                                        <AlertTriangle size={14} className="text-amber-500" /> "{item.objectionTitle}"
                                    </h3>
                                    <p className="text-ink-2 text-sm italic">"{item.objectionText}"</p>
                                </div>

                                <div className="p-4 rounded-xl bg-surface-2 border border-line">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-success block mb-1">Script de Contorno Recomendado</span>
                                    <p className="text-sm text-ink leading-relaxed font-medium">{item.responseScript}</p>
                                </div>

                                <p className="text-xs text-amber-500 font-bold">💡 Diferencial-chave: {item.keyDifferentiator}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
