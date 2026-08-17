import { useState } from 'react';
import { Cpu, Loader2, MapPin } from 'lucide-react';
import { api } from '../../../../../lib/api';
import { useBrand } from '../../../../../contexts/BrandContext';
import { ESTADO_OPTIONS, SEGMENTO_OPTIONS, TOTALTRAC_SEGMENTO_OPTIONS } from '../../../../../shared/constants/icp-options';
import type { ProspectCandidate } from '../../../services/prospecting.service';
import { CandidateCard } from '../CandidateCard';
import { NotConfiguredBanner } from './NotConfiguredBanner';
import { getErrorMessage, type PromoteResult } from './shared';

interface GooglePlacesCriteria {
    segmento: string;
    estado: string;
    cidade: string;
    nomeEmpresa: string;
    quantidade: number;
}

export function GooglePlacesTool({ configured }: { configured: boolean }) {
    const { activeBrand, brandInfo } = useBrand();
    const activeSegments = activeBrand === 'totaltrac' ? TOTALTRAC_SEGMENTO_OPTIONS : SEGMENTO_OPTIONS;

    const [criteria, setCriteria] = useState<GooglePlacesCriteria>({
        segmento: activeSegments[0],
        estado: ESTADO_OPTIONS[24], // São Paulo
        cidade: '',
        nomeEmpresa: '',
        quantidade: 10,
    });
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<ProspectCandidate[]>([]);

    const [promotingKey, setPromotingKey] = useState<string | null>(null);
    const [promoted, setPromoted] = useState<Record<string, PromoteResult>>({});

    const handleSearch = async () => {
        setIsSearching(true);
        setError(null);
        try {
            const localizacao = criteria.cidade ? `${criteria.cidade}, ${criteria.estado}` : criteria.estado;
            const result = await api.post<{ candidates: ProspectCandidate[] }>('/api/prospecting/tools/google-places', {
                segmento: criteria.segmento,
                estado: criteria.estado || undefined,
                cidade: criteria.cidade || undefined,
                localizacao,
                nomeEmpresa: criteria.nomeEmpresa || undefined,
                quantidade: criteria.quantidade,
            }, { timeoutMs: 30_000 });
            setCandidates(result.candidates);
        } catch (err) {
            setError(getErrorMessage(err, 'Falha ao buscar no Google Places'));
        } finally {
            setIsSearching(false);
        }
    };

    const promoteCandidate = async (candidate: ProspectCandidate, idx: number) => {
        const key = `google-places-${idx}`;
        setPromotingKey(key);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: candidate.tradeName,
                segment: candidate.segment,
                size: candidate.size,
                location: candidate.location,
                source: `${brandInfo.name} — Ferramenta Google Places`,
                autoEnrich: false,
                website: candidate.website,
            });
            setPromoted((prev) => ({ ...prev, [key]: result }));
        } catch (err) {
            setError(getErrorMessage(err, 'Falha ao adicionar ao CRM'));
        } finally {
            setPromotingKey(null);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-4 bg-surface p-6 rounded-2xl border border-line shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
                        <MapPin size={18} />
                    </div>
                    <h2 className="font-black text-lg text-ink">Google Places</h2>
                </div>
                <p className="text-xs text-ink-2">Busca só no Google Places (New) Text Search — sem Apollo, sem OpenStreetMap.</p>

                {!configured && <NotConfiguredBanner envVar="GOOGLE_MAPS_API_KEY" />}

                <div>
                    <label htmlFor="gp-segmento" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Categoria / Segmento</label>
                    <input
                        id="gp-segmento"
                        type="text"
                        list="gp-segmento-suggestions"
                        placeholder="Ex: Transportadora, Academia, Restaurante..."
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        value={criteria.segmento}
                        onChange={(e) => setCriteria({ ...criteria, segmento: e.target.value })}
                    />
                    <datalist id="gp-segmento-suggestions">
                        {activeSegments.map((opt) => <option key={opt} value={opt} />)}
                    </datalist>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label htmlFor="gp-estado" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Estado</label>
                        <input
                            id="gp-estado"
                            type="text"
                            list="gp-estado-suggestions"
                            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                            value={criteria.estado}
                            onChange={(e) => setCriteria({ ...criteria, estado: e.target.value })}
                        />
                        <datalist id="gp-estado-suggestions">
                            {ESTADO_OPTIONS.map((uf) => <option key={uf} value={uf} />)}
                        </datalist>
                    </div>
                    <div>
                        <label htmlFor="gp-cidade" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Cidade (opcional)</label>
                        <input
                            id="gp-cidade"
                            type="text"
                            placeholder="Ex: Campinas"
                            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                            value={criteria.cidade}
                            onChange={(e) => setCriteria({ ...criteria, cidade: e.target.value })}
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="gp-nome" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Nome da empresa (opcional)</label>
                    <input
                        id="gp-nome"
                        type="text"
                        placeholder="Busca direta por nome"
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        value={criteria.nomeEmpresa}
                        onChange={(e) => setCriteria({ ...criteria, nomeEmpresa: e.target.value })}
                    />
                </div>

                <div>
                    <label htmlFor="gp-quantidade" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Quantidade</label>
                    <input
                        id="gp-quantidade"
                        type="number"
                        min={1}
                        max={20}
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        value={criteria.quantidade}
                        onChange={(e) => setCriteria({ ...criteria, quantidade: Number(e.target.value) || 10 })}
                    />
                </div>

                <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="w-full bg-brand text-white py-3.5 rounded-xl font-bold hover:bg-[#E04B12] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                >
                    {isSearching ? (<><Loader2 className="animate-spin" size={18} /> Buscando...</>) : (<><Cpu size={18} /> Buscar no Google Places</>)}
                </button>
                {error && <p className="text-xs text-danger">{error}</p>}
            </div>

            <div className="xl:col-span-8 space-y-4">
                {candidates.length === 0 && !isSearching && (
                    <div className="bg-surface p-8 rounded-2xl border border-dashed border-line text-center text-ink-2 text-sm">
                        Nenhuma busca feita ainda — os resultados aparecem aqui.
                    </div>
                )}
                {candidates.map((candidate, idx) => {
                    const key = `google-places-${idx}`;
                    return (
                        <CandidateCard
                            key={key}
                            candidate={candidate}
                            onPromote={() => promoteCandidate(candidate, idx)}
                            isPromoting={promotingKey === key}
                            promoted={!!promoted[key]}
                            promotedResult={promoted[key]}
                        />
                    );
                })}
            </div>
        </div>
    );
}
