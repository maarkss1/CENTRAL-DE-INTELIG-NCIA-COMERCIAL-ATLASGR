import { motion } from 'framer-motion';
import { Search, Loader2, AlertTriangle, Globe, CheckCircle2, Database, UserPlus } from 'lucide-react';
import type { ProspectCandidate } from '../../services/prospecting.service';
import type { FitScoreResult } from '../../services/enrichment.service';
import { CandidateCard } from './CandidateCard';

interface PromoteResult {
    lead: { id: string };
    fit?: FitScoreResult;
    enrichment?: {
        company: { googleRating?: number; googleReviewsCount?: number; observations?: string };
        apolloContacts?: Array<{ name: string; title: string | null; email: string | null; phone?: string | null; linkedin_url?: string | null }>;
    };
}

export function DiscoveryResultsPanel({
    candidates, filteredCandidates, isSearching, loadingStepIdx, loadingSteps, resultFilter, setResultFilter,
    apolloError, isSavingBatch, onSaveAll, onExport, selectedCandidates, toggleSelectAll, toggleSelect,
    onBulkSave, onBulkEnrich, promotingKey, promoted, onPromoteCandidate,
}: {
    candidates: ProspectCandidate[];
    filteredCandidates: Array<{ c: ProspectCandidate; i: number }>;
    isSearching: boolean;
    loadingStepIdx: number;
    loadingSteps: string[];
    resultFilter: string;
    setResultFilter: (value: string) => void;
    apolloError: string | null;
    isSavingBatch: boolean;
    onSaveAll: () => void;
    onExport: () => void;
    selectedCandidates: Set<number>;
    toggleSelectAll: () => void;
    toggleSelect: (idx: number) => void;
    onBulkSave: () => void;
    onBulkEnrich: () => void;
    promotingKey: string | null;
    promoted: Record<string, PromoteResult>;
    onPromoteCandidate: (candidate: ProspectCandidate, idx: number) => void;
}) {
    return (
        <div className="xl:col-span-8 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <h2 className="font-black text-2xl text-ink">✨ Resultados</h2>
                {candidates.length > 0 && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onSaveAll}
                            disabled={isSavingBatch}
                            className="bg-atlas-orange text-white px-4 py-2 rounded-[2rem] text-xs font-bold hover:bg-orange-600 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            <UserPlus size={14} /> {isSavingBatch ? 'Salvando Lista...' : 'Salvar Lista de Leads'}
                        </button>
                        <button
                            onClick={onExport}
                            className="bg-green-600 text-white px-4 py-2 rounded-[2rem] text-xs font-bold hover:bg-green-700 transition-colors shadow-sm flex items-center gap-2"
                        >
                            <Database size={14} /> Exportar Excel
                        </button>
                        <span className="bg-surface-2 text-ink-2 px-3 py-1 rounded-full text-xs font-bold">🎯 {filteredCandidates.length}/{candidates.length} Candidatos</span>
                    </div>
                )}
            </div>

            {candidates.length > 0 && !isSearching && (
                <div className="relative mb-4">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
                    <input
                        type="text"
                        placeholder="⚡ Filtrar resultados instantaneamente por nome, segmento, cidade..."
                        value={resultFilter}
                        onChange={(e) => setResultFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-surface border border-line rounded-xl text-sm focus:ring-2 focus:ring-atlas-orange/20 focus:border-atlas-orange transition-all outline-none"
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
                <div className="flex-1 bg-surface rounded-2xl border border-line shadow-sm flex flex-col items-center justify-center p-10 min-h-[400px]">
                    <div className="w-24 h-24 relative mb-8">
                        <div className="absolute inset-0 border-4 border-line rounded-full" />
                        <div className="absolute inset-0 border-4 border-atlas-orange rounded-full border-t-transparent animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center text-atlas-orange">
                            <Globe size={32} className="animate-pulse" />
                        </div>
                    </div>
                    <h3 className="font-black text-xl text-ink mb-4 text-center">🌎 Mapeando Mercado...</h3>
                    <div className="space-y-3 w-full max-w-sm">
                        {loadingSteps.map((step, idx) => (
                            <div key={idx} className={`flex items-center gap-3 text-sm font-medium ${idx === loadingStepIdx ? 'text-atlas-orange' : idx < loadingStepIdx ? 'text-ink-2' : 'text-ink opacity-50'}`}>
                                {idx < loadingStepIdx ? <CheckCircle2 size={16} /> : idx === loadingStepIdx ? <Loader2 size={16} className="animate-spin" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                                {step}
                            </div>
                        ))}
                    </div>
                </div>
            ) : candidates.length > 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

                    <div className="flex items-center gap-3 bg-surface p-3 rounded-xl border border-line mb-4">
                        <input type="checkbox" className="rounded border-line text-atlas-orange focus:ring-atlas-orange" checked={selectedCandidates.size > 0 && selectedCandidates.size === filteredCandidates.length} onChange={toggleSelectAll} />
                        <span className="text-xs text-ink-2 font-bold">{selectedCandidates.size} selecionados</span>

                        <div className="h-4 w-px bg-line mx-2" />

                        <button onClick={onBulkSave} disabled={selectedCandidates.size === 0 || isSavingBatch} className="text-[10px] font-bold bg-surface-2 hover:bg-line text-ink px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                            Salvar em Massa
                        </button>
                        <button onClick={onBulkEnrich} disabled={selectedCandidates.size === 0 || isSavingBatch} className="text-[10px] font-bold bg-atlas-orange hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                            Enriquecer em Massa
                        </button>
                    </div>

                    {filteredCandidates.length === 0 && (
                        <div className="bg-surface backdrop-blur-xl rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-2">
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
                                onPromote={() => onPromoteCandidate(c, i)}
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
                <div className="flex-1 bg-surface rounded-2xl border border-dashed border-line flex flex-col items-center justify-center p-10 min-h-[400px]">
                    <div className="bg-surface-2 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                        <Search className="text-ink-2" size={32} />
                    </div>
                    <h3 className="font-black text-xl text-ink mb-2">🔍 Nenhum lead encontrado</h3>
                    <p className="text-sm text-ink-2 text-center max-w-sm">
                        Preencha os critérios de ICP ao lado e busque oportunidades reais via OpenStreetMap e bases públicas, com Apollo opcional.
                    </p>
                </div>
            )}
        </div>
    );
}
