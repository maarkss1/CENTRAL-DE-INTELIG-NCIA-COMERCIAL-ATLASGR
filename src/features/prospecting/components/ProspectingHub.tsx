import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Landmark, Sparkles, Camera } from 'lucide-react';
import { api } from '../../../lib/api';
import type { CnpjLookupResult, FitScoreResult } from '../services/enrichment.service';
import type { ProspectCandidate, ProspectCriteria, DiscoverResult } from '../services/prospecting.service';
import { SEGMENTO_OPTIONS, TOTALTRAC_SEGMENTO_OPTIONS, QUANTIDADE_OPTIONS, ESTADO_OPTIONS } from '../../../shared/constants/icp-options';
import { useBrand } from '../../../contexts/BrandContext';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { GamificationWidget } from '../../../components/ui/GamificationWidget';
import { CnpjSearchPanel } from './prospecting-hub/CnpjSearchPanel';
import { DiscoveryFilterPanel } from './prospecting-hub/DiscoveryFilterPanel';
import { DiscoveryResultsPanel } from './prospecting-hub/DiscoveryResultsPanel';
import { OcrCapturePanel } from './prospecting-hub/OcrCapturePanel';

export { DecisionMakerSearch } from './prospecting-hub/DecisionMakerSearch';

type HubTab = 'cnpj' | 'discovery' | 'ocr';

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
    const [apolloError, setApolloError] = useState<string | null>(null);
    const [cities, setCities] = useState<string[]>([]);
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
                    // autoEnrich:true dispara a mesma cadeia de enriquecimento (CNPJ, domínio/e-mail,
                    // Google Places, notícias, Apollo, icebreaker por IA) do botão "Enriquecer" de
                    // lead/empresa — precisa da mesma folga de 60s do timeout padrão de 15s.
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
                    }, { timeoutMs: 60_000 });
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

    // --- "Não é esse perfil": marca o candidato como rejeitado (exclui de buscas futuras) e some da lista ---
    const [rejectingKey, setRejectingKey] = useState<string | null>(null);
    const [rejectedKeys, setRejectedKeys] = useState<Set<string>>(new Set());
    const rejectCandidate = async (candidate: ProspectCandidate, idx: number) => {
        const key = `discovery-${idx}`;
        setRejectingKey(key);
        try {
            await api.post('/api/prospecting/reject', {
                tradeName: candidate.tradeName,
                website: candidate.website,
            });
            setRejectedKeys((prev) => new Set(prev).add(key));
        } catch (error) {
            setDiscoverError(getErrorMessage(error, 'Falha ao descartar candidato'));
        } finally {
            setRejectingKey(null);
        }
    };

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
        .filter(({ i }) => !rejectedKeys.has(`discovery-${i}`))
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
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Prospects');
        worksheet.columns = [
            { header: 'Nome Fantasia',  key: 'tradeName',    width: 30 },
            { header: 'Razão Social',   key: 'legalName',    width: 30 },
            { header: 'CNPJ',           key: 'cnpj',         width: 20 },
            { header: 'Segmento',       key: 'segment',      width: 20 },
            { header: 'Porte',          key: 'size',         width: 12 },
            { header: 'Localização',    key: 'location',     width: 25 },
            { header: 'Website',        key: 'website',      width: 30 },
            { header: 'Emails',         key: 'emails',       width: 35 },
            { header: 'Telefones',      key: 'phone',        width: 20 },
            { header: 'LinkedIn',       key: 'linkedin',     width: 35 },
            { header: 'Decisores',      key: 'decisores',    width: 60 },
        ];
        candidates.forEach(c => {
            worksheet.addRow({
                tradeName:  c.tradeName,
                legalName:  c.legalNameGuess || c.tradeName,
                cnpj:       c.cnpjGuess || '',
                segment:    c.segment,
                size:       c.size,
                location:   c.location,
                website:    c.website || '',
                emails:     c.emails ? c.emails.join(', ') : '',
                phone:      c.phone || '',
                linkedin:   c.linkedinUrl || '',
                decisores:  c.apolloContacts
                    ? c.apolloContacts.map((d) => `${d.name} (${d.title}) - ${d.email || ''}`).join(' | ')
                    : '',
            });
        });
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${brandInfo.name}_Prospects_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };


    const handleCnpjLookup = async () => {
        setCnpjLoading(true);
        setCnpjError(null);
        setCnpjResult(null);
        try {
            // A BrasilAPI (Receita Federal) faz retry interno (2 tentativas x 8s) quando está lenta —
            // pode passar dos 15s padrão mesmo sem falhar de verdade.
            const result = await api.post<CnpjLookupResult>('/api/prospecting/enrich-cnpj', { cnpj: cnpjInput }, { timeoutMs: 30_000 });
            setCnpjResult(result);
        } catch (error) {
            setCnpjError(getErrorMessage(error, 'Falha ao consultar CNPJ'));
        } finally {
            setCnpjLoading(false);
        }
    };

    // Página atual do ranking da Apollo — "Buscar mais resultados" avança isso em vez de repetir o
    // topo do ranking; uma busca nova (handleDiscover) sempre volta pra página 1.
    const [discoveryPage, setDiscoveryPage] = useState(1);

    const handleDiscover = async (opts?: { append?: boolean }) => {
        const append = opts?.append ?? false;
        const page = append ? discoveryPage + 1 : 1;
        setIsSearching(true);
        setDiscoverError(null);
        setApolloError(null);
        if (!append) {
            setCandidates([]);
            setRejectedKeys(new Set());
        }
        setLoadingStepIdx(0);
        const interval = setInterval(() => {
            setLoadingStepIdx((prev) => Math.min(prev + 1, loadingSteps.length - 1));
        }, 800);
        try {
            // Busca real encadeia Google Places/Nominatim + Apollo (organizações e, opcionalmente,
            // decisores) + heurísticas de CNPJ — o timeout padrão de 15s (pensado pra CRUD simples)
            // matava a requisição no cliente antes do backend terminar, mesmo quando cada chamada
            // individual (inclusive o Apollo) respondia rápido isoladamente.
            const result = await api.post<DiscoverResult>('/api/prospecting/discover', { ...criteria, pagina: page }, { timeoutMs: 45_000 });
            if (append) {
                // Defesa extra além da exclusão do backend: garante que a mesma empresa não apareça
                // duas vezes na lista mesmo se a Apollo devolver alguma sobreposição entre páginas.
                setCandidates((prev) => {
                    const existing = new Set(prev.map((c) => c.tradeName.trim().toLowerCase()));
                    return [...prev, ...result.candidates.filter((c) => !existing.has(c.tradeName.trim().toLowerCase()))];
                });
            } else {
                setCandidates(result.candidates);
            }
            setDiscoveryPage(page);
            setApolloError(result.apolloError || null);
        } catch (error) {
            setDiscoverError(getErrorMessage(error, 'Falha ao buscar leads'));
        } finally {
            clearInterval(interval);
            setIsSearching(false);
        }
    };

    const searchWebInstead = (query: string) => {
        setCriteria((prev) => ({ ...prev, nomeEmpresa: query, quantidade: 5 }));
        setTab('discovery');
        setTimeout(() => {
            const btn = document.getElementById('btn-discover');
            if (btn) btn.click();
        }, 100);
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
        // Defesa em profundidade: o botão individual já fica desabilitado durante uma promoção em
        // massa (ver DiscoveryResultsPanel), mas um clique disparado antes do re-render aplicar o
        // disabled ainda cairia aqui — sem este guard, isso duplicava a Company/Lead criada pela
        // promoção em massa do mesmo candidato (check-then-act não atômico em promoteToCrm).
        if (isSavingBatch) return;
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
        <div className="flex-1 overflow-y-auto bg-bg p-6 sm:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 space-y-4">
                    <h1 className="text-4xl font-black tracking-tight text-ink">
                        {brandInfo.name} <span className={`text-transparent bg-clip-text bg-gradient-to-r ${accent.gradient}`}>Prospect</span> <Sparkles className={`inline-block ${accent.text} -mt-1 ml-1`} size={28} />
                    </h1>
                    <p className="text-ink-2 text-sm font-medium">Motor de enriquecimento autônomo com IA para capturar leads corporativos de altíssimo nível.</p>
                    <GamificationWidget />
                </motion.div>

                <div className="flex gap-3 bg-surface/75 backdrop-blur-xl p-2 rounded-2xl border border-line shadow-card w-fit relative z-10">
                    <button
                        onClick={() => setTab('cnpj')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-[2rem] font-bold text-sm transition-all duration-300 ${tab === 'cnpj' ? 'bg-ink text-white shadow-sm scale-100' : 'text-ink-2 hover:bg-surface-2/50 scale-95 hover:scale-100'}`}
                    >
                        <Landmark size={18} /> Busca Direta (CNPJ/Nome)
                    </button>
                    <button
                        onClick={() => setTab('discovery')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${tab === 'discovery' ? 'bg-brand text-white shadow-sm scale-100' : 'text-ink-2 hover:bg-surface-2/50 scale-95 hover:scale-100'}`}
                    >
                        <Database size={18} /> Radar Discovery (Fontes abertas)
                    </button>
                    <button
                        onClick={() => setTab('ocr')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${tab === 'ocr' ? 'bg-info-base text-white shadow-sm scale-100' : 'text-ink-2 hover:bg-surface-2/50 scale-95 hover:scale-100'}`}
                    >
                        <Camera size={18} /> Cadastrar por Foto (OCR)
                    </button>
                </div>

                {tab === 'cnpj' && (
                    <CnpjSearchPanel
                        cnpjInput={cnpjInput}
                        setCnpjInput={setCnpjInput}
                        cnpjLoading={cnpjLoading}
                        cnpjResult={cnpjResult}
                        cnpjError={cnpjError}
                        onLookup={handleCnpjLookup}
                        onSearchWebInstead={searchWebInstead}
                        promotingKey={promotingKey}
                        onPromoteCnpjResult={promoteCnpjResult}
                        promoted={promoted}
                    />
                )}

                {tab === 'discovery' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                        <DiscoveryFilterPanel
                            criteria={criteria}
                            setCriteria={setCriteria}
                            activeSegments={activeSegments}
                            cities={cities}
                            showAdvanced={showAdvanced}
                            setShowAdvanced={setShowAdvanced}
                            isSearching={isSearching}
                            discoverError={discoverError}
                            onDiscover={handleDiscover}
                        />
                        <DiscoveryResultsPanel
                            candidates={candidates}
                            filteredCandidates={filteredCandidates}
                            isSearching={isSearching}
                            loadingStepIdx={loadingStepIdx}
                            loadingSteps={loadingSteps}
                            resultFilter={resultFilter}
                            setResultFilter={setResultFilter}
                            apolloError={apolloError}
                            isSavingBatch={isSavingBatch}
                            onSaveAll={saveAllCandidatesAsList}
                            onExport={exportToExcel}
                            selectedCandidates={selectedCandidates}
                            toggleSelectAll={toggleSelectAll}
                            toggleSelect={toggleSelect}
                            onBulkSave={bulkSave}
                            onBulkEnrich={bulkEnrich}
                            promotingKey={promotingKey}
                            promoted={promoted}
                            onPromoteCandidate={promoteCandidate}
                            onDiscoverMore={() => handleDiscover({ append: true })}
                            rejectingKey={rejectingKey}
                            onRejectCandidate={rejectCandidate}
                        />
                    </div>
                )}

                {tab === 'ocr' && <OcrCapturePanel />}
            </div>
        </div>
    );
}
