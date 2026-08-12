import { type AnalyticsDashboard } from '../analytics.api.js';

export function HeatmapWidget({ data }: { data: AnalyticsDashboard['callHeatmap'] }) {
    if (!data || data.length === 0) return <div>Sem dados de mapa de calor</div>;
    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Melhores Horários (Heatmap)</h3>
            <div className="text-sm text-slate-600">
                {data.slice(0, 5).map((d, i) => (
                    <div key={i}>Dia: {d.dayOfWeek} | Hora: {d.hour}h | Volume: {d.count} ligações</div>
                ))}
            </div>
        </div>
    );
}

export function AgentPerformanceWidget({ data }: { data: AnalyticsDashboard['performanceReport'] }) {
    if (!data || data.length === 0) return <div>Sem dados de performance</div>;
    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Desempenho: IA vs Humanos</h3>
            <div className="text-sm text-slate-600">
                {data.map((d, i) => (
                    <div key={i}>
                        <span className="font-medium">{d.agent}</span> {d.isAi ? '🤖' : '👤'} — 
                        Convertidos: {d.leadsQualified}/{d.leadsAssigned} ({d.conversionRate.toFixed(1)}%)
                    </div>
                ))}
            </div>
        </div>
    );
}

export function LostReasonsWidget({ data }: { data: AnalyticsDashboard['lostReasons'] }) {
    if (!data || data.length === 0) return <div>Sem dados de perda</div>;
    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Motivos de Perda (Desqualificação)</h3>
            <div className="text-sm text-slate-600">
                {data.map((d, i) => (
                    <div key={i}>{d.label}: {d.count}</div>
                ))}
            </div>
        </div>
    );
}
