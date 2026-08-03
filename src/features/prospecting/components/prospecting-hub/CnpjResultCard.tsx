import {
    ShieldCheck, CheckCircle2, Building2, Users, TrendingUp, MapPin, UserPlus, Loader2,
} from 'lucide-react';
import type { CnpjLookupResult } from '../../services/enrichment.service';
import { InfoTile } from './InfoTile';

export function CnpjResultCard({
    result, onPromote, isPromoting, promoted,
}: {
    result: CnpjLookupResult; onPromote: () => void; isPromoting: boolean; promoted: boolean;
}) {
    const d = result.data!;
    const isActive = d.situacaoCadastral?.toUpperCase() === 'ATIVA';

    return (
        <div className="bg-slate-900/60 rounded-2xl border border-white/10 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-black text-2xl text-white">{d.tradeName}</h3>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isActive ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                            <ShieldCheck size={10} /> {d.situacaoCadastral}
                        </span>
                    </div>
                    <p className="text-sm text-gray-400">{d.legalName} · {result.cnpj}</p>
                </div>
                <span className="flex items-center gap-1.5 bg-info/10 text-info px-3 py-1.5 rounded-full text-xs font-bold">
                    <CheckCircle2 size={12} /> ✅ Dados oficiais — Receita Federal
                </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoTile icon={Building2} label="Natureza Jurídica" value={d.naturezaJuridica} />
                <InfoTile icon={Users} label="Porte / Funcionários" value={`${d.size} (${d.employeeCountEstimate}+ estimado)`} />
                <InfoTile icon={TrendingUp} label="Capital Social" value={d.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                <InfoTile icon={MapPin} label="Localização" value={`${d.city}, ${d.state}`} />
            </div>

            <div>
                <p className="text-[10px] tracking-wider font-bold uppercase text-gray-400 mb-1">Atividade Principal (CNAE {d.cnae})</p>
                <p className="text-sm text-gray-300">{d.cnaeDescription}</p>
            </div>

            <div>
                <p className="text-[10px] tracking-wider font-bold uppercase text-gray-400 mb-2">Endereço</p>
                <p className="text-sm text-gray-300">{d.address}, {d.city} - {d.state}, {d.zipCode}</p>
            </div>

            {d.qsa.length > 0 && (
                <div>
                    <p className="text-[10px] tracking-wider font-bold uppercase text-gray-400 mb-2">Quadro Societário</p>
                    <div className="flex flex-wrap gap-2">
                        {d.qsa.map((s, i) => (
                            <span key={i} className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-gray-300">
                                {s.nome} <span className="text-gray-400">· {s.qualificacao}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {d.phones.length > 0 && (
                <div>
                    <p className="text-[10px] tracking-wider font-bold uppercase text-gray-400 mb-2">Telefones (Receita Federal)</p>
                    <p className="text-sm text-gray-300">{d.phones.join(' · ')}</p>
                </div>
            )}

            <div className="pt-4 border-t border-white/10 flex justify-end">
                {promoted ? (
                    <span className="flex items-center gap-2 text-green-700 font-bold text-sm"><CheckCircle2 size={16} /> ✅ Adicionado ao CRM</span>
                ) : (
                    <button
                        onClick={onPromote}
                        disabled={isPromoting}
                        className="bg-atlas-dark text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-black transition-colors flex items-center gap-2 disabled:opacity-60"
                    >
                        {isPromoting ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                        {isPromoting ? '⏳ Adicionando...' : '➕ Adicionar ao CRM como Lead'}
                    </button>
                )}
            </div>
        </div>
    );
}
