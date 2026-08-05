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
            <div className="xl:col-span-4 bg-surface p-6 sm:p-8 rounded-2xl border border-line shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-atlas-orange/10 flex items-center justify-center text-atlas-orange">
                        <Landmark size={18} />
                    </div>
                    <h2 className="font-black text-xl text-ink">🏛️ Busca Direta</h2>
                </div>
                <p className="text-xs text-ink-2 mb-4">Busque via CNPJ na Receita Federal ou crie uma empresa pelo Nome para prospecção.</p>
                <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">CNPJ ou Nome da Empresa</label>
                <input
                    className="w-full p-3 bg-surface-2 rounded-[2rem] border border-line outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-ink mb-4"
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
                            className="w-full bg-surface-2 text-ink py-3.5 rounded-[2rem] font-bold hover:bg-atlas-dark hover:text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2"
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
                    <div className="bg-surface rounded-2xl border border-dashed border-line flex flex-col items-center justify-center p-10 min-h-[400px]">
                        <div className="bg-surface-2 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                            <Landmark className="text-ink-2" size={32} />
                        </div>
                        <h3 className="font-black text-xl text-ink mb-2">Nenhuma consulta feita</h3>
                        <p className="text-sm text-ink-2 text-center max-w-sm">Digite um CNPJ para trazer dados cadastrais reais direto da Receita Federal.</p>
                    </div>
                )}

                {cnpjResult && !cnpjResult.found && (() => {
                    // CORREÇÃO: erro de rede/timeout da Receita era mostrado como "CNPJ não existe"
                    // — um vendedor podia descartar um lead válido por causa de uma falha transitória
                    // que nada tem a ver com o CNPJ em si.
                    const isTransient = cnpjResult.error === 'timeout'
                        || cnpjResult.error === 'network_error'
                        || (typeof cnpjResult.error === 'string' && cnpjResult.error.startsWith('upstream_error_'));
                    const title = cnpjResult.error === 'invalid_format'
                        ? 'CNPJ inválido'
                        : isTransient
                            ? 'Falha temporária ao consultar a Receita'
                            : 'CNPJ não encontrado na base da Receita';
                    const message = cnpjResult.error === 'invalid_format'
                        ? 'Verifique os dígitos verificadores e tente novamente.'
                        : isTransient
                            ? 'A consulta à Receita Federal falhou por instabilidade de rede — não significa que o CNPJ não exista. Tente novamente em alguns instantes.'
                            : 'Confira o número digitado — esse CNPJ não foi localizado na base pública.';
                    return (
                        <div className="bg-surface rounded-2xl border border-line shadow-sm p-10 flex flex-col items-center justify-center min-h-[300px]">
                            <AlertTriangle className="text-amber-500 mb-4" size={40} />
                            <h3 className="font-black text-xl text-ink mb-2">{title}</h3>
                            <p className="text-sm text-ink-2 text-center max-w-sm">{message}</p>
                        </div>
                    );
                })()}

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
