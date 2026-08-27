import {
    ShieldCheck, CheckCircle2, Building2, Users, TrendingUp, MapPin, UserPlus, Loader2, Truck,
} from 'lucide-react';
import type { CnpjLookupResult } from '../../services/enrichment.service';
import type { RntrcRiskTier } from '../../../market-intelligence/server/rntrcTerritorial';
import { Badge } from '../../../../components/ui/Badge';
import { InfoTile } from './InfoTile';

const number = new Intl.NumberFormat('pt-BR');

// MI-014 (dossiê CPI, DEC-15 opção A): tiers relativos de concentração de transportadoras RNTRC
// na UF (ver `rntrcRiskByUf`) — não usa danger/warning porque não é literalmente um alerta de
// risco (a Sinesp/roubo-furto que fundamentaria isso não roda ao vivo hoje, ver o comentário em
// `rntrcTerritorial.ts`), é intensidade de mercado.
const RNTRC_TIER_LABEL: Record<RntrcRiskTier, string> = {
    ALTA: 'Concentração alta de transportadoras RNTRC',
    MEDIA: 'Concentração média de transportadoras RNTRC',
    BAIXA: 'Concentração baixa de transportadoras RNTRC',
};
const RNTRC_TIER_VARIANT: Record<RntrcRiskTier, 'info' | 'default' | 'outline'> = {
    ALTA: 'info',
    MEDIA: 'default',
    BAIXA: 'outline',
};

export function CnpjResultCard({
    result, onPromote, isPromoting, promoted,
}: {
    result: CnpjLookupResult; onPromote: () => void; isPromoting: boolean; promoted: boolean;
}) {
    const d = result.data!;
    const isActive = d.situacaoCadastral?.toUpperCase() === 'ATIVA';

    return (
        <div className="bg-surface rounded-2xl border border-line shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-black text-2xl text-ink">{d.tradeName}</h3>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isActive ? 'bg-success/15 text-success-active dark:text-success' : 'bg-danger/15 text-danger-active dark:text-danger'}`}>
                            <ShieldCheck size={10} /> {d.situacaoCadastral}
                        </span>
                    </div>
                    <p className="text-sm text-ink-2">{d.legalName} · {result.cnpj}</p>
                </div>
                <span className="flex items-center gap-1.5 bg-info/10 text-info-active dark:text-info px-3 py-1.5 rounded-full text-xs font-bold">
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
                <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-1">Atividade Principal (CNAE {d.cnae})</p>
                <p className="text-sm text-ink-2">{d.cnaeDescription}</p>
            </div>

            <div>
                <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">Endereço</p>
                <p className="text-sm text-ink-2">{d.address}, {d.city} - {d.state}, {d.zipCode}</p>
            </div>

            {result.marketRisk && (
                <div>
                    <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2 flex items-center gap-1.5">
                        <Truck size={12} /> Sinal territorial RNTRC (ANTT) — {result.marketRisk.uf ?? d.state}
                    </p>
                    {result.marketRisk.available ? (
                        <div className="space-y-1.5">
                            <Badge variant={RNTRC_TIER_VARIANT[result.marketRisk.tier!]}>
                                {RNTRC_TIER_LABEL[result.marketRisk.tier!]}
                            </Badge>
                            <p className="text-sm text-ink-2">
                                {number.format(result.marketRisk.transporters!)} transportadoras registradas no RNTRC em {result.marketRisk.uf}
                                {' '}· percentil {result.marketRisk.percentile} entre as UFs do Brasil
                                {result.marketRisk.metadata?.competencia ? ` · competência ${result.marketRisk.metadata.competencia}` : ''}.
                            </p>
                            <p className="text-xs text-ink-2">
                                Indicador de intensidade do mercado de transporte rodoviário de cargas na UF (fonte ANTT, mesmo dado já publicado em Market Intelligence) — não é uma medida de sinistralidade (roubo/furto).
                            </p>
                        </div>
                    ) : (
                        <p className="text-sm text-ink-2">RNTRC territorial NÃO DISPONÍVEL — {result.marketRisk.reason}</p>
                    )}
                </div>
            )}

            {d.qsa.length > 0 && (
                <div>
                    <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">Quadro Societário</p>
                    <div className="flex flex-wrap gap-2">
                        {d.qsa.map((s, i) => (
                            <span key={i} className="bg-surface-2 border border-line rounded-full px-3 py-1 text-xs text-ink-2">
                                {s.nome} <span className="text-ink-2">· {s.qualificacao}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {d.phones.length > 0 && (
                <div>
                    <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">Telefones (Receita Federal)</p>
                    <p className="text-sm text-ink-2">{d.phones.join(' · ')}</p>
                </div>
            )}

            <div className="pt-4 border-t border-line flex justify-end">
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
