import { useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../../../lib/api';
import type { CnpjLookupResult, FitScoreResult } from '../services/enrichment.service';
import type { ProspectCandidate, ProspectCriteria, DiscoverResult, DecisionMaker } from '../services/prospecting.service';
import type { DecisionMakerCriteria } from '../services/apollo.service';
import {
    SEGMENTO_OPTIONS, LOCALIZACAO_OPTIONS, QUANTIDADE_OPTIONS, PORTE_OPTIONS, ESTADO_OPTIONS, TECNOLOGIA_OPTIONS,
    ATLAS_PERSONA_OPTIONS,
} from '../constants/icp-options';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { fadeInUp, staggerContainer, staggerItem } from '../../../lib/motion';
import {
    IconSearch, IconSpinner, IconShieldCheck, IconWarning, IconBuilding, IconMapPin, IconContacts,
    IconTrendUp, IconCpu, IconDatabase, IconGlobe, IconCheck, IconLandmark, IconUserPlus, IconSparkle,
    IconSliders, IconChevronDown, IconChevronUp, IconLinkedin, IconPhone, IconCalendar, IconDollar,
    IconWrench, IconMail, type AtlasIconProps,
} from '../../../components/icons';

type HubTab = 'cnpj' | 'discovery';

const dropdownFields: Array<{ key: 'segmento' | 'localizacao'; label: string; options: string[] }> = [
    { key: 'segmento', label: 'Segmento (ICP)', options: SEGMENTO_OPTIONS },
    { key: 'localizacao', label: 'Região de Atuação (ampla)', options: LOCALIZACAO_OPTIONS },
];

function formatUsd(value: number): string {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const loadingSteps = [
    'Buscando empresas via Google Places e Apollo.io...',
    'Consultando bases públicas (Receita Federal)...',
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
        apolloContacts?: Array<{ name: string; title: string | null; email: string | null }>;
    };
}

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

const inputClass = "w-full p-3 bg-black/[0.02] rounded-xl border border-black/5 outline-none focus:border-atlas-orange/50 focus:ring-2 focus:ring-atlas-orange/15 transition-all text-sm font-medium text-atlas-dark";

export function ProspectingHub() {
    const [tab, setTab] = useState<HubTab>('cnpj');

    // --- CNPJ real lookup ---
    const [cnpjInput, setCnpjInput] = useState('');
    const [cnpjLoading, setCnpjLoading] = useState(false);
    const [cnpjResult, setCnpjResult] = useState<CnpjLookupResult | null>(null);
    const [cnpjError, setCnpjError] = useState<string | null>(null);

    // --- discovery via Google Places + Apollo ---
    const [criteria, setCriteria] = useState<ProspectCriteria>({
        segmento: SEGMENTO_OPTIONS[0],
        localizacao: LOCALIZACAO_OPTIONS[0],
        quantidade: QUANTIDADE_OPTIONS[0],
    });
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [loadingStepIdx, setLoadingStepIdx] = useState(0);
    const [candidates, setCandidates] = useState<ProspectCandidate[]>([]);
    const [discoverError, setDiscoverError] = useState<string | null>(null);
    const [apolloError, setApolloError] = useState<string | null>(null);

    // --- shared: promote-to-CRM state ---
    const [promotingKey, setPromotingKey] = useState<string | null>(null);
    const [promoted, setPromoted] = useState<Record<string, PromoteResult>>({});

    // --- quick filter sobre os resultados já carregados (busca instantânea, sem nova chamada externa) ---
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
                autoEnrich: true, // reaplica o enriquecimento no servidor para popular todos os campos e o fit score
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
                source: 'Prospecção (Google Places / Apollo)',
                autoEnrich: true,
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
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <motion.div variants={fadeInUp} initial="hidden" animate="show" className="mb-4">
                    <h1 className="text-4xl font-black text-atlas-dark tracking-tight flex items-center gap-2">
                        Prospecção &amp; Inteligência
                        <IconSparkle className="text-atlas-orange w-7 h-7" />
                    </h1>
                    <p className="text-atlas-dark/50 mt-2 text-sm font-medium">Motor de enriquecimento autônomo com IA para capturar leads corporativos de altíssimo nível.</p>
                </motion.div>

                <motion.div variants={fadeInUp} initial="hidden" animate="show" className="flex gap-2 glass-panel p-2 rounded-2xl w-fit relative z-10">
                    <button
                        onClick={() => setTab('cnpj')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${tab === 'cnpj' ? 'bg-atlas-dark text-white elevation-2' : 'text-atlas-dark/45 hover:bg-white/70'}`}
                    >
                        <IconLandmark className="w-4 h-4" /> Auditoria Receita (CNPJ)
                    </button>
                    <button
                        onClick={() => setTab('discovery')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${tab === 'discovery' ? 'bg-gradient-to-br from-atlas-orange to-atlas-light-orange text-white elevation-2' : 'text-atlas-dark/45 hover:bg-white/70'}`}
                    >
                        <IconDatabase className="w-4 h-4" /> Radar Discovery (Apollo + IA)
                    </button>
                </motion.div>

                {tab === 'cnpj' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                        <Card className="xl:col-span-4 p-6 sm:p-8">
                            <div className="flex items-center gap-2 mb-6">
                                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-atlas-orange">
                                    <IconLandmark className="w-[18px] h-[18px]" />
                                </div>
                                <h2 className="font-black text-xl text-atlas-dark">Consulta Receita Federal</h2>
                            </div>
                            <p className="text-xs text-atlas-dark/45 mb-4">Dados oficiais via BrasilAPI — sem chave, sem custo, direto da base da Receita Federal.</p>
                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">CNPJ</label>
                            <input
                                className={`${inputClass} mb-4`}
                                value={cnpjInput}
                                placeholder="Ex: 19.131.243/0001-97"
                                onChange={(e) => setCnpjInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCnpjLookup()}
                            />
                            <Button
                                variant="premium"
                                className="w-full py-3.5"
                                onClick={handleCnpjLookup}
                                disabled={cnpjLoading || !cnpjInput}
                            >
                                {cnpjLoading ? <IconSpinner className="w-[18px] h-[18px] mr-2 animate-spin" /> : <IconSearch className="w-[18px] h-[18px] mr-2" />}
                                {cnpjLoading ? 'Consultando...' : 'Consultar'}
                            </Button>
                            {cnpjError && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                                    <IconWarning className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {cnpjError}
                                </div>
                            )}
                        </Card>

                        <div className="xl:col-span-8">
                            {!cnpjResult && !cnpjLoading && (
                                <div className="bg-white rounded-2xl border border-dashed border-black/10 flex flex-col items-center justify-center p-10 min-h-[400px]">
                                    <div className="bg-black/[0.02] w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                                        <IconLandmark className="text-atlas-dark/20 w-8 h-8" />
                                    </div>
                                    <h3 className="font-black text-xl text-atlas-dark mb-2">Nenhuma consulta feita</h3>
                                    <p className="text-sm text-atlas-dark/45 text-center max-w-sm">Digite um CNPJ para trazer dados cadastrais reais direto da Receita Federal.</p>
                                </div>
                            )}

                            {cnpjResult && !cnpjResult.found && (
                                <Card className="p-10 flex flex-col items-center justify-center min-h-[300px]">
                                    <IconWarning className="text-amber-500 mb-4 w-10 h-10" />
                                    <h3 className="font-black text-xl text-atlas-dark mb-2">
                                        {cnpjResult.error === 'invalid_format' ? 'CNPJ inválido' : 'CNPJ não encontrado na base da Receita'}
                                    </h3>
                                    <p className="text-sm text-atlas-dark/45 text-center max-w-sm">
                                        {cnpjResult.error === 'invalid_format'
                                            ? 'Verifique os dígitos verificadores e tente novamente.'
                                            : 'Confira o número digitado — esse CNPJ não foi localizado na base pública.'}
                                    </p>
                                </Card>
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
                        <Card className="xl:col-span-4 p-6 sm:p-8 relative overflow-hidden flex flex-col h-full max-h-[800px]">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-atlas-orange opacity-5 transform rotate-45 translate-x-20 -translate-y-20" />
                            <div className="flex items-center gap-2 mb-6 relative z-10">
                                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-atlas-orange">
                                    <IconDatabase className="w-[18px] h-[18px]" />
                                </div>
                                <h2 className="font-black text-xl text-atlas-dark">Motor de Busca Turbo</h2>
                            </div>
                            <p className="text-xs text-atlas-dark/45 mb-4 relative z-10">Busca real via Google Places, Apollo.io (Organization Search) e OpenStreetMap; cada candidato é validado na Receita Federal antes de virar Lead.</p>

                            <div className="space-y-4 relative z-10 flex-1 overflow-y-auto pr-2">
                                {dropdownFields.map(({ key, label, options }) => (
                                    <div key={key}>
                                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">{label}</label>
                                        <select
                                            className={inputClass}
                                            value={criteria[key]}
                                            onChange={(e) => setCriteria({ ...criteria, [key]: e.target.value })}
                                        >
                                            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                ))}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Estado (refina a busca)</label>
                                        <select
                                            className={inputClass}
                                            value={criteria.estado || ''}
                                            onChange={(e) => setCriteria({ ...criteria, estado: e.target.value || undefined, cidade: e.target.value ? criteria.cidade : undefined })}
                                        >
                                            <option value="">Usar região ampla</option>
                                            {ESTADO_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Cidade (opcional)</label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Niterói"
                                            value={criteria.cidade || ''}
                                            onChange={(e) => setCriteria({ ...criteria, cidade: e.target.value || undefined })}
                                            disabled={!criteria.estado}
                                            className={`${inputClass} disabled:opacity-50`}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Quantidade de Leads</label>
                                    <select
                                        className={inputClass}
                                        value={criteria.quantidade}
                                        onChange={(e) => setCriteria({ ...criteria, quantidade: Number(e.target.value) })}
                                    >
                                        {QUANTIDADE_OPTIONS.map((n) => <option key={n} value={n}>{n} leads</option>)}
                                    </select>
                                </div>

                                <button
                                    onClick={() => setShowAdvanced((v) => !v)}
                                    className="flex items-center justify-between w-full text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 hover:text-atlas-orange transition-colors pt-2"
                                >
                                    <span className="flex items-center gap-1.5"><IconSliders className="w-3 h-3" /> Filtros Avançados (Apollo.io)</span>
                                    {showAdvanced ? <IconChevronUp className="w-3.5 h-3.5" /> : <IconChevronDown className="w-3.5 h-3.5" />}
                                </button>

                                {showAdvanced && (
                                    <div className="space-y-4 pt-1">
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Porte (nº de funcionários)</label>
                                            <select
                                                className={inputClass}
                                                value={criteria.porte || ''}
                                                onChange={(e) => setCriteria({ ...criteria, porte: e.target.value || undefined })}
                                            >
                                                {PORTE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Faturamento Anual Estimado (USD)</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    placeholder="Mínimo"
                                                    value={criteria.faturamentoMin ?? ''}
                                                    onChange={(e) => setCriteria({ ...criteria, faturamentoMin: e.target.value ? Number(e.target.value) : undefined })}
                                                    className={inputClass}
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Máximo"
                                                    value={criteria.faturamentoMax ?? ''}
                                                    onChange={(e) => setCriteria({ ...criteria, faturamentoMax: e.target.value ? Number(e.target.value) : undefined })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <p className="text-[10px] text-atlas-dark/35 mt-1">Dado da Apollo é normalizado em dólar, independente do mercado.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Palavras-chave adicionais</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: refrigerated, cargo, fleet"
                                                value={criteria.palavrasChave || ''}
                                                onChange={(e) => setCriteria({ ...criteria, palavrasChave: e.target.value || undefined })}
                                                className={inputClass}
                                            />
                                            <p className="text-[10px] text-atlas-dark/35 mt-1">Separadas por vírgula — somam ao segmento na busca da Apollo.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Nome específico da empresa</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Tranziran"
                                                value={criteria.nomeEmpresa || ''}
                                                onChange={(e) => setCriteria({ ...criteria, nomeEmpresa: e.target.value || undefined })}
                                                className={inputClass}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Ano de Fundação (Mín e Máx)</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    placeholder="De"
                                                    value={criteria.anoFundacaoMin ?? ''}
                                                    onChange={(e) => setCriteria({ ...criteria, anoFundacaoMin: e.target.value ? Number(e.target.value) : undefined })}
                                                    className={inputClass}
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Até"
                                                    value={criteria.anoFundacaoMax ?? ''}
                                                    onChange={(e) => setCriteria({ ...criteria, anoFundacaoMax: e.target.value ? Number(e.target.value) : undefined })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <p className="text-[10px] text-atlas-dark/35 mt-1">A Apollo não filtra por ano nativamente — buscamos mais candidatos e filtramos localmente por fundação real.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Tecnologias Utilizadas</label>
                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-black/[0.02] rounded-xl border border-black/5">
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
                                                            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${selected ? 'bg-atlas-orange border-atlas-orange text-white' : 'bg-white border-black/10 text-atlas-dark/60 hover:border-atlas-orange/40'}`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[10px] text-atlas-dark/35 mt-1">Lista curada e validada contra a API — a Apollo só filtra por identificador interno, não por nome livre.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Excluir Tecnologias</label>
                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-black/[0.02] rounded-xl border border-black/5">
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
                                                            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${selected ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-black/10 text-atlas-dark/60 hover:border-red-300'}`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[10px] text-atlas-dark/35 mt-1">Útil para descartar empresas que já usam a solução de um concorrente, por exemplo.</p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Excluir Localização</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: São Paulo, Minas Gerais"
                                                value={criteria.localizacaoExcluir || ''}
                                                onChange={(e) => setCriteria({ ...criteria, localizacaoExcluir: e.target.value || undefined })}
                                                className={inputClass}
                                            />
                                            <p className="text-[10px] text-atlas-dark/35 mt-1">Cidades/estados a descartar, separados por vírgula.</p>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm text-atlas-dark/70 pt-1">
                                            <input
                                                type="checkbox"
                                                checked={!!criteria.apenasCapitalAberto}
                                                onChange={(e) => setCriteria({ ...criteria, apenasCapitalAberto: e.target.checked || undefined })}
                                                className="rounded border-black/20 text-atlas-orange focus:ring-atlas-orange"
                                            />
                                            Somente empresas de capital aberto (B3/bolsa)
                                        </label>
                                    </div>
                                )}
                            </div>

                            <div className="pt-6 mt-2 relative z-10 border-t border-black/5">
                                <Button variant="premium" className="w-full py-4" onClick={handleDiscover} disabled={isSearching}>
                                    {isSearching ? (
                                        <><IconSpinner className="w-5 h-5 mr-2 animate-spin" /> Buscando...</>
                                    ) : (
                                        <><IconCpu className="w-5 h-5 mr-2" /> Encontrar Leads Ideais</>
                                    )}
                                </Button>
                                {discoverError && <p className="text-xs text-red-600 mt-2">{discoverError}</p>}
                            </div>
                        </Card>

                        <div className="xl:col-span-8 flex flex-col h-full">
                            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                                <h2 className="font-black text-2xl text-atlas-dark">Resultados</h2>
                                {candidates.length > 0 && (
                                    <span className="bg-black/[0.03] text-atlas-dark/60 px-3 py-1 rounded-full text-xs font-bold">{filteredCandidates.length}/{candidates.length} Candidatos</span>
                                )}
                            </div>

                            {candidates.length > 0 && !isSearching && (
                                <div className="relative mb-4">
                                    <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-atlas-dark/30" />
                                    <input
                                        type="text"
                                        placeholder="Filtrar resultados instantaneamente por nome, segmento, cidade..."
                                        value={resultFilter}
                                        onChange={(e) => setResultFilter(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-black/5 rounded-xl text-sm focus:ring-2 focus:ring-atlas-orange/15 focus:border-atlas-orange/40 transition-all outline-none"
                                    />
                                </div>
                            )}

                            {apolloError && !isSearching && (
                                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                                    <IconWarning className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    Apollo.io não retornou resultados: {apolloError}
                                </div>
                            )}

                            {isSearching ? (
                                <div className="flex-1 bg-white rounded-2xl border border-black/5 elevation-1 flex flex-col items-center justify-center p-10 min-h-[400px]">
                                    <div className="w-24 h-24 relative mb-8">
                                        <div className="absolute inset-0 border-4 border-black/5 rounded-full" />
                                        <div className="absolute inset-0 border-4 border-atlas-orange rounded-full border-t-transparent animate-spin" />
                                        <div className="absolute inset-0 flex items-center justify-center text-atlas-orange">
                                            <IconGlobe className="w-8 h-8 animate-pulse" />
                                        </div>
                                    </div>
                                    <h3 className="font-black text-xl text-atlas-dark mb-4 text-center">Mapeando Mercado...</h3>
                                    <div className="space-y-3 w-full max-w-sm">
                                        {loadingSteps.map((step, idx) => (
                                            <div key={idx} className={`flex items-center gap-3 text-sm font-medium ${idx === loadingStepIdx ? 'text-atlas-orange' : idx < loadingStepIdx ? 'text-atlas-dark/35' : 'text-atlas-dark/15'}`}>
                                                {idx < loadingStepIdx ? <IconCheck className="w-4 h-4" /> : idx === loadingStepIdx ? <IconSpinner className="w-4 h-4 animate-spin" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                                                {step}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : candidates.length > 0 ? (
                                <motion.div variants={staggerContainer(0.05)} initial="hidden" animate="show" className="space-y-4">
                                    {filteredCandidates.length === 0 && (
                                        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-dashed border-black/10 p-8 text-center text-sm text-atlas-dark/45">
                                            Nenhum candidato bate com "{resultFilter}".
                                        </div>
                                    )}
                                    {filteredCandidates.map(({ c, i }) => (
                                        <motion.div key={i} variants={staggerItem}>
                                            <CandidateCard
                                                candidate={c}
                                                onPromote={() => promoteCandidate(c, i)}
                                                isPromoting={promotingKey === `discovery-${i}`}
                                                promoted={!!promoted[`discovery-${i}`]}
                                                promotedResult={promoted[`discovery-${i}`]}
                                            />
                                        </motion.div>
                                    ))}
                                </motion.div>
                            ) : (
                                <div className="flex-1 bg-white rounded-2xl border border-dashed border-black/10 flex flex-col items-center justify-center p-10 min-h-[400px]">
                                    <div className="bg-black/[0.02] w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                                        <IconSearch className="text-atlas-dark/20 w-8 h-8" />
                                    </div>
                                    <h3 className="font-black text-xl text-atlas-dark mb-2">Nenhum lead encontrado</h3>
                                    <p className="text-sm text-atlas-dark/45 text-center max-w-sm">
                                        Preencha os critérios de ICP ao lado e busque oportunidades reais de mercado via Google Places, Apollo.io e OpenStreetMap.
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
        <Card className="p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-black text-2xl text-atlas-dark">{d.tradeName}</h3>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            <IconShieldCheck className="w-2.5 h-2.5" /> {d.situacaoCadastral}
                        </span>
                    </div>
                    <p className="text-sm text-atlas-dark/45">{d.legalName} · {result.cnpj}</p>
                </div>
                <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-xs font-bold">
                    <IconCheck className="w-3 h-3" /> Dados oficiais — Receita Federal
                </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoTile icon={IconBuilding} label="Natureza Jurídica" value={d.naturezaJuridica} />
                <InfoTile icon={IconContacts} label="Porte / Funcionários" value={`${d.size} (${d.employeeCountEstimate}+ estimado)`} />
                <InfoTile icon={IconDollar} label="Capital Social" value={d.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                <InfoTile icon={IconMapPin} label="Localização" value={`${d.city}, ${d.state}`} />
            </div>

            <div>
                <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-1">Atividade Principal (CNAE {d.cnae})</p>
                <p className="text-sm text-atlas-dark/70">{d.cnaeDescription}</p>
            </div>

            <div>
                <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-2">Endereço</p>
                <p className="text-sm text-atlas-dark/70">{d.address}, {d.city} - {d.state}, {d.zipCode}</p>
            </div>

            {d.qsa.length > 0 && (
                <div>
                    <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-2">Quadro Societário</p>
                    <div className="flex flex-wrap gap-2">
                        {d.qsa.map((s, i) => (
                            <span key={i} className="bg-black/[0.02] border border-black/5 rounded-full px-3 py-1 text-xs text-atlas-dark/70">
                                {s.nome} <span className="text-atlas-dark/35">· {s.qualificacao}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {d.phones.length > 0 && (
                <div>
                    <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-2">Telefones (Receita Federal)</p>
                    <p className="text-sm text-atlas-dark/70">{d.phones.join(' · ')}</p>
                </div>
            )}

            <div className="pt-4 border-t border-black/5 flex justify-end">
                {promoted ? (
                    <span className="flex items-center gap-2 text-green-700 font-bold text-sm"><IconCheck className="w-4 h-4" /> Adicionado ao CRM</span>
                ) : (
                    <Button variant="default" className="rounded-full bg-atlas-dark hover:bg-atlas-dark/90 px-6" onClick={onPromote} disabled={isPromoting}>
                        {isPromoting ? <IconSpinner className="w-4 h-4 mr-2 animate-spin" /> : <IconUserPlus className="w-4 h-4 mr-2" />}
                        {isPromoting ? 'Adicionando...' : 'Adicionar ao CRM como Lead'}
                    </Button>
                )}
            </div>
        </Card>
    );
}

function InfoTile({ icon: Icon, label, value }: { icon: React.ComponentType<AtlasIconProps>; label: string; value: string }) {
    return (
        <div className="bg-black/[0.02] rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-atlas-dark/35 mb-1">
                <Icon className="w-3 h-3" />
                <span className="text-[10px] tracking-wider font-bold uppercase">{label}</span>
            </div>
            <p className="text-sm font-bold text-atlas-dark truncate" title={value}>{value}</p>
        </div>
    );
}

function DecisionMakerSection({ candidate }: { candidate: ProspectCandidate }) {
    const [open, setOpen] = useState(false);
    const [criteria, setCriteria] = useState<DecisionMakerCriteria>({
        apenasEmailVerificado: true,
        senioridades: [],
        departamentos: [],
    });
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<DecisionMaker[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const hasDomain = candidate.rationale.includes('domínio: ');
    const domainMatch = candidate.rationale.match(/domínio: ([a-zA-Z0-9.-]+)/);
    const domain = domainMatch ? domainMatch[1] : null;

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

    const isPersonaActive = (persona: typeof ATLAS_PERSONA_OPTIONS[number]) => {
        const currentTitles = (criteria.cargos || '').split(',').map((t) => t.trim()).filter(Boolean);
        return persona.titles.split(',').every((t) => currentTitles.includes(t));
    };

    const togglePersona = (persona: typeof ATLAS_PERSONA_OPTIONS[number]) => {
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
        if (!domain) return;
        setIsSearching(true);
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

    if (!hasDomain || !domain) return null;

    if (!open) {
        return (
            <div className="mt-3">
                <button
                    onClick={() => setOpen(true)}
                    className="text-xs bg-indigo-50 text-indigo-700 font-bold px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-100 transition-colors"
                >
                    <IconSearch className="w-3.5 h-3.5" /> Buscar Decisores Nesta Empresa
                </button>
            </div>
        );
    }

    return (
        <div className="mt-4 p-4 border border-indigo-100 bg-indigo-50/30 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-indigo-900 flex items-center gap-2"><IconContacts className="w-4 h-4" /> Pesquisa de Decisores (Apollo)</h4>
                <button onClick={() => setOpen(false)} className="text-atlas-dark/40 hover:text-atlas-dark/70 text-xs">Fechar</button>
            </div>

            <div className="mb-4">
                <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Personas Atlas (Playbook de Pré-Vendas)</label>
                <div className="flex flex-wrap gap-1.5">
                    {ATLAS_PERSONA_OPTIONS.map((persona) => {
                        const active = isPersonaActive(persona);
                        return (
                            <button
                                key={persona.label}
                                type="button"
                                onClick={() => togglePersona(persona)}
                                title={persona.nivel}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-black/10 text-atlas-dark/60 hover:border-indigo-300'}`}
                            >
                                {persona.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[10px] text-atlas-dark/35 mt-1">Direto da tabela "Contatos ideais" do Playbook — cada clique já ajusta cargo e senioridade.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Cargos Específicos (Vírgula)</label>
                    <input
                        type="text"
                        placeholder="Ex: Diretor de Logística, CEO"
                        value={criteria.cargos || ''}
                        onChange={(e) => setCriteria({ ...criteria, cargos: e.target.value || undefined })}
                        className="w-full p-2.5 bg-white rounded-xl border border-black/10 outline-none focus:border-indigo-400 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Palavras-chave (Perfil LinkedIn)</label>
                    <input
                        type="text"
                        placeholder="Ex: agile, supply chain"
                        value={criteria.palavrasChavePerfil || ''}
                        onChange={(e) => setCriteria({ ...criteria, palavrasChavePerfil: e.target.value || undefined })}
                        className="w-full p-2.5 bg-white rounded-xl border border-black/10 outline-none focus:border-indigo-400 text-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Níveis de Senioridade</label>
                    <div className="flex flex-wrap gap-2">
                        {SENIORITY_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => toggleSeniority(opt.value)}
                                className={`px-2 py-1 rounded-md text-xs font-medium border ${criteria.senioridades?.includes(opt.value) ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-black/10 text-atlas-dark/60'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Departamentos</label>
                    <div className="flex flex-wrap gap-2">
                        {DEPARTMENT_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => toggleDepartment(opt.value)}
                                className={`px-2 py-1 rounded-md text-xs font-medium border ${criteria.departamentos?.includes(opt.value) ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-black/10 text-atlas-dark/60'}`}
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
                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Cidade (opcional)</label>
                        <input
                            type="text"
                            value={criteria.cidade || ''}
                            onChange={(e) => setCriteria({ ...criteria, cidade: e.target.value || undefined })}
                            className="w-full p-2.5 bg-white rounded-xl border border-black/10 outline-none focus:border-indigo-400 text-sm"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Estado (opcional)</label>
                        <input
                            type="text"
                            value={criteria.estado || ''}
                            onChange={(e) => setCriteria({ ...criteria, estado: e.target.value || undefined })}
                            className="w-full p-2.5 bg-white rounded-xl border border-black/10 outline-none focus:border-indigo-400 text-sm"
                        />
                    </div>
                </div>
                <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-atlas-dark/70">
                        <input
                            type="checkbox"
                            checked={criteria.apenasEmailVerificado}
                            onChange={(e) => setCriteria({ ...criteria, apenasEmailVerificado: e.target.checked })}
                            className="rounded border-black/20 text-indigo-600 focus:ring-indigo-500"
                        />
                        Somente e-mails verificados
                    </label>
                </div>
            </div>

            <button
                onClick={handleSearch}
                disabled={isSearching}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
                {isSearching ? <IconSpinner className="w-4 h-4 animate-spin" /> : <IconSearch className="w-4 h-4" />}
                {isSearching ? 'Buscando pessoas...' : 'Buscar Pessoas'}
            </button>

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            {results && (
                <div className="mt-4 border-t border-indigo-100 pt-4">
                    <h5 className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-3">Resultados ({results.length})</h5>
                    {results.length === 0 ? (
                        <p className="text-sm text-atlas-dark/45">Nenhuma pessoa encontrada com estes filtros.</p>
                    ) : (
                        <div className="space-y-2">
                            {results.map((dm, idx) => (
                                <div key={idx} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-white border border-black/10 rounded-xl px-3 py-2 text-xs text-atlas-dark/70">
                                    <span className="font-bold text-sm text-atlas-dark">{dm.name}</span>
                                    {dm.title && <span className="text-atlas-dark/45 font-medium bg-black/[0.03] px-2 py-0.5 rounded-md">{dm.title}</span>}
                                    {dm.email && (
                                        <span className="flex items-center gap-1 text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded-md">
                                            <IconMail className="w-3 h-3" /> {dm.email}
                                            {dm.emailSource === 'hunter' && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold ml-1">HUNTER</span>}
                                        </span>
                                    )}
                                    {dm.phone && <span className="flex items-center gap-1 text-atlas-dark/60"><IconPhone className="w-3 h-3" /> {dm.phone}</span>}
                                    {dm.linkedinUrl && (
                                        <a href={dm.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                                            <IconLinkedin className="w-3 h-3" /> LinkedIn
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CandidateCard({
    candidate, onPromote, isPromoting, promoted, promotedResult,
}: {
    candidate: ProspectCandidate; onPromote: () => void; isPromoting: boolean; promoted: boolean; promotedResult?: PromoteResult;
}) {
    const finalScore = promotedResult?.fit?.score ?? candidate.fitScoreEstimate;
    const isEstimate = !promotedResult?.fit;
    const enrichment = promotedResult?.enrichment;

    return (
        <Card variant="interactive" className="p-6 group">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-black text-lg text-atlas-dark group-hover:text-atlas-orange transition-colors">{candidate.tradeName}</h3>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${finalScore >= 75 ? 'bg-green-100 text-green-700' : finalScore >= 45 ? 'bg-blue-100 text-blue-700' : 'bg-atlas-yellow/20 text-atlas-dark'}`}>
                            <IconTrendUp className="w-2.5 h-2.5" /> Fit {finalScore}% {isEstimate && '(estimado)'}
                        </div>
                        {enrichment?.company.googleRating && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-yellow-50 text-yellow-700 border border-yellow-200">
                                {enrichment.company.googleRating} Google ({enrichment.company.googleReviewsCount})
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs font-semibold text-atlas-dark/50 mb-2">
                        <span className="flex items-center gap-1.5"><IconBuilding className="w-3.5 h-3.5 text-atlas-dark/30" /> {candidate.segment}</span>
                        <span className="flex items-center gap-1.5"><IconContacts className="w-3.5 h-3.5 text-atlas-dark/30" /> {candidate.size}</span>
                        <span className="flex items-center gap-1.5"><IconMapPin className="w-3.5 h-3.5 text-atlas-dark/30" /> {candidate.location}</span>
                        {candidate.foundedYear && (
                            <span className="flex items-center gap-1.5"><IconCalendar className="w-3.5 h-3.5 text-atlas-dark/30" /> Fundada em {candidate.foundedYear}</span>
                        )}
                        {candidate.annualRevenue != null && (
                            <span className="flex items-center gap-1.5"><IconDollar className="w-3.5 h-3.5 text-atlas-dark/30" /> {formatUsd(candidate.annualRevenue)}/ano</span>
                        )}
                        {candidate.phone && (
                            <span className="flex items-center gap-1.5"><IconPhone className="w-3.5 h-3.5 text-atlas-dark/30" /> {candidate.phone}</span>
                        )}
                        {candidate.linkedinUrl && (
                            <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                                <IconLinkedin className="w-3.5 h-3.5" /> LinkedIn
                            </a>
                        )}
                    </div>

                    {candidate.technologies && candidate.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {candidate.technologies.map((tech, idx) => (
                                <span key={idx} className="flex items-center gap-1 bg-black/[0.02] border border-black/5 rounded-full px-2 py-0.5 text-[10px] text-atlas-dark/60">
                                    <IconWrench className="w-2.5 h-2.5" /> {tech}
                                </span>
                            ))}
                        </div>
                    )}

                    {!enrichment && candidate.rationale && (
                        <p className="text-xs text-atlas-dark/35 italic mb-2">"{candidate.rationale}"</p>
                    )}

                    <DecisionMakerSection candidate={candidate} />

                    {enrichment?.company.observations && (
                        <div className="mt-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                            <p className="text-[10px] tracking-wider font-bold uppercase text-indigo-500 mb-1 flex items-center gap-1">
                                <IconSparkle className="w-3 h-3" /> Resumo do Enriquecimento
                            </p>
                            <p className="text-xs text-atlas-dark/60 leading-relaxed">{enrichment.company.observations}</p>
                        </div>
                    )}

                    {enrichment?.apolloContacts && enrichment.apolloContacts.length > 0 && (
                        <div className="mt-3">
                            <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-2 flex items-center gap-1">
                                <IconContacts className="w-3 h-3" /> Decisores Descobertos (Apollo)
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {enrichment.apolloContacts.map((contact, idx) => (
                                    <span key={idx} className="bg-black/[0.02] border border-black/5 rounded-full px-3 py-1 text-xs text-atlas-dark/70 flex items-center gap-1">
                                        <strong>{contact.name}</strong>
                                        {contact.title && <span className="text-atlas-dark/40">· {contact.title}</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                {promoted ? (
                    <span className="flex items-center gap-2 text-green-700 font-bold text-sm shrink-0"><IconCheck className="w-4 h-4" /> No CRM</span>
                ) : (
                    <Button
                        variant="glass"
                        className="rounded-full hover:bg-atlas-orange hover:text-white w-full sm:w-auto justify-center shrink-0"
                        onClick={onPromote}
                        disabled={isPromoting}
                    >
                        {isPromoting ? <IconSpinner className="w-4 h-4 mr-2 animate-spin" /> : <IconShieldCheck className="w-4 h-4 mr-2" />}
                        {isPromoting ? 'Enriquecendo...' : 'Enriquecer e Adicionar'}
                    </Button>
                )}
            </div>
        </Card>
    );
}
