import { Search, Loader2, AlertTriangle, Landmark } from 'lucide-react';
import type { CnpjLookupResult } from '../../services/enrichment.service';
import { CnpjResultCard } from './CnpjResultCard';

export function CnpjSearchPanel({
    cnpjInput, setCnpjInput, cnpjLoading, cnpjResult, cnpjError, onLookup, onSearchWebInstead,
    promotingKey, onPromoteCnpjResult, promoted,
}: {
    cnpjInput: string;
    setCnpjInput: (value: string) => void;
    cnpjLoading: boolean;
    cnpjResult: CnpjLookupResult | null;
    cnpjError: string | null;
    onLookup: () => void;
    onSearchWebInstead: (query: string) => void;
    promotingKey: string | null;
    onPromoteCnpjResult: () => void;
    promoted: Record<string, unknown>;
}) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-4 bg-slate-900/60 p-6 sm:p-8 rounded-2xl border border-white/10 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-atlas-orange/10 flex items-center justify-center text-atlas-orange">
                        <Landmark size={18} />
                    </div>
                    <h2 className="font-black text-xl text-white">🏛️ Busca Direta</h2>
                </div>
                <p className="text-xs text-gray-400 mb-4">Busque via CNPJ na Receita Federal ou crie uma empresa pelo Nome para prospecção.</p>
                <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">CNPJ ou Nome da Empresa</label>
                <input
                    className="w-full p-3 bg-slate-950/60 rounded-[2rem] border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white mb-4"
                    value={cnpjInput}
                    placeholder="Ex: 19.131.243/0001-97 ou Nubank"
                    onChange={(e) => setCnpjInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onLookup()}
                />
                <div className="flex flex-col gap-2">
                    <button
                        onClick={onLookup}
                        disabled={cnpjLoading || !cnpjInput}
                        className="w-full bg-atlas-orange text-white py-3.5 rounded-[2rem] font-bold hover:bg-[#E04B12] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-atlas-orange/20"
                    >
                        {cnpjLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                        {cnpjLoading ? '⏳ Consultando...' : '🔎 Consultar CNPJ'}
                    </button>

                    {cnpjInput && !/[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}/.test(cnpjInput) && (
                        <button
                            onClick={() => onSearchWebInstead(cnpjInput)}
                            className="w-full bg-white/10 text-gray-200 py-3.5 rounded-[2rem] font-bold hover:bg-atlas-dark hover:text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2"
                        >
                            ✨ Buscar "{cnpjInput}" na web (Radar)
                        </button>
                    )}
                </div>
                {cnpjError && (
                    <div className="mt-4 p-3 bg-danger/10 border border-danger/30 rounded-[2rem] text-xs text-danger flex items-start gap-2">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {cnpjError}
                    </div>
                )}
            </div>

            <div className="xl:col-span-8">
                {!cnpjResult && !cnpjLoading && (
                    <div className="bg-slate-900/60 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center p-10 min-h-[400px]">
                        <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                            <Landmark className="text-gray-400" size={32} />
                        </div>
                        <h3 className="font-black text-xl text-white mb-2">Nenhuma consulta feita</h3>
                        <p className="text-sm text-gray-400 text-center max-w-sm">Digite um CNPJ para trazer dados cadastrais reais direto da Receita Federal.</p>
                    </div>
                )}

                {cnpjResult && !cnpjResult.found && (
                    <div className="bg-slate-900/60 rounded-2xl border border-white/10 shadow-sm p-10 flex flex-col items-center justify-center min-h-[300px]">
                        <AlertTriangle className="text-amber-500 mb-4" size={40} />
                        <h3 className="font-black text-xl text-white mb-2">
                            {cnpjResult.error === 'invalid_format' ? 'CNPJ inválido' : 'CNPJ não encontrado na base da Receita'}
                        </h3>
                        <p className="text-sm text-gray-400 text-center max-w-sm">
                            {cnpjResult.error === 'invalid_format'
                                ? 'Verifique os dígitos verificadores e tente novamente.'
                                : 'Confira o número digitado — esse CNPJ não foi localizado na base pública.'}
                        </p>
                    </div>
                )}

                {cnpjResult?.found && cnpjResult.data && (
                    <CnpjResultCard
                        result={cnpjResult}
                        onPromote={onPromoteCnpjResult}
                        isPromoting={promotingKey === `cnpj-${cnpjResult.cnpj}`}
                        promoted={!!promoted[`cnpj-${cnpjResult.cnpj}`]}
                    />
                )}
            </div>
        </div>
    );
}
