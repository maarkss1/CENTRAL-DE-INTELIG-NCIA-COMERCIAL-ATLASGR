import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card.js';
import { Button } from '../../../components/ui/Button.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { Skeleton } from '../../../components/ui/Skeleton.js';
import { Building2, AlertCircle, Loader2, ArrowLeft, Target, TrendingUp, Zap, Users, BrainCircuit } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/toast.js';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext.js';

interface AccountIntelligenceSummary {
    account: { id: string; legalName: string; tradeName: string | null };
    state: 'available' | 'not_refreshed';
    facts: { summary: string; generatedAt: string } | null;
    latestInference: {
        total: number | null;
        fit: number | null;
        timing: number | null;
        intent: number | null;
        relationship: number | null;
    } | null;
    collections: {
        signals: number;
        decisionMakers: number;
        relationships: number;
        recommendations: number;
        evidence: number;
    };
}

type TabId = 'overview' | 'signals' | 'decision-makers' | 'economic-group' | 'crm' | 'recommendations';

// Cada aba não-overview lê de um endpoint real de accountIntelligence.routes.ts. "CRM / Histórico"
// usa /evidence (fatos com proveniência CRM.Company) — não existe endpoint de timeline dedicado.
const TAB_ENDPOINT: Record<Exclude<TabId, 'overview'>, string> = {
    signals: 'signals',
    'decision-makers': 'decision-makers',
    'economic-group': 'relationships',
    crm: 'evidence',
    recommendations: 'recommendations',
};

interface PaginatedResult<T> {
    items: T[];
    total: number;
}

interface TabState {
    loading: boolean;
    error: string | null;
    result: PaginatedResult<Record<string, unknown>> | null;
}

const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'signals', label: 'Sinais' },
    { id: 'decision-makers', label: 'Decisores' },
    { id: 'economic-group', label: 'Grupo Econômico' },
    { id: 'crm', label: 'CRM / Histórico' },
    { id: 'recommendations', label: 'Recomendações' },
];

function formatScore(value: number | null | undefined): string {
    return value == null ? 'N/A' : String(Math.round(value));
}

export function Account360() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [intelligence, setIntelligence] = useState<AccountIntelligenceSummary | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [tabState, setTabState] = useState<Partial<Record<TabId, TabState>>>({});
    const [executingId, setExecutingId] = useState<string | null>(null);

    const fetchIntelligence = useCallback(async () => {
        if (!id) return;
        try {
            setLoading(true);
            setError(null);
            const data = await api.get<AccountIntelligenceSummary>(`/api/market-intelligence/accounts/${id}/intelligence`);
            setIntelligence(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao se comunicar com o servidor.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchIntelligence();
    }, [fetchIntelligence]);

    // Torna o copiloto de IA global ciente de qual conta está aberta na tela (Account 360).
    const { setActiveRecord, clearActiveRecord } = useActiveRecord();
    useEffect(() => {
        if (!intelligence) return;
        const { account, latestInference } = intelligence;
        setActiveRecord({
            type: 'company',
            id: account.id,
            label: account.tradeName || account.legalName,
            summary: latestInference?.total != null ? `Score de conta: ${formatScore(latestInference.total)}` : undefined,
        });
        return () => clearActiveRecord(account.id);
    }, [intelligence, setActiveRecord, clearActiveRecord]);

    const fetchTab = useCallback(async (tab: TabId) => {
        if (tab === 'overview' || !id) return;
        setTabState((prev) => ({ ...prev, [tab]: { loading: true, error: null, result: prev[tab]?.result ?? null } }));
        try {
            const result = await api.get<PaginatedResult<Record<string, unknown>>>(
                `/api/market-intelligence/accounts/${id}/${TAB_ENDPOINT[tab]}?page=1&limit=20`,
            );
            setTabState((prev) => ({ ...prev, [tab]: { loading: false, error: null, result } }));
        } catch (err) {
            setTabState((prev) => ({
                ...prev,
                [tab]: { loading: false, error: err instanceof Error ? err.message : 'Não foi possível carregar esta aba.', result: null },
            }));
        }
    }, [id]);

    const handleTabChange = (tab: TabId) => {
        setActiveTab(tab);
        if (tab !== 'overview' && !tabState[tab]) {
            fetchTab(tab);
        }
    };

    const handleExecuteRecommendation = async (recommendationId: string) => {
        if (!id || executingId) return;
        setExecutingId(recommendationId);
        try {
            await api.post(`/api/market-intelligence/accounts/${id}/recommendations/${recommendationId}/execute`);
            toast.success('Recomendação executada.');
            await fetchTab('recommendations');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Não foi possível executar a recomendação.');
        } finally {
            setExecutingId(null);
        }
    };

    const handleRefresh = async () => {
        if (!id || refreshing) return;
        setRefreshing(true);
        try {
            await api.post(`/api/market-intelligence/accounts/${id}/refresh`);
            toast.success('Inteligência da conta atualizada.');
            await fetchIntelligence();
            if (activeTab !== 'overview') await fetchTab(activeTab);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Não foi possível atualizar a inteligência desta conta.');
        } finally {
            setRefreshing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen space-x-3 text-emerald-500">
                <Loader2 className="w-10 h-10 animate-spin" />
                <span className="text-lg font-medium">Carregando Inteligência...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-rose-500 space-y-4">
                <AlertCircle className="w-12 h-12" />
                <span className="text-xl font-semibold">{error}</span>
                <Button variant="outline" onClick={() => fetchIntelligence()}>Tentar Novamente</Button>
            </div>
        );
    }

    const currentTab = tabState[activeTab];

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-6 gap-4">
                <div className="flex items-start md:items-center space-x-4">
                    <Button variant="ghost" onClick={() => navigate(-1)} className="hover:bg-white/5">
                        <ArrowLeft className="w-5 h-5 mr-2" /> Voltar
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center tracking-tight">
                            <Building2 className="w-8 h-8 mr-3 text-emerald-500" />
                            {intelligence?.account.tradeName || intelligence?.account.legalName || `Conta: ${id}`}
                        </h1>
                        <p className="text-sm text-white/50 mt-1 flex items-center">
                            <Zap className="w-4 h-4 mr-1" /> Última atualização: {intelligence?.facts?.generatedAt ? new Date(intelligence.facts.generatedAt).toLocaleString('pt-BR') : 'Não disponível'}
                        </p>
                    </div>
                </div>
                <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                    disabled={refreshing}
                    onClick={handleRefresh}
                >
                    {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
                    {refreshing ? 'Atualizando...' : 'Atualizar Inteligência'}
                </Button>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/70 flex items-center"><Target className="w-4 h-4 mr-2 text-blue-400"/>Account Score</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-white">{formatScore(intelligence?.latestInference?.total)}</div></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/70 flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-emerald-400"/>ICP / Fit</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-white">{formatScore(intelligence?.latestInference?.fit)}</div></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/70 flex items-center"><Zap className="w-4 h-4 mr-2 text-amber-400"/>Intent</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-white">{formatScore(intelligence?.latestInference?.intent)}</div></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/70 flex items-center"><Users className="w-4 h-4 mr-2 text-purple-400"/>Novos Sinais</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-white">{intelligence?.collections.signals ?? 0}</div></CardContent>
                </Card>
            </div>

            <div className="border-b border-white/10">
                <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            aria-current={activeTab === tab.id ? 'page' : undefined}
                            className={`${
                                activeTab === tab.id
                                    ? 'border-emerald-500 text-emerald-400'
                                    : 'border-transparent text-white/60 hover:text-white/80 hover:border-white/30'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            {tab.label}
                            {tab.id !== 'overview' && tabState[tab.id]?.result ? (
                                <span className="ml-2 text-xs text-white/40">({tabState[tab.id]?.result?.total ?? 0})</span>
                            ) : null}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="mt-6">
                {activeTab === 'overview' && (
                    <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                        <CardHeader><CardTitle className="text-lg">Resumo Executivo (IA)</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-white/80 leading-relaxed text-lg">
                                {intelligence?.facts?.summary || 'Nenhum resumo de inteligência foi gerado para esta conta ainda.'}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {activeTab !== 'overview' && currentTab?.loading && (
                    <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                )}

                {activeTab !== 'overview' && !currentTab?.loading && currentTab?.error && (
                    <div className="flex flex-col items-center gap-3 py-10">
                        <EmptyState
                            icon={<AlertCircle className="w-8 h-8 text-rose-400" />}
                            title="Não foi possível carregar"
                            description={currentTab.error}
                        />
                        <Button variant="outline" onClick={() => fetchTab(activeTab)}>Tentar novamente</Button>
                    </div>
                )}

                {activeTab !== 'overview' && !currentTab?.loading && !currentTab?.error && (currentTab?.result?.items.length ?? 0) === 0 && (
                    <EmptyState
                        icon={<AlertCircle className="w-8 h-8 text-amber-400" />}
                        title="Sem dados"
                        description={`Não há registros disponíveis para ${TABS.find((t) => t.id === activeTab)?.label?.toLowerCase()}.`}
                    />
                )}

                {activeTab !== 'overview' && !currentTab?.loading && !currentTab?.error && (currentTab?.result?.items.length ?? 0) > 0 && (
                    <div className="space-y-3">
                        {currentTab!.result!.items.map((item, index) => (
                            <AccountRecordCard
                                key={(item.id as string | undefined) ?? index}
                                tab={activeTab}
                                item={item}
                                executingId={executingId}
                                onExecute={activeTab === 'recommendations' ? handleExecuteRecommendation : undefined}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const EXECUTABLE_RECOMMENDATION_STATUSES = new Set(['Pending', 'Approved', 'Failed']);

function AccountRecordCard({
    tab,
    item,
    executingId,
    onExecute,
}: {
    tab: TabId;
    item: Record<string, unknown>;
    executingId?: string | null;
    onExecute?: (recommendationId: string) => void;
}) {
    const title = pickTitle(tab, item);
    const subtitle = pickSubtitle(tab, item);
    const status = item.status as string | undefined;
    const recommendationId = item.id as string | undefined;
    const canExecute = tab === 'recommendations' && Boolean(onExecute) && Boolean(recommendationId) && EXECUTABLE_RECOMMENDATION_STATUSES.has(status ?? '');
    const isExecuting = executingId === recommendationId;

    return (
        <Card className="border-white/10 bg-white/5">
            <CardContent className="flex items-center justify-between gap-4 py-4">
                <div>
                    <p className="text-white font-medium">{title}</p>
                    {subtitle && <p className="text-sm text-white/50 mt-0.5">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {status && (
                        <span className="text-xs px-2 py-1 rounded-full border border-white/10 text-white/70 whitespace-nowrap">
                            {status}
                        </span>
                    )}
                    {canExecute && (
                        <Button
                            size="sm"
                            disabled={Boolean(executingId)}
                            onClick={() => onExecute!(recommendationId!)}
                        >
                            {isExecuting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                            {isExecuting ? 'Executando...' : 'Executar'}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function pickTitle(tab: TabId, item: Record<string, unknown>): string {
    switch (tab) {
        case 'signals':
            return (item.title as string) || (item.type as string) || 'Sinal';
        case 'decision-makers': {
            const contact = item.contact as Record<string, unknown> | null | undefined;
            return (contact?.name as string) || (item.buyingRole as string) || 'Decisor';
        }
        case 'economic-group': {
            const source = item.sourceCompany as Record<string, unknown> | null | undefined;
            const target = item.targetCompany as Record<string, unknown> | null | undefined;
            const sourceName = (source?.tradeName as string) || (source?.legalName as string) || '?';
            const targetName = (target?.tradeName as string) || (target?.legalName as string) || '?';
            return `${sourceName} → ${targetName}`;
        }
        case 'crm':
            return (item.factKey as string) || 'Evidência';
        case 'recommendations':
            return (item.title as string) || (item.actionType as string) || 'Recomendação';
        default:
            return 'Registro';
    }
}

function pickSubtitle(tab: TabId, item: Record<string, unknown>): string | null {
    switch (tab) {
        case 'signals':
            return (item.description as string) || (item.source as string) || null;
        case 'decision-makers':
            return (item.department as string) || (item.seniority as string) || null;
        case 'economic-group':
            return (item.relationType as string) || null;
        case 'crm':
            return item.value != null ? String(item.value) : (item.source as string) || null;
        case 'recommendations':
            return (item.rationale as string) || null;
        default:
            return null;
    }
}
