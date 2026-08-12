import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, AlertTriangle, Pencil, MonitorPlay } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { KpiTile } from './KpiTile';
import { AlertsPanel } from './AlertsPanel';
import { GoalEditorDialog } from './GoalEditorDialog';
import { DealDrillDownDrawer, type DrillDownQuery } from './DealDrillDownDrawer';
import { AiExecutiveSummaryCard } from './AiExecutiveSummaryCard';
import { GoalCountdownOverlay } from './GoalCountdownOverlay';
import {
    commercialIntelligenceApi, formatCurrency, formatPercent, formatMultiple,
    type CommercialFilter, type ExecutiveOverview, type ExecutiveAlert, type LeadingIndicatorsReport,
    type PerformanceMetrics, type PipelineCreation
} from '../commercialIntelligence.api';

interface ExecutiveOverviewTabProps {
    filter: CommercialFilter;
}

export function ExecutiveOverviewTab({ filter }: ExecutiveOverviewTabProps) {
    const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
    const [alerts, setAlerts] = useState<ExecutiveAlert[]>([]);
    const [indicators, setIndicators] = useState<LeadingIndicatorsReport | null>(null);
    const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
    const [creation, setCreation] = useState<PipelineCreation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [goalDialogOpen, setGoalDialogOpen] = useState(false);
    const [drillDown, setDrillDown] = useState<DrillDownQuery | null>(null);
    const [showTvMode, setShowTvMode] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [overviewData, alertsData, indicatorsData, performanceData, creationData] = await Promise.all([
                commercialIntelligenceApi.overview(filter),
                commercialIntelligenceApi.alerts(filter),
                commercialIntelligenceApi.leadingIndicators(),
                commercialIntelligenceApi.performance(filter),
                commercialIntelligenceApi.pipelineCreation(filter)
            ]);
            setOverview(overviewData);
            setAlerts(alertsData);
            setIndicators(indicatorsData);
            setPerformance(performanceData);
            setCreation(creationData);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { void load(); }, [load]);

    if (loading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 text-sm text-[#d03b3b] py-6">
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
                    <p className="text-[11px] text-ink-2">Atualizado em {new Date(overview.dataAsOf).toLocaleString('pt-BR')}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowTvMode(true)}>
                        <MonitorPlay className="w-3.5 h-3.5 mr-1.5 text-brand" /> Modo TV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setGoalDialogOpen(true)}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> {overview.goal ? 'Editar meta' : 'Definir meta'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile label="Meta New MRR" value={overview.goal ? formatCurrency(overview.goal.amount, currency) : 'Não cadastrada'} metricKey="meta_new_mrr" />
                <KpiTile label="Fechado" value={formatCurrency(overview.closedAmount, currency)} hint={`${overview.closedCount} negócio(s)`} tone="good" metricKey="fechado" />
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
            </div>

            {(performance || creation) && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KpiTile 
                        label="Pipeline Criado" 
                        value={creation ? formatCurrency(creation.amount, currency) : '-'} 
                        hint={creation ? `${creation.count} negócio(s)` : undefined}
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
                                    <p className={`text-[10px] ${point.trend === 'up' ? 'text-[#0ca30c]' : point.trend === 'down' ? 'text-[#d03b3b]' : 'text-ink-2'}`}>
                                        {point.trend === 'up' ? '↑' : point.trend === 'down' ? '↓' : '→'} vs. {point.previousWeek} sem. anterior
                                    </p>
                                </div>
                                {i < indicators.indicators.length - 1 && <ArrowRight className="w-4 h-4 text-ink-2 shrink-0" aria-hidden="true" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <AiExecutiveSummaryCard filter={filter} />

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
