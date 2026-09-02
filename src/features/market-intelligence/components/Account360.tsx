import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card.js';
import { Button } from '../../../components/ui/Button.js';
import { Badge } from '../../../components/ui/Badge.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { Skeleton } from '../../../components/ui/Skeleton.js';
import {
  Building2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Target,
  TrendingUp,
  Zap,
  Users,
  BrainCircuit,
} from 'lucide-react';
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/toast.js';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext.js';
import { VisualOrgChart } from './VisualOrgChart.js';
import { CompanyBranchesView } from './CompanyBranchesView.js';

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

type TabId =
  | 'overview'
  | 'signals'
  | 'decision-makers'
  | 'economic-group'
  | 'crm'
  | 'recommendations';

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
      const data = await api.get<AccountIntelligenceSummary>(
        `/api/market-intelligence/accounts/${id}/intelligence`,
      );
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
      summary:
        latestInference?.total != null
          ? `Score de conta: ${formatScore(latestInference.total)}`
          : undefined,
    });
    return () => clearActiveRecord(account.id);
  }, [intelligence, setActiveRecord, clearActiveRecord]);

  const fetchTab = useCallback(
    async (tab: TabId) => {
      if (tab === 'overview' || !id) return;
      setTabState((prev) => ({
        ...prev,
        [tab]: { loading: true, error: null, result: prev[tab]?.result ?? null },
      }));
      try {
        const result = await api.get<PaginatedResult<Record<string, unknown>>>(
          `/api/market-intelligence/accounts/${id}/${TAB_ENDPOINT[tab]}?page=1&limit=20`,
        );
        setTabState((prev) => ({ ...prev, [tab]: { loading: false, error: null, result } }));
      } catch (err) {
        setTabState((prev) => ({
          ...prev,
          [tab]: {
            loading: false,
            error: err instanceof Error ? err.message : 'Não foi possível carregar esta aba.',
            result: null,
          },
        }));
      }
    },
    [id],
  );

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
      await api.post(
        `/api/market-intelligence/accounts/${id}/recommendations/${recommendationId}/execute`,
      );
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
      toast.error(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar a inteligência desta conta.',
      );
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen space-x-3 text-brand">
        <Loader2 className="w-10 h-10 animate-spin" />
        <span className="text-lg font-medium">Carregando Inteligência...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-critical space-y-4">
        <AlertCircle className="w-12 h-12" />
        <span className="text-xl font-semibold">{error}</span>
        <Button variant="outline" onClick={() => fetchIntelligence()}>
          Tentar Novamente
        </Button>
      </div>
    );
  }

  const currentTab = tabState[activeTab];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-line pb-6 gap-4">
        <div className="flex items-start md:items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="hover:bg-surface-2">
            <ArrowLeft className="w-5 h-5 mr-2" /> Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-ink flex items-center tracking-tight">
              <Building2 className="w-8 h-8 mr-3 text-brand" />
              {intelligence?.account.tradeName || intelligence?.account.legalName || `Conta: ${id}`}
            </h1>
            <p className="text-sm text-ink-2 mt-1 flex items-center">
              <Zap className="w-4 h-4 mr-1" /> Última atualização:{' '}
              {intelligence?.facts?.generatedAt
                ? new Date(intelligence.facts.generatedAt).toLocaleString('pt-BR')
                : 'Não disponível'}
            </p>
          </div>
        </div>
        <Button
          className="bg-brand-active hover:brightness-105 text-white shadow-card"
          disabled={refreshing}
          onClick={handleRefresh}
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <BrainCircuit className="w-4 h-4 mr-2" />
          )}
          {refreshing ? 'Atualizando...' : 'Atualizar Inteligência'}
        </Button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-2 flex items-center">
              <Target className="w-4 h-4 mr-2 text-brand" />
              Account Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink">
              {formatScore(intelligence?.latestInference?.total)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-2 flex items-center">
              <TrendingUp className="w-4 h-4 mr-2 text-brand" />
              ICP / Fit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink">
              {formatScore(intelligence?.latestInference?.fit)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-2 flex items-center">
              <Zap className="w-4 h-4 mr-2 text-brand" />
              Intent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink">
              {formatScore(intelligence?.latestInference?.intent)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-2 flex items-center">
              <Users className="w-4 h-4 mr-2 text-brand" />
              Novos Sinais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink">
              {intelligence?.collections.signals ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="border-b border-line">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`${
                activeTab === tab.id
                  ? 'border-brand-active text-brand-active'
                  : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              {tab.label}
              {tab.id !== 'overview' && tabState[tab.id]?.result ? (
                <span className="ml-2 text-xs text-ink-2">
                  ({tabState[tab.id]?.result?.total ?? 0})
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumo Executivo (IA)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-ink leading-relaxed text-lg">
                {intelligence?.facts?.summary ||
                  'Nenhum resumo de inteligência foi gerado para esta conta ainda.'}
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
              icon={<AlertCircle className="w-8 h-8 text-critical" />}
              title="Não foi possível carregar"
              description={currentTab.error}
            />
            <Button variant="outline" onClick={() => fetchTab(activeTab)}>
              Tentar novamente
            </Button>
          </div>
        )}

        {activeTab === 'decision-makers' && !currentTab?.loading && !currentTab?.error && (
          <VisualOrgChart
            contacts={(currentTab?.result?.items || []).map((i: any) => ({
              id: i.id || i.contactId,
              name: i.name || i.contactName || 'Decisor',
              role: i.title || i.role || i.contactRole,
              seniority: i.seniority,
              email: i.email,
              phone: i.phone,
              whatsapp: i.phone,
              linkedin: i.linkedinUrl || i.linkedin,
              source: i.source,
            }))}
            companyName={intelligence?.account.tradeName || intelligence?.account.legalName}
          />
        )}

        {activeTab === 'economic-group' && !currentTab?.loading && !currentTab?.error && (
          <CompanyBranchesView
            cnpj={(intelligence?.account as any)?.cnpj || ''}
            companyName={intelligence?.account.tradeName || intelligence?.account.legalName || ''}
          />
        )}

        {activeTab !== 'overview' &&
          activeTab !== 'decision-makers' &&
          activeTab !== 'economic-group' &&
          !currentTab?.loading &&
          !currentTab?.error &&
          (currentTab?.result?.items.length ?? 0) === 0 && (
            <EmptyState
              icon={<AlertCircle className="w-8 h-8 text-ink-2" />}
              title="Sem dados"
              description={`Não há registros disponíveis para ${TABS.find((t) => t.id === activeTab)?.label?.toLowerCase()}.`}
            />
          )}

        {activeTab !== 'overview' &&
          activeTab !== 'decision-makers' &&
          activeTab !== 'economic-group' &&
          !currentTab?.loading &&
          !currentTab?.error &&
          (currentTab?.result?.items.length ?? 0) > 0 && (
            <div className="space-y-3">
              {currentTab!.result!.items.map((item, index) => (
                <AccountRecordCard
                  key={(item.id as string | undefined) ?? index}
                  tab={activeTab}
                  item={item}
                  executingId={executingId}
                  onExecute={
                    activeTab === 'recommendations' ? handleExecuteRecommendation : undefined
                  }
                />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

const EXECUTABLE_RECOMMENDATION_STATUSES = new Set(['Pending', 'Approved', 'Failed']);

// CPI (auditoria de qualidade epistêmica): AccountSignal/IntelligenceEvidence gravam evidenceType
// (IntelligenceEvidenceType no schema) desde a Onda 9, mas nenhuma tela mostrava a diferença entre
// um fato confirmado e uma inferência/estimativa — só "Confiança" numérica aparecia em telas
// isoladas (ver TerritoryEconomicSimulator.tsx). Este mapa existe só para as abas "Sinais"/"CRM /
// Histórico" (as únicas cujo item real carrega `evidenceType`), reaproveitando as variantes de
// Badge já existentes (nenhum token novo).
const EVIDENCE_TYPE_META: Record<
  string,
  { label: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'outline' }
> = {
  FACT: { label: 'Fato confirmado', variant: 'success' },
  INFERENCE: { label: 'Inferência', variant: 'info' },
  ESTIMATE: { label: 'Estimativa', variant: 'warning' },
  CONFLICT: { label: 'Conflitante', variant: 'danger' },
  UNKNOWN: { label: 'Desconhecido', variant: 'outline' },
  RECOMMENDATION: { label: 'Recomendação', variant: 'info' },
};

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
  const canExecute =
    tab === 'recommendations' &&
    Boolean(onExecute) &&
    Boolean(recommendationId) &&
    EXECUTABLE_RECOMMENDATION_STATUSES.has(status ?? '');
  const isExecuting = executingId === recommendationId;
  // Só 'signals' e 'crm' carregam evidenceType real (AccountSignal/IntelligenceEvidence) —
  // nas outras abas o campo não existe no item, então o badge simplesmente não aparece.
  const evidenceType =
    tab === 'signals' || tab === 'crm' ? (item.evidenceType as string | undefined) : undefined;
  const evidenceMeta = evidenceType ? EVIDENCE_TYPE_META[evidenceType] : undefined;
  const confidence = typeof item.confidence === 'number' ? item.confidence : null;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div>
          <p className="text-ink font-medium">{title}</p>
          {subtitle && <p className="text-sm text-ink-2 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {evidenceMeta && <Badge variant={evidenceMeta.variant}>{evidenceMeta.label}</Badge>}
          {confidence != null && (
            <span className="text-xs text-ink-2 whitespace-nowrap">
              {Math.round(confidence * 100)}% confiança
            </span>
          )}
          {status && (
            <span className="text-xs px-2 py-1 rounded-full border border-line text-ink-2 whitespace-nowrap">
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
