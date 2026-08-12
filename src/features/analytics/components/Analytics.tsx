import { useCallback, useEffect, useState } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, LabelList,
} from 'recharts';
import { BarChart3, AlertTriangle, Loader2, RefreshCw, Table2, Download } from 'lucide-react';
import { motion } from 'framer-motion';

import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
    analyticsApi, formatMonthLabel, PERIOD_OPTIONS,
    type AnalyticsDashboard,
} from '../analytics.api';
import { SINGLE, INK, tooltipStyle } from '../../../shared/constants/chartPalette';
import { HeatmapWidget, AgentPerformanceWidget, LostReasonsWidget, TmqTile } from './DashboardExtensions';

/**
 * Paleta validada com o script do guia de data-viz contra a superfície escura dos cards
 * (#0a1022, que é o slate-900/60 sobre slate-950). SINGLE/INK/tooltipStyle são compartilhados
 * com Billing.tsx via shared/constants/chartPalette — ver esse arquivo para o racional completo.
 *
 * - SERIES: slots 1–3 do tema categórico. Passa todos os pares em CVD (pior ΔE 9.4) e visão
 *   normal (pior ΔE 20.9). Usada só no gráfico de linhas, que é o único com múltiplas séries.
 * - FUNNEL_RAMP: rampa ordinal de um único tom (azul), com ΔL >= 0.06 entre passos. O funil tem
 *   categorias ordenadas, então leva rampa; os demais gráficos comparam uma medida só e por isso
 *   usam UMA cor — colorir barra por barra seria duplicar o comprimento em matiz.
 */
const SERIES = {
    created: '#3987e5',
    won: '#199e70',
    lost: '#d95926',
} as const;

const FUNNEL_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];

function StatTile({ label, value, hint, tone }: {
    label: string; value: string; hint?: string; tone?: 'good' | 'critical';
}) {
    const toneClass = tone === 'good' ? 'text-[#0ca30c]' : tone === 'critical' ? 'text-[#d03b3b]' : 'text-ink';
    return (
        <Card variant="stat" padding="sm">
            <p className="text-[11px] uppercase tracking-wide text-ink-2 font-semibold">{label}</p>
            {/* Figuras proporcionais (sem tabular-nums) em número de destaque, conforme o guia. */}
            <p className={`text-2xl font-black mt-1 ${toneClass}`}>{value}</p>
            {hint && <p className="text-[11px] text-ink-2 mt-0.5">{hint}</p>}
        </Card>
    );
}

/** Tabela-gêmea de um gráfico: garante que nenhum valor dependa só de cor ou de tooltip. */
function TableTwin({ open, rows, headers }: {
    open: boolean; headers: string[]; rows: Array<Array<string | number>>;
}) {
    if (!open) return null;
    return (
        <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-ink-2 border-b border-line">
                        {headers.map((h) => <th key={h} className="text-left font-semibold py-1.5 pr-4">{h}</th>)}
                    </tr>
                </thead>
                <tbody className="text-ink-2 [font-variant-numeric:tabular-nums]">
                    {rows.map((row, i) => (
                        <tr key={i} className="border-b border-line">
                            {row.map((cell, j) => <td key={j} className="py-1.5 pr-4">{cell}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ChartCard({ title, subtitle, children, tableHeaders, tableRows }: {
    title: string; subtitle?: string; children: React.ReactNode;
    tableHeaders: string[]; tableRows: Array<Array<string | number>>;
}) {
    const [showTable, setShowTable] = useState(false);
    return (
        <Card padding="sm">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h3 className="text-sm font-bold text-ink">{title}</h3>
                    {subtitle && <p className="text-[11px] text-ink-2">{subtitle}</p>}
                </div>
                <button
                    onClick={() => setShowTable((v) => !v)}
                    aria-pressed={showTable}
                    title="Ver como tabela"
                    className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
                >
                    <Table2 className="w-4 h-4" />
                </button>
            </div>
            {children}
            <TableTwin open={showTable} headers={tableHeaders} rows={tableRows} />
        </Card>
    );
}

export function Analytics() {
    const [months, setMonths] = useState<number>(6);
    const [data, setData] = useState<AnalyticsDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (period: number) => {
        setLoading(true);
        setError(null);
        try {
            setData(await analyticsApi.dashboard(period));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(months); }, [load, months]);

    const monthlyData = (data?.monthly ?? []).map((p) => ({ ...p, label: formatMonthLabel(p.month) }));

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Cabeçalho + filtro único acima de tudo que ele afeta */}
                <div className="flex items-center justify-between gap-4 border-b border-line pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-brand/15 text-brand">
                            <BarChart3 className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-ink">Analytics</h1>
                            <p className="text-sm text-ink-2">Desempenho comercial da operação</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => window.print()} title="Exportar para PDF" className="hidden md:flex gap-2">
                            <Download className="w-4 h-4" />
                            <span>Exportar PDF</span>
                        </Button>
                        <div className="flex items-center rounded-xl border border-line overflow-hidden" role="group" aria-label="Período">
                            {PERIOD_OPTIONS.map((option) => (
                                <button
                                    key={option}
                                    onClick={() => setMonths(option)}
                                    aria-pressed={months === option}
                                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        months === option
                                            ? 'bg-brand text-white'
                                            : 'text-ink-2 hover:text-ink hover:bg-surface-2'
                                    }`}
                                >
                                    {option}m
                                </button>
                            ))}
                        </div>
                        <Button variant="outline" onClick={() => void load(months)} disabled={loading}>
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                {error && (
                    <Card padding="lg" className="text-center">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                        <p className="text-sm text-ink-2 mb-4">{error}</p>
                        <Button variant="outline" onClick={() => void load(months)}>Tentar novamente</Button>
                    </Card>
                )}

                {!data && loading && !error && (
                    <Card padding="lg" className="text-center text-ink-2 text-sm">
                        <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> Carregando métricas…
                    </Card>
                )}

                {data?.isEmpty && !loading && !error && (
                    <Card padding="lg" className="text-center border-dashed">
                        <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                        <h3 className="text-lg font-semibold text-ink mb-1">Ainda não há dados para analisar</h3>
                        <p className="text-sm text-ink-2 max-w-md mx-auto">
                            Assim que a operação registrar empresas, leads e atividades, os indicadores aparecem aqui.
                        </p>
                    </Card>
                )}

                {data && !data.isEmpty && (
                    /* Mantém o render anterior a 60% durante o refetch em vez de piscar esqueleto. */
                    <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: loading ? 0.6 : 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="space-y-6"
                    >
                        {/* Indicadores de topo */}
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                            <StatTile label="Leads em aberto" value={String(data.overview.totalLeads)} />
                            <StatTile
                                label="Conversão"
                                value={`${data.overview.conversionRate.toFixed(1)}%`}
                                hint="ganhos sobre o total já criado"
                            />
                            <StatTile
                                label="Ganhos no mês"
                                value={String(data.overview.closedThisMonth)}
                                tone="good"
                            />
                            <StatTile
                                label="Perdidos no mês"
                                value={String(data.overview.lostThisMonth)}
                                tone={data.overview.lostThisMonth > 0 ? 'critical' : undefined}
                            />
                            <StatTile
                                label="Atividades atrasadas"
                                value={String(data.overview.overdueActivities)}
                                hint={`${data.overview.pendingActivities} pendentes no total`}
                                tone={data.overview.overdueActivities > 0 ? 'critical' : undefined}
                            />
                            <StatTile
                                label="TMQ (dias)"
                                value={data.tmqMetric != null ? data.tmqMetric.toFixed(1) : '—'}
                                hint="tempo médio para qualificar"
                                tone={data.tmqMetric != null && data.tmqMetric <= 3 ? 'good' : data.tmqMetric != null && data.tmqMetric > 7 ? 'critical' : undefined}
                            />
                        </div>

                        {/* Funil */}
                        <ChartCard
                            title="Funil comercial"
                            subtitle="Leads que alcançaram cada etapa (acumulado)"
                            tableHeaders={['Etapa', 'Leads', 'Conversão da etapa anterior']}
                            tableRows={data.funnel.map((s) => [
                                s.label,
                                s.count,
                                s.conversionFromPrevious == null ? '—' : `${s.conversionFromPrevious.toFixed(1)}%`,
                            ])}
                        >
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={data.funnel} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                                    <CartesianGrid horizontal={false} stroke={INK.grid} />
                                    <XAxis type="number" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                                    <YAxis
                                        type="category" dataKey="label" width={120}
                                        stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }}
                                    />
                                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                    <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} barSize={18}>
                                        {data.funnel.map((_, i) => (
                                            <Cell key={i} fill={FUNNEL_RAMP[i % FUNNEL_RAMP.length]} />
                                        ))}
                                        {/* Rótulo fora da barra: barras curtas não cortam o número. */}
                                        <LabelList dataKey="count" position="right" fill={INK.muted} fontSize={11} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        {/* Evolução mensal — único gráfico multi-série, com legenda */}
                        <ChartCard
                            title="Evolução mensal"
                            subtitle="Leads criados, ganhos e perdidos"
                            tableHeaders={['Mês', 'Criados', 'Ganhos', 'Perdidos']}
                            tableRows={monthlyData.map((p) => [p.label, p.created, p.won, p.lost])}
                        >
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={monthlyData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                                    <CartesianGrid stroke={INK.grid} vertical={false} />
                                    <XAxis dataKey="label" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                                    <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: INK.axis }} />
                                    <Legend wrapperStyle={{ fontSize: 11, color: INK.muted }} />
                                    <Line type="monotone" dataKey="created" name="Criados" stroke={SERIES.created} strokeWidth={2} dot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="won" name="Ganhos" stroke={SERIES.won} strokeWidth={2} dot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="lost" name="Perdidos" stroke={SERIES.lost} strokeWidth={2} dot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Uma medida só por gráfico -> uma cor só */}
                            <ChartCard
                                title="Atividades por tipo"
                                tableHeaders={['Tipo', 'Quantidade']}
                                tableRows={data.activitiesByType.map((s) => [s.label, s.count])}
                            >
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={data.activitiesByType} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                                        <CartesianGrid stroke={INK.grid} vertical={false} />
                                        <XAxis dataKey="label" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                                        <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                        <Bar dataKey="count" name="Atividades" fill={SINGLE} radius={[4, 4, 0, 0]} barSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            <ChartCard
                                title="Ranking por responsável"
                                subtitle="Top 10 por volume de leads"
                                tableHeaders={['Responsável', 'Leads', 'Ganhos']}
                                tableRows={data.byOwner.map((o) => [o.label, o.count, o.won])}
                            >
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={data.byOwner} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                                        <CartesianGrid horizontal={false} stroke={INK.grid} />
                                        <XAxis type="number" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="label" width={110} stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                        <Bar dataKey="count" name="Leads" fill={SINGLE} radius={[0, 4, 4, 0]} barSize={16}>
                                            <LabelList dataKey="count" position="right" fill={INK.muted} fontSize={11} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            <ChartCard
                                title="Temperatura dos leads"
                                tableHeaders={['Temperatura', 'Leads']}
                                tableRows={data.byTemperature.map((s) => [s.label, s.count])}
                            >
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={data.byTemperature} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                                        <CartesianGrid stroke={INK.grid} vertical={false} />
                                        <XAxis dataKey="label" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                                        <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                        <Bar dataKey="count" name="Leads" fill={SINGLE} radius={[4, 4, 0, 0]} barSize={26} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            <ChartCard
                                title="Origem dos leads"
                                tableHeaders={['Origem', 'Leads']}
                                tableRows={data.bySource.map((s) => [s.label, s.count])}
                            >
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={data.bySource} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                                        <CartesianGrid horizontal={false} stroke={INK.grid} />
                                        <XAxis type="number" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="label" width={130} stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                        <Bar dataKey="count" name="Leads" fill={SINGLE} radius={[0, 4, 4, 0]} barSize={16}>
                                            <LabelList dataKey="count" position="right" fill={INK.muted} fontSize={11} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </div>

                        {/* ── Widgets de segunda camada ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Heatmap de Ligações — ocupa 2 colunas */}
                            <Card padding="sm" className="lg:col-span-2">
                                <h3 className="text-sm font-bold text-ink mb-4">🔥 Mapa de Calor — Melhor Horário para Ligar</h3>
                                <HeatmapWidget data={data.callHeatmap} />
                            </Card>

                            {/* TMQ */}
                            <Card padding="sm">
                                <h3 className="text-sm font-bold text-ink mb-2">⏱ Tempo Médio de Qualificação</h3>
                                <p className="text-[11px] text-ink-2 mb-3">Do lead recebido até a primeira qualificação</p>
                                <TmqTile value={data.tmqMetric} />
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Performance IA vs Humanos */}
                            <Card padding="sm">
                                <h3 className="text-sm font-bold text-ink mb-1">🤖 Performance: IA vs Humanos</h3>
                                <p className="text-[11px] text-ink-2 mb-3">Leads qualificados por responsável no período</p>
                                <AgentPerformanceWidget data={data.performanceReport} />
                            </Card>

                            {/* Motivos de Perda */}
                            <Card padding="sm">
                                <h3 className="text-sm font-bold text-ink mb-1">📉 Principais Motivos de Perda</h3>
                                <p className="text-[11px] text-ink-2 mb-3">Leads desqualificados/perdidos por motivo</p>
                                <LostReasonsWidget data={data.lostReasons} />
                            </Card>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
