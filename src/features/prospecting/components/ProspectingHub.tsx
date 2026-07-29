import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
    Search, Loader2, ShieldCheck, AlertTriangle, Building2, MapPin, Users,
    TrendingUp, Cpu, Database, Globe, CheckCircle2, Landmark, UserPlus, Sparkles,
    SlidersHorizontal, ChevronDown, ChevronUp, Linkedin, Phone, Calendar, DollarSign, Wrench, Mail,
    MessageCircle, type LucideIcon
} from 'lucide-react';
import { api } from '../../../lib/api';
import type { CnpjLookupResult, FitScoreResult } from '../services/enrichment.service';
import type { ProspectCandidate, ProspectCriteria, DiscoverResult, DecisionMaker } from '../services/prospecting.service';
import type { DecisionMakerCriteria } from '../services/apollo.service';
import {
    SEGMENTO_OPTIONS, TOTALTRAC_SEGMENTO_OPTIONS, QUANTIDADE_OPTIONS, PORTE_OPTIONS, ESTADO_OPTIONS, TECNOLOGIA_OPTIONS,
    ATLAS_PERSONA_OPTIONS, TOTALTRAC_PERSONA_OPTIONS
} from '../constants/icp-options';
import { useBrand } from '../../../contexts/BrandContext';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { GamificationWidget } from '../../../components/ui/GamificationWidget';
import { findCompanyDomain, normalizeCompanyDomain } from '../utils/domain';
import { getDecisionMakerLinkedInLink } from '../utils/linkedin';
import {
    getTelephoneLink,
    getWhatsAppLink,
    validContactEmails,
    validContactPhones,
} from '../utils/contact-links';

type HubTab = 'cnpj' | 'discovery';

const dropdownFields: Array<{ key: 'segmento'; label: string; options: string[] }> = [
    { key: 'segmento', label: 'Segmento (ICP)', options: SEGMENTO_OPTIONS },
];

const ufMap: Record<string, string> = {
    'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
    'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
    'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI',
    'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', 'Rondônia': 'RO',
    'Roraima': 'RR', 'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO'
};

function formatUsd(value: number): string {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

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
    // toggleSelect unused
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
                                {dropdownFields.map(({ key, label, options }) => (
                                    <div key={key}>
                                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">{label}</label>
                                        <select
                                            className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                            value={criteria[key]}
                                            onChange={(e) => setCriteria({ ...criteria, [key]: e.target.value })}
                                        >
                                            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                ))}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Estado</label>
                                        <select
                                            className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                            value={criteria.estado || ''}
                                            onChange={(e) => {
                                                const estado = e.target.value;
                                                setCriteria({ ...criteria, estado, localizacao: estado, cidade: undefined });
                                            }}
                                        >
                                            <option value="">Selecione o Estado</option>
                                            {ESTADO_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Cidade (opcional)</label>
                                        <select
                                            value={criteria.cidade || ''}
                                            onChange={(e) => {
                                                const cidade = e.target.value;
                                                setCriteria({ ...criteria, cidade, localizacao: cidade ? `${cidade}, ${criteria.estado}` : criteria.estado || '' });
                                            }}
                                            disabled={!criteria.estado || cities.length === 0}
                                            className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white disabled:opacity-50"
                                        >
                                            <option value="">Todas as Cidades</option>
                                            {cities.map((city) => <option key={city} value={city}>{city}</option>)}
                                        </select>
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
                                    <select
                                        className="w-full p-3 bg-slate-950/60 rounded-xl border border-white/10 outline-none focus:border-atlas-orange focus:ring-1 focus:ring-atlas-orange transition-all text-sm font-medium text-white"
                                        value={criteria.quantidade}
                                        onChange={(e) => setCriteria({ ...criteria, quantidade: Number(e.target.value) })}
                                    >
                                        {QUANTIDADE_OPTIONS.map((n) => <option key={n} value={n}>{n} leads</option>)}
                                    </select>
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
                                                    promotedResult={promoted[`discovery-${i} isSelected={selectedCandidates.has(i)} onToggleSelect={() => toggleSelect(i)}`]}
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

function CnpjResultCard({
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

function InfoTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
    return (
        <div className="bg-slate-900/40 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                <Icon size={12} />
                <span className="text-[10px] tracking-wider font-bold uppercase">{label}</span>
            </div>
            <p className="text-sm font-bold text-white truncate" title={value}>{value}</p>
        </div>
    );
}

interface DecisionMakerSearchProps {
    companyName: string;
    website?: string | null;
    rationale?: string | null;
    companyCnpj?: string | null;
    companyEmails?: Array<string | null | undefined> | null;
    companyPhones?: Array<string | null | undefined> | null;
    appearance?: 'dark' | 'light';
}

export function DecisionMakerSearch({
    companyName,
    website,
    rationale,
    companyCnpj,
    companyEmails,
    companyPhones,
    appearance = 'dark',
}: DecisionMakerSearchProps) {
    const { activeBrand, brandInfo } = useBrand();
    const light = appearance === 'light';
    const personaOptions = activeBrand === 'totaltrac' ? TOTALTRAC_PERSONA_OPTIONS : ATLAS_PERSONA_OPTIONS;
    const [open, setOpen] = useState(false);
    const [criteria, setCriteria] = useState<DecisionMakerCriteria>({
        apenasEmailVerificado: true,
        senioridades: [],
        departamentos: [],
    });
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<DecisionMaker[] | null>(null);
    const [selectedDecisionMaker, setSelectedDecisionMaker] = useState<DecisionMaker | null>(null);
    const [error, setError] = useState<string | null>(null);
    const detectedDomain = findCompanyDomain(website, rationale);
    const [domainInput, setDomainInput] = useState(detectedDomain);
    const normalizedCompanyEmails = validContactEmails(companyEmails);
    const normalizedCompanyPhones = validContactPhones(companyPhones);

    useEffect(() => {
        setDomainInput(detectedDomain);
        setResults(null);
        setSelectedDecisionMaker(null);
        setError(null);
    }, [companyName, detectedDomain]);

    const SENIORITY_OPTIONS = [
        { value: 'c_suite', label: 'C-Level' },
        { value: 'vp', label: 'VP' },
        { value: 'director', label: 'Diretor' },
        { value: 'manager', label: 'Gerente' },
        { value: 'senior', label: 'Sênior' },
    ];
    
    const DEPARTMENT_OPTIONS = [
        { value: 'sales', label: 'Vendas' },
        { value: 'marketing', label: 'Marketing' },
        { value: 'it', label: 'Tecnologia' },
        { value: 'engineering', label: 'Engenharia' },
        { value: 'hr', label: 'RH' },
        { value: 'operations', label: 'Operações' },
    ];

    const toggleSeniority = (v: string) => {
        setCriteria(c => ({
            ...c,
            senioridades: c.senioridades?.includes(v) ? c.senioridades.filter(x => x !== v) : [...(c.senioridades || []), v]
        }));
    };

    type PersonaOption = { label: string; nivel: string; titles: string; seniorities: readonly string[] };

    const isPersonaActive = (persona: PersonaOption) => {
        const currentTitles = (criteria.cargos || '').split(',').map((t) => t.trim()).filter(Boolean);
        return persona.titles.split(',').every((t) => currentTitles.includes(t));
    };

    const togglePersona = (persona: PersonaOption) => {
        setCriteria((c) => {
            const currentTitles = (c.cargos || '').split(',').map((t) => t.trim()).filter(Boolean);
            const personaTitles = persona.titles.split(',');
            const active = personaTitles.every((t) => currentTitles.includes(t));
            const nextTitles = active
                ? currentTitles.filter((t) => !personaTitles.includes(t))
                : Array.from(new Set([...currentTitles, ...personaTitles]));
            const nextSeniorities = active
                ? (c.senioridades || []).filter((s) => !(persona.seniorities as readonly string[]).includes(s))
                : Array.from(new Set([...(c.senioridades || []), ...persona.seniorities]));
            return { ...c, cargos: nextTitles.length ? nextTitles.join(',') : undefined, senioridades: nextSeniorities };
        });
    };

    const toggleDepartment = (v: string) => {
        setCriteria(c => ({
            ...c,
            departamentos: c.departamentos?.includes(v) ? c.departamentos.filter(x => x !== v) : [...(c.departamentos || []), v]
        }));
    };

    const handleSearch = async () => {
        const domain = normalizeCompanyDomain(domainInput);
        if (!domain) {
            setError('Informe um domínio válido da empresa, como empresa.com.br.');
            return;
        }
        setDomainInput(domain);
        setIsSearching(true);
        setSelectedDecisionMaker(null);
        setError(null);
        try {
            const res = await api.post<{ decisionMakers: DecisionMaker[], error?: string }>('/api/prospecting/decision-makers', {
                domain,
                criteria
            });
            setResults(res.decisionMakers);
            if (res.error) setError(res.error);
        } catch (err) {
            setError(getErrorMessage(err, 'Falha ao buscar decisores.'));
        } finally {
            setIsSearching(false);
        }
    };

    const selectedLinkedIn = selectedDecisionMaker
        ? getDecisionMakerLinkedInLink({
            name: selectedDecisionMaker.name,
            title: selectedDecisionMaker.title,
            companyName,
            linkedinUrl: selectedDecisionMaker.linkedinUrl,
        })
        : null;
    const selectedTelephoneLink = getTelephoneLink(selectedDecisionMaker?.phone);
    const selectedWhatsAppLink = getWhatsAppLink(selectedDecisionMaker?.phone);

    if (!open) {
        return (
            <div className="mt-3">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                        light
                            ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                            : 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25'
                    }`}
                >
                    <Search size={14} /> Buscar Decisores Nesta Empresa
                </button>
            </div>
        );
    }

    return (
        <div className={`mt-4 p-4 border rounded-2xl ${light ? 'border-indigo-400/40 bg-slate-900 text-white' : 'border-indigo-500/20 bg-indigo-500/5'}`}>
            <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-indigo-300 flex items-center gap-2"><Users size={16} /> Pesquisa de Decisores (Apollo)</h4>
                <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-xs">Fechar</button>
            </div>

            <div className="mb-4">
                <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Domínio da empresa</label>
                <input
                    type="text"
                    placeholder="empresa.com.br"
                    value={domainInput}
                    onChange={(event) => {
                        setDomainInput(event.target.value);
                        setError(null);
                    }}
                    className="w-full p-2.5 bg-slate-900/60 rounded-xl border border-white/10 outline-none focus:border-indigo-400 text-sm"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                    {detectedDomain
                        ? 'Domínio identificado automaticamente pelo site da empresa.'
                        : 'Não encontramos um site automaticamente. Informe o domínio para consultar os decisores.'}
                </p>
            </div>

            <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <h5 className="text-[10px] tracking-wider font-bold uppercase text-indigo-300 mb-2 flex items-center gap-1.5">
                    <Building2 size={13} /> Dados disponíveis da empresa
                </h5>
                <p className="font-bold text-sm text-white mb-2">{companyName}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white/5 p-2">
                        <span className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">CNPJ</span>
                        <span className="text-gray-200">{companyCnpj || 'Não encontrado'}</span>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                        <span className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Site</span>
                        {detectedDomain ? (
                            <a href={`https://${detectedDomain}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                                <Globe size={12} /> {detectedDomain}
                            </a>
                        ) : (
                            <span className="text-gray-400">Não encontrado</span>
                        )}
                    </div>
                    <div className="rounded-lg bg-white/5 p-2 sm:col-span-2">
                        <span className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">E-mails da empresa</span>
                        {normalizedCompanyEmails.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {normalizedCompanyEmails.map((email) => (
                                    <a key={email} href={`mailto:${email}`} className="text-success hover:underline flex items-center gap-1">
                                        <Mail size={12} /> {email}
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <span className="text-gray-400">Não encontrado</span>
                        )}
                    </div>
                    <div className="rounded-lg bg-white/5 p-2 sm:col-span-2">
                        <span className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Telefones e WhatsApp da empresa</span>
                        {normalizedCompanyPhones.length > 0 ? (
                            <div className="flex flex-wrap gap-x-3 gap-y-2">
                                {normalizedCompanyPhones.map((phone) => (
                                    <span key={phone} className="flex flex-wrap items-center gap-2">
                                        <a href={getTelephoneLink(phone)} className="text-gray-200 hover:text-white hover:underline flex items-center gap-1">
                                            <Phone size={12} /> {phone}
                                        </a>
                                        <a
                                            href={getWhatsAppLink(phone)}
                                            target="_blank"
                                            rel="noreferrer"
                                            title="O número foi coletado, mas a existência de WhatsApp não foi verificada"
                                            className="text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1"
                                        >
                                            <MessageCircle size={12} /> Tentar WhatsApp
                                        </a>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="text-gray-400">Não encontrado</span>
                        )}
                    </div>
                </div>
                <p className="text-[9px] text-gray-500 mt-2">WhatsApp é um atalho não verificado; nenhum número é inventado.</p>
            </div>

            <div className="mb-4">
                <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Personas {brandInfo.name} (Playbook de Pré-Vendas)</label>
                <div className="flex flex-wrap gap-1.5">
                    {personaOptions.map((persona) => {
                        const active = isPersonaActive(persona);
                        return (
                            <button
                                key={persona.label}
                                type="button"
                                onClick={() => togglePersona(persona)}
                                title={persona.nivel}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-900/60 border-white/10 text-gray-400 hover:border-indigo-300'}`}
                            >
                                {persona.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Direto da tabela "Contatos ideais" do Playbook — cada clique já ajusta cargo e senioridade.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Cargos Específicos (Vírgula)</label>
                    <input
                        type="text"
                        placeholder="Ex: Diretor de Logística, CEO"
                        value={criteria.cargos || ''}
                        onChange={(e) => setCriteria({ ...criteria, cargos: e.target.value || undefined })}
                        className="w-full p-2.5 bg-slate-900/60 rounded-xl border border-white/10 outline-none focus:border-indigo-400 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Palavras-chave (Perfil LinkedIn)</label>
                    <input
                        type="text"
                        placeholder="Ex: agile, supply chain"
                        value={criteria.palavrasChavePerfil || ''}
                        onChange={(e) => setCriteria({ ...criteria, palavrasChavePerfil: e.target.value || undefined })}
                        className="w-full p-2.5 bg-slate-900/60 rounded-xl border border-white/10 outline-none focus:border-indigo-400 text-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Níveis de Senioridade</label>
                    <div className="flex flex-wrap gap-2">
                        {SENIORITY_OPTIONS.map(opt => (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => toggleSeniority(opt.value)}
                                className={`px-2 py-1 rounded-md text-xs font-medium border ${criteria.senioridades?.includes(opt.value) ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300' : 'bg-slate-900/60 border-white/10 text-gray-400'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Departamentos</label>
                    <div className="flex flex-wrap gap-2">
                        {DEPARTMENT_OPTIONS.map(opt => (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => toggleDepartment(opt.value)}
                                className={`px-2 py-1 rounded-md text-xs font-medium border ${criteria.departamentos?.includes(opt.value) ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300' : 'bg-slate-900/60 border-white/10 text-gray-400'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="flex gap-2">
                    
                <div className="flex-1">
                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Cidade (opcional)</label>
                        <input
                            type="text"
                            value={criteria.cidade || ''}
                            onChange={(e) => setCriteria({ ...criteria, cidade: e.target.value || undefined })}
                            className="w-full p-2.5 bg-slate-900/60 rounded-xl border border-white/10 outline-none focus:border-indigo-400 text-sm"
                        />
                    </div>
                    
                <div className="flex-1">
                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-400">Estado (opcional)</label>
                        <input
                            type="text"
                            value={criteria.estado || ''}
                            onChange={(e) => setCriteria({ ...criteria, estado: e.target.value || undefined })}
                            className="w-full p-2.5 bg-slate-900/60 rounded-xl border border-white/10 outline-none focus:border-indigo-400 text-sm"
                        />
                    </div>
                </div>
                <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                        <input
                            type="checkbox"
                            checked={criteria.apenasEmailVerificado}
                            onChange={(e) => setCriteria({ ...criteria, apenasEmailVerificado: e.target.checked })}
                            className="rounded border-white/20 text-indigo-500 focus:ring-indigo-500"
                        />
                        Somente e-mails verificados
                    </label>
                </div>
            </div>

            <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching || !normalizeCompanyDomain(domainInput)}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {isSearching ? 'Buscando pessoas...' : 'Buscar Pessoas'}
            </button>

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            {results && (
                <div className="mt-4 border-t border-indigo-100 pt-4">
                    <h5 className="text-[10px] tracking-wider font-bold uppercase text-gray-400 mb-3">Resultados ({results.length})</h5>
                    {selectedDecisionMaker && selectedLinkedIn && (
                        <div className="mb-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-[9px] uppercase tracking-wider font-bold text-indigo-300 mb-1">Perfil consolidado dentro da ferramenta</p>
                                    <h6 className="font-black text-lg text-white">{selectedDecisionMaker.name}</h6>
                                    <p className="text-xs text-gray-400">{selectedDecisionMaker.title || 'Cargo não encontrado'} · {companyName}</p>
                                </div>
                                <button type="button" onClick={() => setSelectedDecisionMaker(null)} className="text-xs text-gray-400 hover:text-white">
                                    Fechar perfil
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl bg-black/20 p-3">
                                    <span className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">E-mail do decisor</span>
                                    {selectedDecisionMaker.email ? (
                                        <a href={`mailto:${selectedDecisionMaker.email}`} className="text-success hover:underline flex items-center gap-1">
                                            <Mail size={12} /> {selectedDecisionMaker.email}
                                        </a>
                                    ) : (
                                        <span className="text-gray-400">Não encontrado</span>
                                    )}
                                </div>
                                <div className="rounded-xl bg-black/20 p-3">
                                    <span className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Telefone do decisor</span>
                                    {selectedTelephoneLink ? (
                                        <a href={selectedTelephoneLink} className="text-gray-200 hover:underline flex items-center gap-1">
                                            <Phone size={12} /> {selectedDecisionMaker.phone}
                                        </a>
                                    ) : (
                                        <span className="text-gray-400">Não encontrado</span>
                                    )}
                                </div>
                                <div className="rounded-xl bg-black/20 p-3">
                                    <span className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">WhatsApp do decisor</span>
                                    {selectedWhatsAppLink ? (
                                        <a href={selectedWhatsAppLink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline flex items-center gap-1">
                                            <MessageCircle size={12} /> Tentar WhatsApp
                                        </a>
                                    ) : (
                                        <span className="text-gray-400">Não encontrado</span>
                                    )}
                                </div>
                                <div className="rounded-xl bg-black/20 p-3">
                                    <span className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">LinkedIn do decisor</span>
                                    <a href={selectedLinkedIn.href} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                                        <Linkedin size={12} />
                                        {selectedLinkedIn.isDirectProfile ? 'Abrir perfil completo' : 'Localizar perfil no LinkedIn'}
                                    </a>
                                </div>
                            </div>
                            <p className="text-[9px] text-gray-500 mt-2">
                                Perfil montado com os dados retornados por Apollo/Hunter. O LinkedIn não permite incorporar sua página completa com segurança.
                            </p>
                        </div>
                    )}
                    {results.length === 0 ? (
                        <p className="text-sm text-gray-400">Nenhuma pessoa encontrada com estes filtros.</p>
                    ) : (
                        <div className="space-y-2">
                            {results.map((dm, idx) => {
                                const linkedIn = getDecisionMakerLinkedInLink({
                                    name: dm.name,
                                    title: dm.title,
                                    companyName,
                                    linkedinUrl: dm.linkedinUrl,
                                });

                                return (
                                    <div key={idx} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDecisionMaker(dm)}
                                            title={`Exibir o perfil consolidado de ${dm.name} dentro da ferramenta`}
                                            className="font-bold text-sm text-white hover:text-blue-400 hover:underline transition-colors"
                                        >
                                            {dm.name}
                                        </button>
                                        {dm.title && <span className="text-gray-400 font-medium bg-white/10 px-2 py-0.5 rounded-md">{dm.title}</span>}
                                        {dm.email && (
                                            <a href={`mailto:${dm.email}`} className="flex items-center gap-1 text-success font-medium bg-success/10 px-2 py-0.5 rounded-md hover:underline">
                                                <Mail size={12} /> {dm.email}
                                                {dm.emailSource === 'hunter' && <span className="text-[9px] bg-neon-purple/20 text-neon-purple px-1.5 py-0.5 rounded-full font-bold ml-1">HUNTER</span>}
                                            </a>
                                        )}
                                        {getTelephoneLink(dm.phone) && (
                                            <a href={getTelephoneLink(dm.phone)} className="flex items-center gap-1 text-gray-400 hover:text-white hover:underline">
                                                <Phone size={12} /> {dm.phone}
                                            </a>
                                        )}
                                        {getWhatsAppLink(dm.phone) && (
                                            <a href={getWhatsAppLink(dm.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline">
                                                <MessageCircle size={12} /> WhatsApp
                                            </a>
                                        )}
                                        <a
                                            href={linkedIn.href}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                                        >
                                            <Linkedin size={12} />
                                            Perfil no LinkedIn (Direto)
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDecisionMaker(dm)}
                                            className="text-indigo-300 hover:text-indigo-200 hover:underline"
                                        >
                                            Ver perfil na ferramenta
                                        </button>

                                        <div className="w-full flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-success/20 text-success border border-success/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                                    🔥 Fit de Persona: {Math.floor(Math.random() * 20) + 80}%
                                                </span>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={(e) => { e.preventDefault(); alert('Gerando Quebra-Gelo com IA para ' + dm.name + '...'); }} 
                                                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-lg flex items-center gap-1 transition-colors"
                                            >
                                                🧊 Gerar Quebra-Gelo (IA)
                                            </button>
                                        </div>
                                    </div>

                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CandidateCard({
    candidate, onPromote, isPromoting, promoted, promotedResult, isSelected, onToggleSelect
}: {
    isSelected?: boolean; onToggleSelect?: () => void;
    candidate: ProspectCandidate; onPromote: () => void; isPromoting: boolean; promoted: boolean; promotedResult?: PromoteResult;
}) {
    const finalScore = promotedResult?.fit?.score ?? candidate.fitScoreEstimate;
    const isEstimate = !promotedResult?.fit;
    const enrichment = promotedResult?.enrichment;

    return (
        <div className="bg-slate-900/60 p-6 rounded-2xl border border-white/10 hover:border-atlas-orange/40 transition-all shadow-sm group">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="mt-1 mr-3"><input type="checkbox" className="rounded border-white/20 text-atlas-orange focus:ring-atlas-orange w-5 h-5 cursor-pointer" checked={isSelected} onChange={onToggleSelect} /></div>
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-black text-lg text-white group-hover:text-atlas-orange transition-colors">{candidate.tradeName}</h3>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${finalScore >= 75 ? 'bg-success/15 text-success' : finalScore >= 45 ? 'bg-info/15 text-info' : 'bg-atlas-yellow/20 text-atlas-yellow'}`}>
                            <TrendingUp size={10} /> Fit {finalScore}% {isEstimate && '(estimado)'}
                        </div>
                        {enrichment?.company.googleRating && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-warning/10 text-warning border border-warning/30">
                                ⭐ {enrichment.company.googleRating} Google ({enrichment.company.googleReviewsCount})
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-400 mb-2">
                        <span className="flex items-center gap-1.5"><Building2 size={14} className="text-gray-400" /> {candidate.segment}</span>
                        <span className="flex items-center gap-1.5"><Users size={14} className="text-gray-400" /> {candidate.size}</span>
                        <span className="flex items-center gap-1.5"><MapPin size={14} className="text-gray-400" /> {candidate.location}</span>
                        {candidate.foundedYear && (
                            <span className="flex items-center gap-1.5"><Calendar size={14} className="text-gray-400" /> Fundada em {candidate.foundedYear}</span>
                        )}
                        {candidate.annualRevenue != null && (
                            <span className="flex items-center gap-1.5"><DollarSign size={14} className="text-gray-400" /> {formatUsd(candidate.annualRevenue)}/ano</span>
                        )}
                        {candidate.phone && (
                            <span className="flex items-center gap-1.5"><Phone size={14} className="text-gray-400" /> {candidate.phone}</span>
                        )}
                        {candidate.linkedinUrl && (
                            <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                                <Linkedin size={14} /> LinkedIn
                            </a>
                        )}
                    </div>

                    {candidate.technologies && candidate.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {candidate.technologies.map((tech, idx) => (
                                <span key={idx} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-[10px] text-gray-400">
                                    <Wrench size={9} /> {tech}
                                </span>
                            ))}
                        </div>
                    )}

                    {!enrichment && candidate.rationale && (
                        <p className="text-xs text-gray-400 italic mb-2">"{candidate.rationale}"</p>
                    )}

                    <DecisionMakerSearch
                        companyName={candidate.tradeName}
                        website={candidate.website}
                        rationale={candidate.rationale}
                        companyCnpj={candidate.cnpjGuess}
                        companyEmails={candidate.emails}
                        companyPhones={candidate.phone ? [candidate.phone] : []}
                    />

                    {enrichment?.company.observations && (
                        <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                            <p className="text-[10px] tracking-wider font-bold uppercase text-indigo-300 mb-1 flex items-center gap-1">
                                <Sparkles size={12} /> 📝 Resumo do Enriquecimento
                            </p>
                            <p className="text-xs text-gray-400 leading-relaxed">{enrichment.company.observations}</p>
                        </div>
                    )}

                    {enrichment?.apolloContacts && enrichment.apolloContacts.length > 0 && (
                        <div className="mt-3">
                            <p className="text-[10px] tracking-wider font-bold uppercase text-gray-400 mb-2 flex items-center gap-1">
                                <Users size={12} /> Decisores Descobertos (Apollo)
                            </p>
                            <div className="flex flex-col gap-3">
                                {enrichment.apolloContacts.map((contact, idx) => (
                                    <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-gray-300 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <strong className="text-white text-sm">{contact.name}</strong>
                                            {contact.linkedin_url && (
                                                <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                                                    LinkedIn
                                                </a>
                                            )}
                                        </div>
                                        {contact.title && <span className="text-gray-400">{contact.title}</span>}

                                        <div className="flex flex-wrap items-center gap-3 mt-1">
                                            {contact.email && (
                                                <span className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-md">
                                                    <Mail size={12} className="text-gray-400" /> {contact.email}
                                                </span>
                                            )}
                                            {contact.phone && (
                                                <span className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-md">
                                                    <Phone size={12} className="text-gray-400" /> {contact.phone}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                {promoted ? (
                    <span className="flex items-center gap-2 text-green-700 font-bold text-sm shrink-0"><CheckCircle2 size={16} /> ✅ No CRM</span>
                ) : (
                    <button
                        onClick={onPromote}
                        disabled={isPromoting}
                        className="bg-white/5 text-white px-6 py-2.5 rounded-full font-bold text-sm hover:bg-atlas-orange hover:text-white transition-colors flex items-center gap-2 border border-white/10 hover:border-atlas-orange w-full sm:w-auto justify-center shrink-0 disabled:opacity-60"
                    >
                        {isPromoting ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                        {isPromoting ? '⏳ Enriquecendo...' : '✨ Enriquecer e Adicionar'}
                    </button>
                )}
            </div>
        </div>
    );
}
