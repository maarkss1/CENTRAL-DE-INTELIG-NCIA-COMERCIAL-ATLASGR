import { type AnalyticsDashboard } from '../analytics.api.js';

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ─── Heatmap de Ligações ──────────────────────────────────────────────────────
export function HeatmapWidget({ data }: { data: AnalyticsDashboard['callHeatmap'] }) {
    if (!data || data.length === 0) {
        return (
            <div className="text-center py-8 text-ink-2 text-sm">
                📵 Nenhuma ligação registrada no período
            </div>
        );
    }

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const heatGrid: Record<string, number> = {};
    data.forEach(d => { heatGrid[`${d.dayOfWeek}-${d.hour}`] = d.count; });

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[520px]">
                {/* Eixo de horas */}
                <div className="flex mb-1 ml-10">
                    {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="flex-1 text-center text-[9px] text-ink-2 font-mono">
                            {h % 3 === 0 ? `${h}h` : ''}
                        </div>
                    ))}
                </div>
                {/* Grade */}
                {Array.from({ length: 7 }, (_, day) => (
                    <div key={day} className="flex items-center gap-1 mb-0.5">
                        <span className="w-9 text-[10px] text-ink-2 text-right pr-1 shrink-0">
                            {DAY_NAMES[day]}
                        </span>
                        {Array.from({ length: 24 }, (_, hour) => {
                            const count = heatGrid[`${day}-${hour}`] ?? 0;
                            const intensity = count / maxCount;
                            const bg = count === 0
                                ? 'rgba(255,255,255,0.03)'
                                : `rgba(57,135,229,${0.15 + intensity * 0.85})`;
                            return (
                                <div
                                    key={hour}
                                    title={count > 0 ? `${DAY_NAMES[day]} ${hour}h — ${count} ligação(ões)` : ''}
                                    className="flex-1 h-5 rounded-sm transition-all cursor-default"
                                    style={{ backgroundColor: bg }}
                                />
                            );
                        })}
                    </div>
                ))}
                {/* Legenda */}
                <div className="flex items-center gap-2 mt-3 ml-10">
                    <span className="text-[10px] text-ink-2">Menos</span>
                    {[0.1, 0.35, 0.6, 0.8, 1.0].map((v, i) => (
                        <div
                            key={i}
                            className="w-4 h-4 rounded-sm"
                            style={{ backgroundColor: `rgba(57,135,229,${0.15 + v * 0.85})` }}
                        />
                    ))}
                    <span className="text-[10px] text-ink-2">Mais</span>
                </div>
            </div>
        </div>
    );
}

// ─── Performance IA vs Humanos ────────────────────────────────────────────────
export function AgentPerformanceWidget({ data }: { data: AnalyticsDashboard['performanceReport'] }) {
    if (!data || data.length === 0) {
        return (
            <div className="text-center py-8 text-ink-2 text-sm">
                👥 Sem dados de performance ainda
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {data.map((agent, i) => (
                <div
                    key={i}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-2 border border-line hover:border-brand/40 transition-colors"
                >
                    <span className="text-lg shrink-0">{agent.isAi ? '🤖' : '👤'}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-ink truncate">{agent.agent}</span>
                            <span className="text-[11px] font-bold text-ink shrink-0 ml-2">
                                {agent.conversionRate.toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${Math.min(agent.conversionRate, 100)}%`,
                                        backgroundColor: agent.isAi ? '#3987e5' : '#199e70'
                                    }}
                                />
                            </div>
                            <span className="text-[10px] text-ink-2 shrink-0">
                                {agent.leadsQualified}/{agent.leadsAssigned}
                            </span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Motivos de Perda ─────────────────────────────────────────────────────────
export function LostReasonsWidget({ data }: { data: AnalyticsDashboard['lostReasons'] }) {
    if (!data || data.length === 0) {
        return (
            <div className="text-center py-8 text-ink-2 text-sm">
                ✅ Sem registros de perda/desqualificação
            </div>
        );
    }

    const max = Math.max(...data.map(d => d.count), 1);

    return (
        <div className="space-y-2">
            {data.slice(0, 8).map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-ink-2 w-5 text-right shrink-0 font-mono">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-ink truncate">{d.label}</span>
                            <span className="text-xs font-bold text-[#d95926] ml-2 shrink-0">{d.count}</span>
                        </div>
                        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-[#d95926] to-[#f08a6a]"
                                style={{ width: `${(d.count / max) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── TMQ Tile ─────────────────────────────────────────────────────────────────
export function TmqTile({ value }: { value: number | null }) {
    return (
        <div className="flex flex-col items-center justify-center py-2 text-center">
            <span className="text-3xl font-black text-brand">
                {value === null ? '—' : value.toFixed(1)}
            </span>
            <span className="text-[11px] text-ink-2 mt-1">dias (média)</span>
            {value !== null && value <= 3 && (
                <span className="text-[10px] text-[#199e70] font-semibold mt-1">✓ Ótimo</span>
            )}
            {value !== null && value > 7 && (
                <span className="text-[10px] text-[#d95926] font-semibold mt-1">⚠ Acima da meta</span>
            )}
        </div>
    );
}
