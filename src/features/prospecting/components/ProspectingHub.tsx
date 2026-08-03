import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Search, Loader2, AlertTriangle, Cpu, Database, Globe, CheckCircle2, Landmark, UserPlus, Sparkles,
    SlidersHorizontal, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../../../lib/api';
import type { CnpjLookupResult, FitScoreResult } from '../services/enrichment.service';
import type { ProspectCandidate, ProspectCriteria, DiscoverResult } from '../services/prospecting.service';
import {
    SEGMENTO_OPTIONS, TOTALTRAC_SEGMENTO_OPTIONS, QUANTIDADE_OPTIONS, PORTE_OPTIONS, ESTADO_OPTIONS, TECNOLOGIA_OPTIONS,
} from '../../../shared/constants/icp-options';
import { useBrand } from '../../../contexts/BrandContext';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { GamificationWidget } from '../../../components/ui/GamificationWidget';
import { CnpjResultCard } from './prospecting-hub/CnpjResultCard';
import { CandidateCard } from './prospecting-hub/CandidateCard';

export { DecisionMakerSearch } from './prospecting-hub/DecisionMakerSearch';

type HubTab = 'cnpj' | 'discovery';

const ufMap: Record<string, string> = {
    'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
    'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
    'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI',
    'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', 'Rondônia': 'RO',
    'Roraima': 'RR', 'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO'
};

const loadingSteps = [
    'Buscando empresas em fontes abertas e Apollo...',
    'Consultando bases públicas (OpenStreetMap e Receita Federal)...',
    'Cruzando dados com heurísticas de mercado...',
    'Calculando Score de Propensão...',
    'Finalizando prospecção...',
];

interface PromoteResult {
    lead: { id: string };
    fit?: FitScoreResult;
    enrichment?: {
        company: {
            googleRating?: number;
            googleReviewsCount?: number;
            observations?: string;
        };
        apolloContacts?: Array<{ name: string; title: string | null; email: string | null; phone?: string | null; linkedin_url?: string | null }>;
    };
}

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

export function ProspectingHub() {
    const { activeBrand, brandInfo } = useBrand();
    const accent = useBrandAccent();
    const [tab, setTab] = useState<HubTab>('cnpj');

    const activeSegments = activeBrand === 'totaltrac' ? TOTALTRAC_SEGMENTO_OPTIONS : SEGMENTO_OPTIONS;

    // --- CNPJ real lookup ---
    const [cnpjInput, setCnpjInput] = useState('');
    const [cnpjLoading, setCnpjLoading] = useState(false);
    const [cnpjResult, setCnpjResult] = useState<CnpjLookupResult | null>(null);
    const [cnpjError, setCnpjError] = useState<string | null>(null);

    // --- discovery via open data, with optional Apollo enrichment ---
    const [criteria, setCriteria] = useState<ProspectCriteria>({
        segmento: activeSegments[0],
        localizacao: ESTADO_OPTIONS[24], // Default SP
        estado: ESTADO_OPTIONS[24], // Default SP
        quantidade: QUANTIDADE_OPTIONS[0],
    });

    useEffect(() => {
        setCriteria(prev => ({
            ...prev,
            segmento: activeSegments[0]
        }));
    }, [activeSegments]);

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [loadingStepIdx, setLoadingStepIdx] = useState(0);
    const [candidates, setCandidates] = useState<ProspectCandidate[]>([]);
    const [discoverError, setDiscoverError] = useState<string | null>(null);
    const [apolloError, setApolloError] = useState<string | null>(null);    const [cities, setCities] = useState<string[]>([]);
    const [isSavingBatch, setIsSavingBatch] = useState(false);

    const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
    const toggleSelectAll = () => {
        if (selectedCandidates.size === filteredCandidates.length) {
            setSelectedCandidates(new Set());
        } else {
            setSelectedCandidates(new Set(filteredCandidates.map(c => c.i)));
        }
    };
    const toggleSelect = (idx: number) => {
        setSelectedCandidates((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };
    const bulkSave = async () => {
        if (selectedCandidates.size === 0 || isSavingBatch) return;
        setIsSavingBatch(true);
        try {
            for (const idx of selectedCandidates) {
                const candidate = candidates[idx];
                const key = `discovery-${idx}`;
                if (!promoted[key]) {
                    const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                        tradeName: candidate.tradeName,
                        legalName: candidate.legalNameGuess,
                        cnpj: candidate.cnpjGuess,
                        segment: candidate.segment,
                        size: candidate.size,
                        location: candidate.location,
                        source: `${brandInfo.name} Prospect List`,
                        autoEnrich: false,
                        linkedin: candidate.linkedinUrl,
                        phone: candidate.phone,
                        website: candidate.website,
                        decisionMakers: candidate.decisionMakers,
                    });
                    setPromoted(prev => ({ ...prev, [key]: result }));
                }
            }
        } catch (error) {
            setDiscoverError(getErrorMessage(error, 'Falha ao salvar lista de leads em massa'));
        } finally {
            setIsSavingBatch(false);
            setSelectedCandidates(new Set());
        }
    };
    const bulkEnrich = async () => {
        // Just call bulkSave but with autoEnrich = true
        if (selectedCandidates.size === 0 || isSavingBatch) return;
        setIsSavingBatch(true);
        try {
            for (const idx of selectedCandidates) {
                const candidate = candidates[idx];
                const key = `discovery-${idx}`;
                if (!promoted[key]) {
                    const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                        tradeName: candidate.tradeName,
                        legalName: candidate.legalNameGuess,
                        cnpj: candidate.cnpjGuess,
                        segment: candidate.segment,
                        size: candidate.size,
                        location: candidate.location,
                        source: `${brandInfo.name} Prospect List (Bulk Enrich)`,
                        autoEnrich: true,
                        linkedin: candidate.linkedinUrl,
                        phone: candidate.phone,
                        website: candidate.website,
                        decisionMakers: candidate.decisionMakers,
                    });
                    setPromoted(prev => ({ ...prev, [key]: result }));
                }
            }
        } catch (error) {
            setDiscoverError(getErrorMessage(error, 'Falha ao enriquecer leads em massa'));
        } finally {
            setIsSavingBatch(false);
            setSelectedCandidates(new Set());
        }
    };


    useEffect(() => {
        if (!criteria.estado) {
            setCities([]);
            setCriteria(prev => ({ ...prev, cidade: undefined, localizacao: '' }));
            return;
        }
        const uf = ufMap[criteria.estado];
        if (uf) {
            fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
                .then(r => r.json())
                .then((data: Array<{ nome: string }>) => setCities(data.map(d => d.nome)))
                .catch(() => setCities([]));
        } else {
            setCities([]);
        }
    }, [criteria.estado]);

    // --- shared: promote-to-CRM state ---
    const [promotingKey, setPromotingKey] = useState<string | null>(null);
    const [promoted, setPromoted] = useState<Record<string, PromoteResult>>({});

    // Batch save leads into list (autoEnrich: false for on-demand enrichment upon viewing)
    const saveAllCandidatesAsList = async () => {
        if (candidates.length === 0 || isSavingBatch) return;
        setIsSavingBatch(true);
        try {
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                const key = `discovery-${i}`;
                if (!promoted[key]) {
                    const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                        tradeName: candidate.tradeName,
                        legalName: candidate.legalNameGuess,
                        cnpj: candidate.cnpjGuess,
                        segment: candidate.segment,
                        size: candidate.size,
                        location: candidate.location,
                        source: `${brandInfo.name} Prospect List`,
                        autoEnrich: false, // salva em lista sem enriquecer; o enriquecimento será feito ao entrar no lead
                        linkedin: candidate.linkedinUrl,
                        phone: candidate.phone,
                        website: candidate.website,
                        decisionMakers: candidate.decisionMakers,
                    });
                    setPromoted(prev => ({ ...prev, [key]: result }));
                }
            }
        } catch (error) {
            setDiscoverError(getErrorMessage(error, 'Falha ao salvar lista de leads'));
        } finally {
            setIsSavingBatch(false);
        }
    };

    // --- quick filter sobre os resultados já carregados ---
    const [resultFilter, setResultFilter] = useState('');
    const filteredCandidates = candidates
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => {
            const q = resultFilter.trim().toLowerCase();
            if (!q) return true;
            return (
                c.tradeName.toLowerCase().includes(q) ||
                c.segment.toLowerCase().includes(q) ||
                c.location.toLowerCase().includes(q) ||
                c.size.toLowerCase().includes(q)
            );
        });

    const exportToExcel = async () => {
        if (candidates.length === 0) return;
        const XLSX = await import('xlsx');
        const data = candidates.map(c => ({
            'Nome Fantasia': c.tradeName,
            'Razão Social': c.legalNameGuess || c.tradeName,
            'CNPJ': c.cnpjGuess || '',
            'Segmento': c.segment,
            'Porte': c.size,
            'Localização': c.location,
            'Website': c.website || '',
            'Emails': c.emails ? c.emails.join(', ') : '',
            'Telefones': c.phone || '',
            'LinkedIn': c.linkedinUrl || '',
            'Decisores': c.apolloContacts ? c.apolloContacts.map((d) => `${d.name} (${d.title}) - ${d.email || ''}`).join(' | ') : ''
        }));
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Prospects');
        XLSX.writeFile(workbook, `${brandInfo.name}_Prospects_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleCnpjLookup = async () => {
        setCnpjLoading(true);
        setCnpjError(null);
        setCnpjResult(null);
        try {
            const result = await api.post<CnpjLookupResult>('/api/prospecting/enrich-cnpj', { cnpj: cnpjInput });
            setCnpjResult(result);
        } catch (error) {
            setCnpjError(getErrorMessage(error, 'Falha ao consultar CNPJ'));
        } finally {
            setCnpjLoading(false);
        }
    };

    const handleDiscover = async () => {
        setIsSearching(true);
        setDiscoverError(null);
        setApolloError(null);
        setCandidates([]);
        setLoadingStepIdx(0);
        const interval = setInterval(() => {
            setLoadingStepIdx((prev) => Math.min(prev + 1, loadingSteps.length - 1));
        }, 800);
        try {
            const result = await api.post<DiscoverResult>('/api/prospecting/discover', criteria);
            setCandidates(result.candidates);
            setApolloError(result.apolloError || null);
        } catch (error) {
            setDiscoverError(getErrorMessage(error, 'Falha ao buscar leads'));
        } finally {
            clearInterval(interval);
            setIsSearching(false);
        }
    };



    const promoteCnpjResult = async () => {
        if (!cnpjResult?.found || !cnpjResult.data) return;
        const key = `cnpj-${cnpjResult.cnpj}`;
        setPromotingKey(key);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: cnpjResult.data.tradeName,
                legalName: cnpjResult.data.legalName,
                cnpj: cnpjResult.cnpj,
                segment: cnpjResult.data.cnaeDescription,
                size: cnpjResult.data.size,
                city: cnpjResult.data.city,
                state: cnpjResult.data.state,
                source: 'Busca por CNPJ (Receita Federal)',
                autoEnrich: false, // Salvar como lead cru para economizar créditos; enriquecimento ocorre sob demanda no CRM
            });
            setPromoted((prev) => ({ ...prev, [key]: result }));
        } catch (error) {
            setCnpjError(getErrorMessage(error, 'Falha ao adicionar ao CRM'));
        } finally {
            setPromotingKey(null);
        }
    };

    const promoteCandidate = async (candidate: ProspectCandidate, idx: number) => {
        const key = `discovery-${idx}`;
        setPromotingKey(key);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: candidate.tradeName,
                legalName: candidate.legalNameGuess,
                cnpj: candidate.cnpjGuess,
                segment: candidate.segment,
                size: candidate.size,
                location: candidate.location,
                source: `${brandInfo.name} Prospect (OpenStreetMap / Apollo opcional)`,
                autoEnrich: false, // Salvar como lead cru para economizar créditos
                linkedin: candidate.linkedinUrl,
                phone: candidate.phone,
                website: candidate.website,
            });
            setPromoted((prev) => ({ ...prev, [key]: result }));
        } catch (error) {
            setDiscoverError(getErrorMessage(error, 'Falha ao adicionar ao CRM'));
        } finally {
            setPromotingKey(null);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-6 sm:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 space-y-4">
                    <h1 className="text-4xl font-black tracking-tight text-white">
                        {brandInfo.name} <span className={`text-transparent bg-clip-text bg-gradient-to-r ${accent.gradient}`}>Prospect</span> <Sparkles className={`inline-block ${accent.text} -mt-1 ml-1`} size={28} />
                    </h1>
                    <p className="text-gray-400 text-sm font-medium">Motor de enriquecimento autônomo com IA para capturar leads corporativos de altíssimo nível.</p>
                    <GamificationWidget />
                </motion.div>

                <div className="flex gap-3 bg-slate-900/60 backdrop-blur-xl p-2 rounded-2xl border border-white shadow-sm w-fit relative z-10">
                    <button
                        onClick={() => setTab('cnpj')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-[2rem] font-bold text-sm transition-all duration-300 ${tab === 'cnpj' ? 'bg-gradient-to-br from-atlas-dark to-black text-white shadow-lg shadow-black/10 scale-100' : 'text-gray-400 hover:bg-white/10 hover:shadow-sm scale-95 hover:scale-100'}`}
                    >
                        <Landmark size={18} /> Busca Direta (CNPJ/Nome)
                    </button>
                    <button
                        onClick={() => setTab('discovery')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${tab === 'discovery' ? 'bg-gradient-to-br from-atlas-orange to-[#ff6b3d] text-white shadow-lg shadow-atlas-orange/20 scale-100' : 'text-gray-400 hover:bg-white/10 hover:shadow-sm scale-95 hover:scale-100'}`}
                    >
                        <Database size={18} /> Radar Discovery (Fontes abertas)
                    </button>
                </div>

                {tab === 'cnpj' && (
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
                                onKeyDown={(e) => e.key === 'Enter' && handleCnpjLookup()}
                            />
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={handleCnpjLookup}
                                    disabled={cnpjLoading || !cnpjInput}
                                    className="w-full bg-atlas-orange text-white py-3.5 rounded-[2rem] font-bold hover:bg-[#E04B12] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-atlas-orange/20"
                                >
                                    {cnpjLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                                    {cnpjLoading ? '⏳ Consultando...' : '🔎 Consultar CNPJ'}
                                </button>

                                {cnpjInput && !/[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}/.test(cnpjInput) && (
                                    <button
                                        onClick={() => {
                                            setCriteria({ ...criteria, nomeEmpresa: cnpjInput, quantidade: 5 });
                                            setTab('discovery');
                                            setTimeout(() => {
                                                const btn = document.getElementById('btn-discover');
                                                if (btn) btn.click();
                                            }, 100);
                                        }}
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
                                    onPromote={promoteCnpjResult}
                                    isPromoting={promotingKey === `cnpj-${cnpjResult.cnpj}`}
                                    promoted={!!promoted[`cnpj-${cnpjResult.cnpj}`]}
                                />
                            )}
                        </div>
                    </div>
                )}

                {tab === 'discovery' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                        <div className="xl:col-span-4 bg-slate-900/60 p-6 sm:p-8 rounded-2xl border border-white/10 shadow-sm relative overflow-hidden flex flex-col h-full max-h-[800px]">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-atlas-orange opacity-5 transform rotate-45 translate-x-20 -translate-y-20" />
                            <div className="flex items-center gap-2 mb-6 relative z-10">
                                <div className="w-8 h-8 rounded-lg bg-atlas-orange/10 flex items-center justify-center text-atlas-orange">
                                    <Database size={18} />
                                </div>
                                <h2 className="font-black text-xl text-white">🗺️ Motor de Busca Turbo</h2>
                            </div>
                            <p className="text-xs text-gray-400 mb-3 relative z-10">Busca real via Google Maps, OpenStreetMap e Apollo quando as integrações estão habilitadas.</p>



                            <div className="space-y-4 relative z-10 flex-1 overflow-y-auto pr-2">
                                <div>
                                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Segmento (ICP)</label>
                                    <input
                                        type="text"
                                        list="segmento-suggestions"
                                        placeholder="Ex: Transportadora / Frotista, Logística..."
                                        className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white placeholder-gray-500"
                                        value={criteria.segmento || ''}
                                        onChange={(e) => setCriteria({ ...criteria, segmento: e.target.value })}
                                    />
                                    <datalist id="segmento-suggestions">
                                        {activeSegments.map((opt) => <option key={opt} value={opt} />)}
                                    </datalist>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Estado</label>
                                        <input
                                            type="text"
                                            list="estado-suggestions"
                                            placeholder="Ex: São Paulo, SP, Sul..."
                                            className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white placeholder-gray-500"
                                            value={criteria.estado || ''}
                                            onChange={(e) => {
                                                const estado = e.target.value;
                                                setCriteria({
                                                    ...criteria,
                                                    estado,
                                                    localizacao: criteria.cidade ? `${criteria.cidade}, ${estado}` : estado || criteria.localizacao
                                                });
                                            }}
                                        />
                                        <datalist id="estado-suggestions">
                                            {ESTADO_OPTIONS.map((uf) => <option key={uf} value={uf} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Cidade (opcional)</label>
                                        <input
                                            type="text"
                                            list="cidade-suggestions"
                                            placeholder="Ex: Campinas, Santos..."
                                            className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white placeholder-gray-500"
                                            value={criteria.cidade || ''}
                                            onChange={(e) => {
                                                const cidade = e.target.value;
                                                setCriteria({
                                                    ...criteria,
                                                    cidade,
                                                    localizacao: cidade ? (criteria.estado ? `${cidade}, ${criteria.estado}` : cidade) : criteria.estado || ''
                                                });
                                            }}
                                        />
                                        {cities.length > 0 && (
                                            <datalist id="cidade-suggestions">
                                                {cities.map((city) => <option key={city} value={city} />)}
                                            </datalist>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Pesquisar por nome ou empresa</label>
                                    <div className="relative">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                        <input
                                            type="search"
                                            placeholder="Ex: Transportadora ABC, armazém..."
                                            value={criteria.nomeEmpresa || ''}
                                            onChange={(e) => setCriteria({ ...criteria, nomeEmpresa: e.target.value || undefined })}
                                            onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
                                            className="w-full py-3 pl-9 pr-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">Refina Google Maps, Apollo e OpenStreetMap pelo nome informado.</p>
                                </div>

                                <div>
                                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Quantidade de Leads</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={500}
                                        placeholder="Ex: 10, 25, 50..."
                                        className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white placeholder-gray-500"
                                        value={criteria.quantidade ?? 10}
                                        onChange={(e) => setCriteria({ ...criteria, quantidade: Number(e.target.value) || 10 })}
                                    />
                                </div>

                                <button
                                    onClick={() => setShowAdvanced((v) => !v)}
                                    className="flex items-center justify-between w-full text-[10px] tracking-wider font-bold uppercase text-gray-400 hover:text-atlas-orange transition-colors pt-2"
                                >
                                    <span className="flex items-center gap-1.5"><SlidersHorizontal size={12} /> Filtros Avançados (Apollo.io)</span>
                                    {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {showAdvanced && (
                                    <div className="space-y-4 pt-1">
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Porte (nº de funcionários)</label>
                                            <select
                                                className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                                value={criteria.porte || ''}
                                                onChange={(e) => setCriteria({ ...criteria, porte: e.target.value || undefined })}
                                            >
                                                {PORTE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Faturamento Anual Estimado (USD)</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    placeholder="Mínimo"
                                                    value={criteria.faturamentoMin ?? ''}
                                                    onChange={(e) => setCriteria({ ...criteria, faturamentoMin: e.target.value ? Number(e.target.value) : undefined })}
                                                    className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Máximo"
                                                    value={criteria.faturamentoMax ?? ''}
                                                    onChange={(e) => setCriteria({ ...criteria, faturamentoMax: e.target.value ? Number(e.target.value) : undefined })}
                                                    className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">Dado da Apollo é normalizado em dólar, independente do mercado.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Palavras-chave adicionais</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: refrigerated, cargo, fleet"
                                                value={criteria.palavrasChave || ''}
                                                onChange={(e) => setCriteria({ ...criteria, palavrasChave: e.target.value || undefined })}
                                                className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                            />
                                            <p className="text-[10px] text-gray-400 mt-1">Separadas por vírgula — somam ao segmento na busca da Apollo.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Ano de Fundação (Mín e Máx)</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    placeholder="De"
                                                    value={criteria.anoFundacaoMin ?? ''}
                                                    onChange={(e) => setCriteria({ ...criteria, anoFundacaoMin: e.target.value ? Number(e.target.value) : undefined })}
                                                    className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Até"
                                                    value={criteria.anoFundacaoMax ?? ''}
                                                    onChange={(e) => setCriteria({ ...criteria, anoFundacaoMax: e.target.value ? Number(e.target.value) : undefined })}
                                                    className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">A Apollo não filtra por ano nativamente — buscamos mais candidatos e filtramos localmente por fundação real.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Tecnologias Utilizadas</label>
                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-white/10">
                                                {TECNOLOGIA_OPTIONS.map((opt) => {
                                                    const selected = (criteria.tecnologias || '').split(',').filter(Boolean).includes(opt.value);
                                                    return (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => {
                                                                const current = (criteria.tecnologias || '').split(',').filter(Boolean);
                                                                const next = selected ? current.filter((v) => v !== opt.value) : [...current, opt.value];
                                                                setCriteria({ ...criteria, tecnologias: next.length ? next.join(',') : undefined });
                                                            }}
                                                            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${selected ? 'bg-atlas-orange border-atlas-orange text-white' : 'bg-slate-900/60 border-white/10 text-gray-400 hover:border-atlas-orange/40'}`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">Lista curada e validada contra a API — a Apollo só filtra por identificador interno, não por nome livre.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Excluir Tecnologias</label>
                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-white/10">
                                                {TECNOLOGIA_OPTIONS.map((opt) => {
                                                    const selected = (criteria.tecnologiasExcluir || '').split(',').filter(Boolean).includes(opt.value);
                                                    return (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => {
                                                                const current = (criteria.tecnologiasExcluir || '').split(',').filter(Boolean);
                                                                const next = selected ? current.filter((v) => v !== opt.value) : [...current, opt.value];
                                                                setCriteria({ ...criteria, tecnologiasExcluir: next.length ? next.join(',') : undefined });
                                                            }}
                                                            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${selected ? 'bg-danger border-danger text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:border-danger/50'}`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">Útil para descartar empresas que já usam a solução de um concorrente, por exemplo.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Excluir Localização</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: São Paulo, Minas Gerais"
                                                value={criteria.localizacaoExcluir || ''}
                                                onChange={(e) => setCriteria({ ...criteria, localizacaoExcluir: e.target.value || undefined })}
                                                className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                            />
                                            <p className="text-[10px] text-gray-400 mt-1">Cidades/estados a descartar, separados por vírgula.</p>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 pt-1">
                                            <input
                                                type="checkbox"
                                                checked={!!criteria.apenasCapitalAberto}
                                                onChange={(e) => setCriteria({ ...criteria, apenasCapitalAberto: e.target.checked || undefined })}
                                                className="rounded border-white/20 text-atlas-orange focus:ring-atlas-orange"
                                            />
                                            Somente empresas de capital aberto (B3/bolsa)
                                        </label>
                                    </div>
                                )}
                            </div>

                            <div className="pt-6 mt-2 relative z-10 border-t border-white/10">
                                <button
                                    id="btn-discover"
                                    onClick={handleDiscover}
                                    disabled={isSearching}
                                    className="w-full bg-atlas-orange text-white py-4 rounded-xl font-bold hover:bg-[#E04B12] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-atlas-orange/20"
                                >
                                    {isSearching ? (
                                        <><Loader2 className="animate-spin" size={20} /> <span>⏳ Buscando...</span></>
                                    ) : (
                                        <><Cpu size={20} /> <span>🚀 Encontrar Leads Ideais</span></>
                                    )}
                                </button>
                                {discoverError && <p className="text-xs text-red-600 mt-2">{discoverError}</p>}
                            </div>
                        </div>

                        <div className="xl:col-span-8 flex flex-col h-full">
                            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                                <h2 className="font-black text-2xl text-white">✨ Resultados</h2>
                                {candidates.length > 0 && (
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={saveAllCandidatesAsList}
                                            disabled={isSavingBatch}
                                            className="bg-atlas-orange text-white px-4 py-2 rounded-[2rem] text-xs font-bold hover:bg-orange-600 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <UserPlus size={14} /> {isSavingBatch ? 'Salvando Lista...' : 'Salvar Lista de Leads'}
                                        </button>
                                        <button
                                            onClick={exportToExcel}
                                            className="bg-green-600 text-white px-4 py-2 rounded-[2rem] text-xs font-bold hover:bg-green-700 transition-colors shadow-sm flex items-center gap-2"
                                        >
                                            <Database size={14} /> Exportar Excel
                                        </button>
                                        <span className="bg-white/10 text-gray-300 px-3 py-1 rounded-full text-xs font-bold">🎯 {filteredCandidates.length}/{candidates.length} Candidatos</span>
                                    </div>
                                )}
                            </div>

                            {candidates.length > 0 && !isSearching && (
                                <div className="relative mb-4">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="⚡ Filtrar resultados instantaneamente por nome, segmento, cidade..."
                                        value={resultFilter}
                                        onChange={(e) => setResultFilter(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-slate-900/60 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-atlas-orange/20 focus:border-atlas-orange transition-all outline-none"
                                    />
                                </div>
                            )}

                            {apolloError && !isSearching && (
                                <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning flex items-start gap-2">
                                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                    Apollo.io não retornou resultados: {apolloError}
                                </div>
                            )}

                            {isSearching ? (
                                <div className="flex-1 bg-slate-900/60 rounded-2xl border border-white/10 shadow-sm flex flex-col items-center justify-center p-10 min-h-[400px]">
                                    <div className="w-24 h-24 relative mb-8">
                                        <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
                                        <div className="absolute inset-0 border-4 border-atlas-orange rounded-full border-t-transparent animate-spin" />
                                        <div className="absolute inset-0 flex items-center justify-center text-atlas-orange">
                                            <Globe size={32} className="animate-pulse" />
                                        </div>
                                    </div>
                                    <h3 className="font-black text-xl text-white mb-4 text-center">🌎 Mapeando Mercado...</h3>
                                    <div className="space-y-3 w-full max-w-sm">
                                        {loadingSteps.map((step, idx) => (
                                            <div key={idx} className={`flex items-center gap-3 text-sm font-medium ${idx === loadingStepIdx ? 'text-atlas-orange' : idx < loadingStepIdx ? 'text-gray-400' : 'text-gray-200 opacity-50'}`}>
                                                {idx < loadingStepIdx ? <CheckCircle2 size={16} /> : idx === loadingStepIdx ? <Loader2 size={16} className="animate-spin" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                                                {step}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : candidates.length > 0 ? (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

                                        <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-white/10 mb-4">
                                            <input type="checkbox" className="rounded border-white/20 text-atlas-orange focus:ring-atlas-orange" checked={selectedCandidates.size > 0 && selectedCandidates.size === filteredCandidates.length} onChange={toggleSelectAll} />
                                            <span className="text-xs text-gray-300 font-bold">{selectedCandidates.size} selecionados</span>
                                            
                                            <div className="h-4 w-px bg-white/20 mx-2" />
                                            
                                            <button onClick={bulkSave} disabled={selectedCandidates.size === 0 || isSavingBatch} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                                                Salvar em Massa
                                            </button>
                                            <button onClick={bulkEnrich} disabled={selectedCandidates.size === 0 || isSavingBatch} className="text-[10px] font-bold bg-atlas-orange hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                                                Enriquecer em Massa
                                            </button>
                                        </div>

                                        {filteredCandidates.length === 0 && (
                                            <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-gray-400">
                                                🔍 Nenhum candidato bate com "{resultFilter}".
                                            </div>
                                        )}
                                        {filteredCandidates.map(({ c, i }) => (
                                            <motion.div 
                                                key={i} 
                                                initial={{ opacity: 0, y: 10 }} 
                                                animate={{ opacity: 1, y: 0 }} 
                                                transition={{ delay: i * 0.05 }}
                                            >
                                                <CandidateCard
                                                    candidate={c}
                                                    onPromote={() => promoteCandidate(c, i)}
                                                    isPromoting={promotingKey === `discovery-${i}`}
                                                    promoted={!!promoted[`discovery-${i}`]}
                                                    promotedResult={promoted[`discovery-${i}`]}
                                                    isSelected={selectedCandidates.has(i)}
                                                    onToggleSelect={() => toggleSelect(i)}
                                                />
                                            </motion.div>
                                        ))}
                                    </motion.div>
                            ) : (
                                <div className="flex-1 bg-slate-900/60 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center p-10 min-h-[400px]">
                                    <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                                        <Search className="text-gray-400" size={32} />
                                    </div>
                                    <h3 className="font-black text-xl text-white mb-2">🔍 Nenhum lead encontrado</h3>
                                    <p className="text-sm text-gray-400 text-center max-w-sm">
                                        Preencha os critérios de ICP ao lado e busque oportunidades reais via OpenStreetMap e bases públicas, com Apollo opcional.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
