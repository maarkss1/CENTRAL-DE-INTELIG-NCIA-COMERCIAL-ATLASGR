import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Timeline, type TimelineItem } from '../../../components/ui/Timeline';
import { toast } from '../../../lib/toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  copilotoIaApi,
  type HandoffSummaryDTO,
  type CopilotoInsightDTO,
  type ObjectionSignal,
  type CompetitorSignal,
  type BuyingSignalItem,
  type ComplaintSignal,
  type PromiseSignal,
  type BlockerSignal,
  type CoachingRubricOutput,
  COACHING_DIMENSION_LABELS,
} from '../copilotoIa.api';

interface ConversationDetailDrawerProps {
  conversationId: string;
  onClose: () => void;
  /** Chamado após aprovar/rejeitar/enviar uma sugestão — a lista de conversas atrás do drawer
   * não precisa refletir a mudança em tempo real, mas o filtro por status pode ficar desatualizado
   * sem isso (ex.: uma conversa some da lista quando o usuário filtra por "com sugestão pendente"
   * — hoje não existe esse filtro, mas o refetch mantém o hábito correto para quando existir). */
  onChanged: () => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function scoreColorClass(score: number): string {
  if (score >= 70) return 'text-success';
  if (score >= 40) return 'text-warning';
  return 'text-danger';
}

export function ConversationDetailDrawer({
  conversationId,
  onClose,
  onChanged,
}: ConversationDetailDrawerProps) {
  const { currentUser } = useAuth();
  const canManage = !!currentUser && ['ADMIN', 'GESTOR'].includes(currentUser.role);

  const [handoff, setHandoff] = useState<HandoffSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);
  const [suggestionActionId, setSuggestionActionId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    copilotoIaApi
      .getHandoff(conversationId)
      .then(setHandoff)
      .catch(() => setError('Não foi possível carregar o detalhe desta conversa.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const transcriptItems: TimelineItem[] = useMemo(() => {
    if (!handoff) return [];
    return handoff.conversation.transcriptSegments.map((segment) => ({
      id: segment.id,
      title: segment.speakerLabel || 'Fala',
      description: segment.text,
      timestamp: formatMs(segment.startMs),
      type: 'note' as const,
    }));
  }, [handoff]);

  const evidenceTextFor = (insight: CopilotoInsightDTO): string[] => {
    if (!handoff) return [];
    const ids = new Set(insight.evidenceSegmentIds);
    return handoff.conversation.transcriptSegments
      .filter((segment) => ids.has(segment.id))
      .map((segment) => segment.text);
  };

  const handleSuggestionAction = async (
    action: 'approve' | 'reject' | 'writeback',
    suggestionId: string,
  ) => {
    setSuggestionActionId(suggestionId);
    try {
      if (action === 'approve') await copilotoIaApi.approveSuggestion(suggestionId);
      if (action === 'reject') await copilotoIaApi.rejectSuggestion(suggestionId);
      if (action === 'writeback') await copilotoIaApi.writebackSuggestion(suggestionId);
      toast.success(
        action === 'approve'
          ? 'Sugestão aprovada.'
          : action === 'reject'
            ? 'Sugestão rejeitada.'
            : 'Envio ao Bitrix24 disparado.',
      );
      load();
      onChanged();
    } catch {
      toast.error('Não foi possível concluir a ação. Tente novamente.');
    } finally {
      setSuggestionActionId(null);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={handoff?.conversation.title || 'Detalhe da conversa'}
      subtitle={handoff ? undefined : 'Carregando...'}
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error || !handoff ? (
        <div className="text-center py-8">
          <p className="text-sm text-danger mb-3">{error || 'Conversa não encontrada.'}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {!handoff.isComplete && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="text-xs text-ink-2 space-y-0.5">
                <p className="font-semibold text-ink">Processamento ainda incompleto</p>
                {handoff.missingParts.map((part) => (
                  <p key={part}>{part}</p>
                ))}
              </div>
            </div>
          )}

          {handoff.summary && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                Resumo executivo
              </h3>
              <div className="glass-card p-4 rounded-xl border border-line space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink leading-relaxed">{handoff.summary.executiveSummary}</p>
                  <Badge
                    variant={
                      handoff.summary.sentimentScore === 'Muito Positivo' ||
                      handoff.summary.sentimentScore === 'Positivo'
                        ? 'success'
                        : handoff.summary.sentimentScore === 'Negativo'
                          ? 'danger'
                          : 'default'
                    }
                    className="shrink-0"
                  >
                    {handoff.summary.sentimentScore}
                  </Badge>
                </div>
                {handoff.summary.actionItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-2 mb-1">Próximos passos</p>
                    <ul className="space-y-1 text-ink-2 text-xs">
                      {handoff.summary.actionItems.map((item, i) => (
                        <li key={i}>
                          <span className="text-ink font-medium">{item.assignee}:</span>{' '}
                          {item.description}
                          {item.deadlineDays != null && ` (em ${item.deadlineDays}d)`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {handoff.latestDealHealth && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                Deal Health Score
              </h3>
              <div className="glass-card p-4 rounded-xl border border-line space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span
                    className={`text-3xl font-black font-display ${scoreColorClass(handoff.latestDealHealth.score)}`}
                  >
                    {handoff.latestDealHealth.score}
                  </span>
                  <span className="text-xs text-ink-2">/ 100 — sobre esta conversa</span>
                </div>
                {handoff.latestDealHealth.forecastProbabilityAi != null && (
                  <div className="text-xs text-ink-2 space-y-1 border-t border-line pt-2">
                    <p className="font-semibold text-ink">
                      Forecast IA (complementar ao CRM):{' '}
                      {handoff.latestDealHealth.forecastProbabilityAi}%
                    </p>
                    {handoff.latestDealHealth.forecastReasons.map((reason, i) => (
                      <p key={i}>{reason}</p>
                    ))}
                  </div>
                )}
                {handoff.latestDealHealth.churnRiskScore != null && (
                  <div className="flex items-center gap-2 text-xs border-t border-line pt-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-ink-2" />
                    <span className="text-ink-2">
                      Risco de churn: {handoff.latestDealHealth.churnRiskScore}/100
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {handoff.coachingEvaluation && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                Coaching (nota geral: {handoff.coachingEvaluation.overallScore}/100)
              </h3>
              <div className="glass-card p-4 rounded-xl border border-line grid grid-cols-1 gap-2 text-xs">
                {Object.entries(handoff.coachingEvaluation.rubricJson as CoachingRubricOutput).map(
                  ([key, dimension]) => (
                    <div key={key} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-ink font-medium">
                          {COACHING_DIMENSION_LABELS[key as keyof CoachingRubricOutput]}
                        </p>
                        <p className="text-ink-2">{dimension.evidence}</p>
                      </div>
                      <Badge
                        variant={
                          dimension.score >= 7
                            ? 'success'
                            : dimension.score >= 4
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {dimension.score}/10
                      </Badge>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          <InsightGroup
            title="Objeções"
            insights={handoff.objections}
            expandedId={expandedInsightId}
            onToggle={setExpandedInsightId}
            evidenceFor={evidenceTextFor}
            render={(v: ObjectionSignal) => (
              <>
                <span>{v.text}</span>
                <Badge variant={v.resolved ? 'success' : 'warning'}>
                  {v.resolved ? 'Resolvida' : 'Em aberto'}
                </Badge>
              </>
            )}
          />
          <InsightGroup
            title="Concorrentes citados"
            insights={handoff.competitors}
            expandedId={expandedInsightId}
            onToggle={setExpandedInsightId}
            evidenceFor={evidenceTextFor}
            render={(v: CompetitorSignal) => (
              <>
                <span className="font-medium text-ink">{v.name}</span>
                <span className="text-ink-2">{v.context}</span>
              </>
            )}
          />
          <InsightGroup
            title="Sinais de compra"
            insights={handoff.buyingSignals}
            expandedId={expandedInsightId}
            onToggle={setExpandedInsightId}
            evidenceFor={evidenceTextFor}
            render={(v: BuyingSignalItem) => (
              <>
                <span>{v.text}</span>
                <Badge
                  variant={
                    v.strength === 'alta'
                      ? 'success'
                      : v.strength === 'media'
                        ? 'warning'
                        : 'outline'
                  }
                >
                  {v.strength}
                </Badge>
              </>
            )}
          />
          <InsightGroup
            title="Reclamações"
            insights={handoff.complaints}
            expandedId={expandedInsightId}
            onToggle={setExpandedInsightId}
            evidenceFor={evidenceTextFor}
            render={(v: ComplaintSignal) => (
              <>
                <span>{v.text}</span>
                <Badge
                  variant={
                    v.severity === 'alta'
                      ? 'danger'
                      : v.severity === 'media'
                        ? 'warning'
                        : 'outline'
                  }
                >
                  {v.severity}
                </Badge>
              </>
            )}
          />
          <InsightGroup
            title="Promessas feitas"
            insights={handoff.promises}
            expandedId={expandedInsightId}
            onToggle={setExpandedInsightId}
            evidenceFor={evidenceTextFor}
            render={(v: PromiseSignal) => (
              <>
                <span>{v.text}</span>
                <Badge variant="outline">{v.owner}</Badge>
              </>
            )}
          />
          <InsightGroup
            title="Bloqueios"
            insights={handoff.blockers}
            expandedId={expandedInsightId}
            onToggle={setExpandedInsightId}
            evidenceFor={evidenceTextFor}
            render={(v: BlockerSignal) => <span>{v.text}</span>}
          />

          {handoff.conversation.crmFieldSuggestions.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                Sugestões de campo de CRM
              </h3>
              <div className="space-y-2">
                {handoff.conversation.crmFieldSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="glass-card p-3 rounded-xl border border-line text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-ink font-semibold">
                        {suggestion.fieldCode}
                      </span>
                      <Badge
                        variant={
                          suggestion.status === 'WRITTEN_BACK'
                            ? 'success'
                            : suggestion.status === 'FAILED'
                              ? 'danger'
                              : suggestion.status === 'REJECTED'
                                ? 'outline'
                                : suggestion.status === 'APPROVED'
                                  ? 'info'
                                  : 'warning'
                        }
                      >
                        {suggestion.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-ink-2 line-through">
                        {suggestion.previousValue || '(vazio)'}
                      </span>
                      <span className="text-ink-2">→</span>
                      <span className="text-ink font-medium">{suggestion.suggestedValue}</span>
                    </div>
                    {suggestion.writebackError && (
                      <p className="text-danger">{suggestion.writebackError}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {suggestion.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={suggestionActionId === suggestion.id}
                            onClick={() => handleSuggestionAction('approve', suggestion.id)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={suggestionActionId === suggestion.id}
                            onClick={() => handleSuggestionAction('reject', suggestion.id)}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Rejeitar
                          </Button>
                        </>
                      )}
                      {canManage &&
                        (suggestion.status === 'APPROVED' || suggestion.status === 'FAILED') && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={suggestionActionId === suggestion.id}
                            onClick={() => handleSuggestionAction('writeback', suggestion.id)}
                          >
                            <Send className="w-3.5 h-3.5 mr-1" /> Enviar ao Bitrix24
                          </Button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {transcriptItems.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">Transcrição</h3>
              <Timeline items={transcriptItems} emptyMessage="Sem transcrição registrada." />
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

function InsightGroup<T>({
  title,
  insights,
  render,
  expandedId,
  onToggle,
  evidenceFor,
}: {
  title: string;
  insights: CopilotoInsightDTO[];
  render: (value: T) => ReactNode;
  expandedId: string | null;
  onToggle: (id: string | null) => void;
  evidenceFor: (insight: CopilotoInsightDTO) => string[];
}) {
  if (insights.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5">
        {title.includes('compra') ? (
          <TrendingUp className="w-3.5 h-3.5 text-success" />
        ) : title.includes('Bloqueios') || title.includes('Reclamações') ? (
          <TrendingDown className="w-3.5 h-3.5 text-danger" />
        ) : null}
        {title}
      </h3>
      <ul className="space-y-1.5">
        {insights.map((insight) => {
          const isExpanded = expandedId === insight.id;
          const evidence = evidenceFor(insight);
          return (
            <li key={insight.id}>
              <button
                type="button"
                onClick={() => onToggle(isExpanded ? null : insight.id)}
                className="w-full flex items-center justify-between gap-2 glass-card px-3 py-2 rounded-lg border border-line text-xs text-left hover:border-brand/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {render(insight.valueJson as T)}
              </button>
              {isExpanded && evidence.length > 0 && (
                <div className="mt-1 ml-3 pl-3 border-l-2 border-line text-[11px] text-ink-2 italic space-y-1">
                  {evidence.map((text, i) => (
                    <p key={i}>&ldquo;{text}&rdquo;</p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
