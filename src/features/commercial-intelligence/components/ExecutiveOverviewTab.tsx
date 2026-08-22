import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, AlertTriangle, Pencil, MonitorPlay, Download, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { KpiTile } from './KpiTile';
import { AlertsPanel } from './AlertsPanel';
import { FunnelConversionCard } from './FunnelConversionCard';
import { PipelineByStageCard } from './PipelineByStageCard';
import { GoalEditorDialog } from './GoalEditorDialog';
import { DealDrillDownDrawer, type DrillDownQuery } from './DealDrillDownDrawer';
import { ForecastRangeCard } from './ForecastRangeCard';
import { MentorPlaybookCard } from './MentorPlaybookCard';
import { DecisionCenterPanel } from './DecisionCenterPanel';
import { GoalCountdownOverlay } from './GoalCountdownOverlay';
import { toast } from '../../../lib/toast';
import {
    commercialIntelligenceApi, downloadExecutiveExport, formatCurrency, formatPercent, formatMultiple,
    type CommercialFilter, type ExecutiveOverview, type ExecutiveAlert, type LeadingIndicatorsReport,
    type PerformanceMetrics, type PipelineCreation, type CoverageProtectionStatus, type ExportFormat,
    type HistoricalTrendsReport,
} from '../commercialIntelligence.api';

/** Ritmo do "Atualização automática" opcional (desligado por padrão) — regra de performance da
 * constituição: nada roda em background sem o usuário pedir. */
const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

const PROTECTION_STATUS_STYLE: Record<CoverageProtectionStatus, { label: string; className: string }> = {
    saudavel: { label: 'Saudável', className: 'text-[#0ca30c] bg-[#0ca30c]/10 border-[#0ca30c]/20' },
    atencao: { label: 'Atenção', className: 'text-[#b8860b] bg-[#b8860b]/10 border-[#b8860b]/20' },
    critico: { label: 'Crítico', className: 'text-critical bg-critical/10 border-critical/20' },
    sem_dados: { label: 'Sem dados', className: 'text-ink-2 bg-surface-2 border-line' },
};

/** "Proteção 90 dias" (seção 11) — mês do filtro + M+1 + M+2 + M+3, sempre em meses de calendário. */
function CoverageProtectionTable({ entries }: { entries: ExecutiveOverview['coverageProtection'] }) {
    return (
        <Card padding="sm">
            <h3 className="text-sm font-bold text-ink mb-1">Proteção 90 dias</h3>
            <p className="text-[11px] text-ink-2 mb-3">Pipeline elegível por mês de calendário frente à meta daquele mês — não confundir com Pipeline Total.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                    <thead>
                        <tr className="text-ink-2 border-b border-line">
                            <th className="text-left font-semibold py-1.5">Período</th>
                            <th className="text-right font-semibold py-1.5">Meta</th>
                            <th className="text-right font-semibold py-1.5">Pipeline Elegível</th>
                            <th className="text-right font-semibold py-1.5">Gap</th>
                            <th className="text-right font-semibold py-1.5">Coverage</th>
                            <th className="text-right font-semibold py-1.5">Status</th>
                        </tr>
                    </thead>
                    <tbody className="[font-variant-numeric:tabular-nums]">
                        {entries.map((entry) => {
                            const style = PROTECTION_STATUS_STYLE[entry.status];
                            return (
                                <tr key={entry.period} className="border-b border-line last:border-0">
                                    <td className="py-1.5 font-bold text-ink">{entry.label}</td>
                                    <td className="py-1.5 text-right text-ink-2">{entry.goalAmount != null ? formatCurrency(entry.goalAmount) : 'Não cadastrada'}</td>
                                    <td className="py-1.5 text-right text-ink-2">{formatCurrency(entry.pipelineEligible)}</td>
                                    <td className="py-1.5 text-right text-ink-2">{entry.remainingGoal != null ? formatCurrency(entry.remainingGoal) : 'Não disponível'}</td>
                                    <td className="py-1.5 text-right text-ink font-semibold">{formatMultiple(entry.coverage)}</td>
                                    <td className="py-1.5 text-right">
                                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.className}`}>{style.label}</span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

interface ExecutiveOverviewTabProps {
    filter: CommercialFilter;
}

export function ExecutiveOverviewTab({ filter }: ExecutiveOverviewTabProps) {
    const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
    const [alerts, setAlerts] = useState<ExecutiveAlert[]>([]);
    const [indicators, setIndicators] = useState<LeadingIndicatorsReport | null>(null);
    const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
    const [creation, setCreation] = useState<PipelineCreation | null>(null);
    const [trends, setTrends] = useState<HistoricalTrendsReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [goalDialogOpen, setGoalDialogOpen] = useState(false);
    const [drillDown, setDrillDown] = useState<DrillDownQuery | null>(null);
    const [showTvMode, setShowTvMode] = useState(false);
    const [exporting, setExporting] = useState<ExportFormat | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const load = useCallback(async (isBackgroundRefresh = false) => {
        if (isBackgroundRefresh) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            const [overviewData, alertsData, indicatorsData, performanceData, creationData, trendsData] = await Promise.all([
                commercialIntelligenceApi.overview(filter),
                commercialIntelligenceApi.alerts(filter),
                commercialIntelligenceApi.leadingIndicators(),
                commercialIntelligenceApi.performance(filter),
                commercialIntelligenceApi.pipelineCreation(filter),
                commercialIntelligenceApi.trends(filter),
            ]);
            setOverview(overviewData);
            setAlerts(alertsData);
            setIndicators(indicatorsData);
            setPerformance(performanceData);
            setCreation(creationData);
            setTrends(trendsData);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [filter]);

    const handleExport = useCallback(async (format: ExportFormat) => {
        setExporting(format);
        try {
            await downloadExecutiveExport(filter, format);
        } catch (err) {
            toast.error((err as Error).message || 'Falha ao exportar o relatório executivo.');
        } finally {
            setExporting(null);
        }
    }, [filter]);

    useEffect(() => { void load(); }, [load]);

    // Atualização automática opcional (desligada por padrão) — só faz polling quando a pessoa
    // liga explicitamente o toggle; nunca dispara sozinha ao abrir a aba.
    useEffect(() => {
        if (!autoRefresh) return;
        const id = window.setInterval(() => { void load(true); }, AUTO_REFRESH_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [autoRefresh, load]);

    if (loading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 text-sm text-critical py-6">
                <AlertTriangle className="w-4 h-4" /> {error}
                <Button variant="outline" size="sm" onClick={() => void load()}>Tentar de novo</Button>
            </div>
        );
    }

    if (!overview) return null;

    if (overview.isEmpty) {
        return (
            <EmptyState
                title="Nenhum negócio no funil Negócio ainda"
                description="O Comercial Inteligente calcula tudo a partir de negócios reais do funil Negócio (CRM). Crie ou converta o primeiro negócio para ver o cockpit."
            />
        );
    }

    const currency = overview.goal?.currency ?? 'BRL';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold text-ink">Cockpit — {overview.period}</h2>
                    <p className="text-[11px] text-ink-2">
                        {refreshing ? 'Atualizando…' : `Atualizado em ${new Date(overview.dataAsOf).toLocaleString('pt-BR')}`}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant={autoRefresh ? 'secondary' : 'ghost'}
                        size="sm"
                        aria-pressed={autoRefresh}
                        onClick={() => setAutoRefresh((v) => !v)}
                        title="Atualiza o cockpit a cada 3 minutos automaticamente"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                        {autoRefresh ? 'Auto-atualização ligada' : 'Auto-atualização'}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={loading || refreshing} onClick={() => void load()} title="Atualizar agora">
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="sr-only">Atualizar agora</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowTvMode(true)}>
                        <MonitorPlay className="w-3.5 h-3.5 mr-1.5 text-brand" /> Modo TV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setGoalDialogOpen(true)}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> {overview.goal ? 'Editar meta' : 'Definir meta'}
                    </Button>
                    {/*
                      Exportações (Relatório Executivo) — 3 botões simples em vez de um menu
                      dropdown novo: não existe nenhum componente de menu/dropdown reutilizável
                      neste design system ainda (ver `src/components/ui/`), e 3 botões seguem o
                      mesmo padrão já usado nesta barra (Modo TV / Editar meta) sem introduzir um
                      componente novo só para isso — decisão conservadora, documentada aqui.
                    */}
                    <Button variant="outline" size="sm" disabled={exporting === 'csv'} onClick={() => void handleExport('csv')}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> {exporting === 'csv' ? 'Exportando…' : 'CSV'}
                    </Button>
                    <Button variant="outline" size="sm" disabled={exporting === 'json'} onClick={() => void handleExport('json')}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> {exporting === 'json' ? 'Exportando…' : 'JSON'}
                    </Button>
                    <Button variant="outline" size="sm" disabled={exporting === 'html'} onClick={() => void handleExport('html')}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> {exporting === 'html' ? 'Exportando…' : 'Relatório HTML'}
                    </Button>
                </div>
            </div>

            <ForecastRangeCard overview={overview} trends={trends} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MentorPlaybookCard filter={filter} />
                <DecisionCenterPanel filter={filter} onOpenDrillDown={setDrillDown} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile label="Meta New MRR" value={overview.goal ? formatCurrency(overview.goal.amount, currency) : 'Não cadastrada'} metricKey="meta_new_mrr" />
                <KpiTile
                    label="Fechado"
                    value={formatCurrency(overview.closedAmount, currency)}
                    hint={`${overview.closedCount} negócio(s)${overview.previousPeriod ? ` · mês anterior: ${formatCurrency(overview.previousPeriod.closedAmount, currency)}` : ''}`}
                    tone="good"
                    metricKey="fechado"
                />
                <KpiTile label="% da Meta" value={formatPercent(overview.pctOfGoal)} tone={overview.pctOfGoal != null && overview.pctOfGoal >= 100 ? 'good' : undefined} metricKey="pct_meta" />
                <KpiTile
                    label="Commit"
                    value={formatCurrency(overview.commitAmount, currency)}
                    hint={`${overview.commitCount} negócio(s)`}
                    metricKey="commit"
                    onClick={() => setDrillDown({ title: 'Negócios — Commit', tier: 'Commit' })}
                />
                <KpiTile
                    label="Best Case"
                    value={formatCurrency(overview.bestCaseAmount, currency)}
                    hint={`${overview.bestCaseCount} negócio(s)`}
                    metricKey="best_case"
                    onClick={() => setDrillDown({ title: 'Negócios — Best Case', tier: 'BestCase' })}
                />
                <KpiTile label="Forecast" value={formatCurrency(overview.forecastAmount, currency)} metricKey="forecast" />
                <KpiTile
                    label="Gap Forecast"
                    value={overview.gapForecast != null ? formatCurrency(overview.gapForecast, currency) : 'Não disponível'}
                    tone={overview.gapForecast != null ? (overview.gapForecast <= 0 ? 'good' : 'critical') : undefined}
                    metricKey="gap_forecast"
                />
                <KpiTile
                    label="Gap Commit"
                    value={overview.gapCommit != null ? formatCurrency(overview.gapCommit, currency) : 'Não disponível'}
                    tone={overview.gapCommit != null ? (overview.gapCommit <= 0 ? 'good' : undefined) : undefined}
                    metricKey="gap_commit"
                />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile
                    label="Pipeline Total"
                    value={formatCurrency(overview.pipelineTotal, currency)}
                    hint={`${overview.pipelineTotalCount} aberto(s)`}
                    metricKey="pipeline_total"
                    onClick={() => setDrillDown({ title: 'Pipeline Total' })}
                />
                <KpiTile
                    label="Pipeline Elegível"
                    value={formatCurrency(overview.pipelineEligible, currency)}
                    hint={`${overview.pipelineEligibleCount} elegível(is)`}
                    metricKey="pipeline_elegivel"
                />
                <KpiTile label="Coverage do mês" value={formatMultiple(overview.coverageMonth.coverage)} hint={overview.coverageMonth.coverageRecommended != null ? `Recomendado: ${formatMultiple(overview.coverageMonth.coverageRecommended)}` : undefined} metricKey="coverage" />
                <KpiTile label="Coverage 90 dias" value={formatMultiple(overview.coverage90.coverage)} hint={overview.coverage90.coverageRecommended != null ? `Recomendado: ${formatMultiple(overview.coverage90.coverageRecommended)}` : undefined} metricKey="coverage" />
                <KpiTile
                    label="Forecast Confidence"
                    value={formatPercent(overview.forecastConfidence.score)}
                    tone={overview.forecastConfidence.classification === 'saudavel' ? 'good' : overview.forecastConfidence.classification === 'critico' ? 'critical' : undefined}
                    hint={overview.forecastConfidence.sampleSizePenaltyApplied ? `Amostra pequena (${overview.forecastConfidence.sampleSize} negócio(s)) reduz a confiança` : `Amostra: ${overview.forecastConfidence.sampleSize} negócio(s) aberto(s)`}
                    metricKey="forecast_confidence"
                />
            </div>

            {performance && <FunnelConversionCard funnel={performance.funnel} trackingSince={performance.funnelHistoricalTrackingSince} />}

            <CoverageProtectionTable entries={overview.coverageProtection} />

            {performance && <PipelineByStageCard funnel={performance.funnel} currency={currency} />}

            {(performance || creation) && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KpiTile
                        label="Pipeline Criado"
                        value={creation ? formatCurrency(creation.amount, currency) : '-'}
                        hint={creation ? `${creation.count} negócio(s)` : undefined}
                    />
                    <KpiTile
                        label="Ritmo de Criação (pace)"
                        value={creation?.pacePercent != null ? formatPercent(creation.pacePercent) : 'Não disponível'}
                        tone={creation?.pacePercent != null ? (creation.pacePercent >= 100 ? 'good' : 'critical') : undefined}
                        hint={creation && creation.totalBusinessDays > 0 ? `${creation.elapsedBusinessDays}/${creation.totalBusinessDays} dias úteis do mês` : undefined}
                        metricKey="pipeline_creation_pace"
                    />
                    <KpiTile
                        label="Oportunidades Abertas"
                        value={performance?.opportunities.open.toString() || '-'} 
                        hint={performance ? `${performance.opportunities.createdInPeriod} novas no mês` : undefined}
                    />
                    <KpiTile 
                        label="Ticket Médio (Aberto)" 
                        value={performance?.averageTicket.open ? formatCurrency(performance.averageTicket.open, currency) : '-'} 
                    />
                    <KpiTile 
                        label="Win Rate" 
                        value={performance?.winRate != null ? formatPercent(performance.winRate) : '-'} 
                        hint={performance ? `${performance.wonCount} ganho(s) / ${performance.lostCount} perdido(s)` : undefined}
                    />
                    <KpiTile 
                        label="Sales Cycle (Médio)" 
                        value={performance?.salesCycle.meanDays != null ? `${Math.round(performance.salesCycle.meanDays)} dias` : '-'} 
                        hint={performance ? `Mediana: ${performance.salesCycle.medianDays} dias` : undefined}
                    />
                    <KpiTile
                        label="Oportunidades Estagnadas"
                        value={performance?.opportunities.stalled.toString() || '-'}
                        tone={performance && performance.opportunities.stalled > 0 ? 'critical' : 'good'}
                        hint={performance ? `> limite de tempo na etapa` : undefined}
                    />
                </div>
            )}

            {indicators && (
                <div>
                    <h2 className="text-sm font-bold text-ink px-1 mb-2">Leading Indicators — semana atual</h2>
                    <div className="flex flex-wrap items-stretch gap-2 overflow-x-auto pb-1">
                        {indicators.indicators.map((point, i) => (
                            <div key={point.label} className="flex items-center gap-2 shrink-0">
                                <div className="rounded-xl border border-line bg-surface px-3 py-2 min-w-[128px]">
                                    <p className="text-[10px] uppercase tracking-wide text-ink-2 font-semibold">{point.label}</p>
                                    <p className="text-lg font-black text-ink [font-variant-numeric:tabular-nums]">{point.current}</p>
                                    <p className={`text-[10px] ${point.trend === 'up' ? 'text-[#0ca30c]' : point.trend === 'down' ? 'text-critical' : 'text-ink-2'}`}>
                                        {point.trend === 'up' ? '↑' : point.trend === 'down' ? '↓' : '→'} vs. {point.previousWeek} sem. anterior
                                    </p>
                                </div>
                                {i < indicators.indicators.length - 1 && <ArrowRight className="w-4 h-4 text-ink-2 shrink-0" aria-hidden="true" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <AlertsPanel alerts={alerts} loading={false} />

            <GoalEditorDialog
                isOpen={goalDialogOpen}
                onClose={() => setGoalDialogOpen(false)}
                period={filter.month}
                currentGoal={overview.goal}
                onSaved={() => void load()}
            />
            <DealDrillDownDrawer filter={filter} query={drillDown} onClose={() => setDrillDown(null)} />
            
            <GoalCountdownOverlay 
                isOpen={showTvMode}
                onClose={() => setShowTvMode(false)}
                period={overview.period}
                goalAmount={overview.goal?.amount ?? null}
                closedAmount={overview.closedAmount}
                currency={currency}
            />
        </div>
    );
}
