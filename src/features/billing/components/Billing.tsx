import { useCallback, useEffect, useState } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Wallet, Loader2, AlertTriangle, RefreshCw, Info } from 'lucide-react';

import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { api } from '../../../lib/api';
import { SINGLE, INK, tooltipStyle } from '../../../shared/constants/chartPalette';

interface UsageByModel {
    model: string; tokens: number; cost: number; calls: number; avgLatencyMs: number;
}
interface UsagePoint { day: string; tokens: number; cost: number; calls: number }
interface UsageSummary {
    totalTokens: number; totalCost: number; totalCalls: number; avgLatencyMs: number;
    costThisMonth: number; byModel: UsageByModel[]; daily: UsagePoint[];
    unattributedCalls: number; isEmpty: boolean;
}

const PERIODS = [7, 30, 90];

const usd = (v: number) => `US$ ${v.toFixed(v < 1 ? 4 : 2)}`;
const compact = (v: number) => v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <Card variant="stat" padding="sm">
            <p className="text-[11px] uppercase tracking-wide text-ink-2 font-semibold">{label}</p>
            <p className="text-2xl font-black mt-1 text-ink">{value}</p>
            {hint && <p className="text-[11px] text-ink-2 mt-0.5">{hint}</p>}
        </Card>
    );
}

export function Billing() {
    const accent = useBrandAccent();
    const [days, setDays] = useState(30);
    const [data, setData] = useState<UsageSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (period: number) => {
        setLoading(true);
        setError(null);
        try {
            setData(await api.get<UsageSummary>(`/api/usage?days=${period}`));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(days); }, [load, days]);

    const daily = (data?.daily ?? []).map((p) => ({
        ...p,
        label: p.day.slice(8) + '/' + p.day.slice(5, 7),
    }));

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4 border-b border-line pb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent.bgSoft} ${accent.text}`}>
                            <Wallet className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-ink">Consumo de IA</h1>
                            <p className="text-sm text-ink-2">Tokens, chamadas e custo estimado por modelo</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-xl border border-line overflow-hidden" role="group" aria-label="Período">
                            {PERIODS.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setDays(p)}
                                    aria-pressed={days === p}
                                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        days === p ? `${accent.bg} text-white` : 'text-ink-2 hover:text-ink hover:bg-surface-2'
                                    }`}
                                >
                                    {p}d
                                </button>
                            ))}
                        </div>
                        <Button variant="outline" onClick={() => void load(days)} disabled={loading} aria-label="Recarregar">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                {/* O produto não tem plano, assinatura nem provedor de pagamento; dizer "faturamento"
                    aqui seria inventar. O que existe de real é o custo estimado das chamadas de IA. */}
                <div className="flex items-start gap-2 text-xs text-sky-200 bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-3">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                        Esta tela mostra <strong>consumo</strong>, não cobrança. O custo é estimado a partir
                        da tabela de preços por milhão de tokens usada no gateway de IA — não vem de fatura
                        do provedor. Não há plano nem assinatura configurados no sistema.
                    </p>
                </div>

                {loading && !data && (
                    <Card padding="lg" className="text-center text-ink-2 text-sm">
                        <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> Carregando consumo…
                    </Card>
                )}

                {error && (
                    <Card padding="lg" className="text-center">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                        <p className="text-sm text-ink-2 mb-4">{error}</p>
                        <Button variant="outline" onClick={() => void load(days)}>Tentar novamente</Button>
                    </Card>
                )}

                {data?.isEmpty && !loading && !error && (
                    <Card padding="lg" className="text-center border-dashed">
                        <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                        <h3 className="text-lg font-semibold text-ink mb-1">Nenhuma chamada de IA no período</h3>
                        <p className="text-sm text-ink-2 max-w-md mx-auto">
                            Use o Hub de IA, o Chatbook ou a Base de Conhecimento e o consumo aparece aqui.
                        </p>
                    </Card>
                )}

                {data && !data.isEmpty && (
                    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <StatTile label="Custo estimado" value={usd(data.totalCost)} hint={`nos últimos ${days} dias`} />
                            <StatTile label="No mês corrente" value={usd(data.costThisMonth)} />
                            <StatTile label="Tokens" value={compact(data.totalTokens)} hint={`${compact(data.totalCalls)} chamadas`} />
                            <StatTile label="Latência média" value={`${data.avgLatencyMs} ms`} />
                        </div>

                        {data.unattributedCalls > 0 && (
                            <p className="text-[11px] text-ink-2">
                                {data.unattributedCalls} chamada(s) no período sem organização atribuída
                                (execuções fora de requisição ou anteriores ao registro de tenant) não entram nos números acima.
                            </p>
                        )}

                        <Card padding="sm">
                            <h3 className="text-sm font-bold text-ink mb-3">Custo por dia</h3>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={daily} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                                    <CartesianGrid stroke={INK.grid} vertical={false} />
                                    <XAxis dataKey="label" stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} interval="preserveStartEnd" />
                                    <YAxis stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                        formatter={((v: number) => [usd(v), 'Custo']) as never}
                                    />
                                    <Bar dataKey="cost" name="Custo" fill={SINGLE} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card padding="sm">
                            <h3 className="text-sm font-bold text-ink mb-3">Por modelo</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-ink-2 border-b border-line">
                                            <th className="text-left font-semibold py-2 pr-4">Modelo</th>
                                            <th className="text-right font-semibold py-2 pr-4">Chamadas</th>
                                            <th className="text-right font-semibold py-2 pr-4">Tokens</th>
                                            <th className="text-right font-semibold py-2 pr-4">Latência média</th>
                                            <th className="text-right font-semibold py-2">Custo estimado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-ink-2 [font-variant-numeric:tabular-nums]">
                                        {data.byModel.map((m) => (
                                            <tr key={m.model} className="border-b border-line">
                                                <td className="py-2 pr-4 text-ink font-medium">{m.model}</td>
                                                <td className="py-2 pr-4 text-right">{m.calls.toLocaleString('pt-BR')}</td>
                                                <td className="py-2 pr-4 text-right">{m.tokens.toLocaleString('pt-BR')}</td>
                                                <td className="py-2 pr-4 text-right">{m.avgLatencyMs} ms</td>
                                                <td className="py-2 text-right">{usd(m.cost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
