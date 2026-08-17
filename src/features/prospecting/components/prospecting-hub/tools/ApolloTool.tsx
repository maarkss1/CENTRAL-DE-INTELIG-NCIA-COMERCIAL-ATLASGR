import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Cpu, Loader2, SlidersHorizontal } from 'lucide-react';
import { api } from '../../../../../lib/api';
import { useBrand } from '../../../../../contexts/BrandContext';
import { ESTADO_OPTIONS, PORTE_OPTIONS, SEGMENTO_OPTIONS, TOTALTRAC_SEGMENTO_OPTIONS } from '../../../../../shared/constants/icp-options';
import type { ProspectCandidate, ProspectCriteria } from '../../../services/prospecting.service';
import { CandidateCard } from '../CandidateCard';
import { NotConfiguredBanner } from './NotConfiguredBanner';
import { getErrorMessage, type PromoteResult } from './shared';

export function ApolloTool({ configured }: { configured: boolean }) {
    const { activeBrand, brandInfo } = useBrand();
    const activeSegments = activeBrand === 'totaltrac' ? TOTALTRAC_SEGMENTO_OPTIONS : SEGMENTO_OPTIONS;

    const [criteria, setCriteria] = useState<ProspectCriteria>({
        segmento: activeSegments[0],
        localizacao: ESTADO_OPTIONS[24],
        estado: ESTADO_OPTIONS[24],
        quantidade: 10,
    });
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apolloError, setApolloError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<ProspectCandidate[]>([]);

    const [promotingKey, setPromotingKey] = useState<string | null>(null);
    const [promoted, setPromoted] = useState<Record<string, PromoteResult>>({});

    const handleSearch = async () => {
        setIsSearching(true);
        setError(null);
        setApolloError(null);
        try {
            const result = await api.post<{ candidates: ProspectCandidate[]; error?: string }>('/api/prospecting/tools/apollo', criteria, { timeoutMs: 30_000 });
            setCandidates(result.candidates);
            setApolloError(result.error || null);
        } catch (err) {
            setError(getErrorMessage(err, 'Falha ao buscar na Apollo'));
        } finally {
            setIsSearching(false);
        }
    };

    const promoteCandidate = async (candidate: ProspectCandidate, idx: number) => {
        const key = `apollo-${idx}`;
        setPromotingKey(key);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: candidate.tradeName,
                segment: candidate.segment,
                size: candidate.size,
                location: candidate.location,
                source: `${brandInfo.name} — Ferramenta Apollo.io`,
                autoEnrich: false,
                linkedin: candidate.linkedinUrl,
                phone: candidate.phone,
                website: candidate.website,
                decisionMakers: candidate.decisionMakers,
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
            <div className="xl:col-span-4 bg-surface p-6 rounded-2xl border border-line shadow-sm space-y-4 max-h-[800px] overflow-y-auto">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
                        <Building2 size={18} />
                    </div>
                    <h2 className="font-black text-lg text-ink">Apollo.io</h2>
                </div>
                <p className="text-xs text-ink-2">Busca só na Apollo Organization Search — sem Google Places, sem OpenStreetMap.</p>

                {!configured && <NotConfiguredBanner envVar="APOLLO_API_KEY" />}

                <div>
                    <label htmlFor="ap-segmento" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Segmento (ICP)</label>
                    <input
                        id="ap-segmento"
                        type="text"
                        list="ap-segmento-suggestions"
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        value={criteria.segmento}
                        onChange={(e) => setCriteria({ ...criteria, segmento: e.target.value })}
                    />
                    <datalist id="ap-segmento-suggestions">
                        {activeSegments.map((opt) => <option key={opt} value={opt} />)}
                    </datalist>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label htmlFor="ap-estado" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Estado</label>
                        <input
                            id="ap-estado"
                            type="text"
                            list="ap-estado-suggestions"
                            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                            value={criteria.estado || ''}
                            onChange={(e) => {
                                const estado = e.target.value;
                                setCriteria({ ...criteria, estado, localizacao: criteria.cidade ? `${criteria.cidade}, ${estado}` : estado });
                            }}
                        />
                        <datalist id="ap-estado-suggestions">
                            {ESTADO_OPTIONS.map((uf) => <option key={uf} value={uf} />)}
                        </datalist>
                    </div>
                    <div>
                        <label htmlFor="ap-cidade" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Cidade (opcional)</label>
                        <input
                            id="ap-cidade"
                            type="text"
                            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                            value={criteria.cidade || ''}
                            onChange={(e) => {
                                const cidade = e.target.value;
                                setCriteria({ ...criteria, cidade, localizacao: cidade && criteria.estado ? `${cidade}, ${criteria.estado}` : criteria.estado || '' });
                            }}
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="ap-quantidade" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Quantidade</label>
                    <input
                        id="ap-quantidade"
                        type="number"
                        min={1}
                        max={100}
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        value={criteria.quantidade}
                        onChange={(e) => setCriteria({ ...criteria, quantidade: Number(e.target.value) || 10 })}
                    />
                </div>

                <button
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center justify-between w-full text-[10px] tracking-wider font-bold uppercase text-ink-2 hover:text-brand transition-colors pt-1"
                >
                    <span className="flex items-center gap-1.5"><SlidersHorizontal size={12} /> Filtros Avançados</span>
                    {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showAdvanced && (
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="ap-porte" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Porte (nº de funcionários)</label>
                            <select
                                id="ap-porte"
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                value={criteria.porte || ''}
                                onChange={(e) => setCriteria({ ...criteria, porte: e.target.value || undefined })}
                            >
                                {PORTE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="ap-palavras" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Palavras-chave adicionais</label>
                            <input
                                id="ap-palavras"
                                type="text"
                                value={criteria.palavrasChave || ''}
                                onChange={(e) => setCriteria({ ...criteria, palavrasChave: e.target.value || undefined })}
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                            />
                        </div>
                    </div>
                )}

                <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="w-full bg-brand text-white py-3.5 rounded-xl font-bold hover:bg-[#E04B12] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                >
                    {isSearching ? (<><Loader2 className="animate-spin" size={18} /> Buscando...</>) : (<><Cpu size={18} /> Buscar na Apollo</>)}
                </button>
                {error && <p className="text-xs text-danger">{error}</p>}
                {apolloError && <p className="text-xs text-warn">{apolloError}</p>}
            </div>

            <div className="xl:col-span-8 space-y-4">
                {candidates.length === 0 && !isSearching && (
                    <div className="bg-surface p-8 rounded-2xl border border-dashed border-line text-center text-ink-2 text-sm">
                        Nenhuma busca feita ainda — os resultados aparecem aqui.
                    </div>
                )}
                {candidates.map((candidate, idx) => {
                    const key = `apollo-${idx}`;
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
