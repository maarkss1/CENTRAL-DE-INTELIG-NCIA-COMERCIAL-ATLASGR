import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ChevronRight, Loader2, ShieldAlert } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { staggerContainer, staggerItem } from '../../../lib/motion';
import { commercialIntelligenceApi, formatCurrency, type CommercialFilter, type DealDrillDownRow } from '../commercialIntelligence.api';
import type { DrillDownQuery } from './DealDrillDownDrawer';

const MAX_ITEMS = 6;

/**
 * Centro de Decisão — "o que fazer agora", ordenado por valor real em risco (não por alerta
 * genérico). Reaproveita o endpoint de drill-down já existente com `sort: 'riskImpact'`
 * (`CommercialIntelligenceUseCases.dealsDrillDown`) — nenhum dado novo, só uma ordenação
 * determinística explicável do mesmo `riskFactors` que o drill-down padrão já expõe. Nunca age
 * sozinho: "Ver negócio" abre o drawer já existente (com o composer de nota/Bitrix que já vive
 * lá) — a decisão de agir continua sempre humana.
 */
export function DecisionCenterPanel({ filter, onOpenDrillDown }: { filter: CommercialFilter; onOpenDrillDown: (query: DrillDownQuery) => void }) {
    const [rows, setRows] = useState<DealDrillDownRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .deals(filter, { sort: 'riskImpact', limit: MAX_ITEMS })
            .then((result) => { if (!cancelled) setRows(result.rows); })
            .catch((err) => { if (!cancelled) setError((err as Error).message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [filter]);

    const riskValue = (row: DealDrillDownRow) => row.amount * (1 - (row.weightedProbability ?? row.probability ?? 0) / 100);

    return (
        <Card padding="sm">
            <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-brand" aria-hidden="true" />
                <h2 className="text-sm font-bold text-ink">Centro de Decisão</h2>
            </div>
            <p className="text-[11px] text-ink-2 mb-3">Negócios abertos ordenados por valor em risco (valor × probabilidade de não fechar) — o que precisa de atenção primeiro.</p>

            {loading && (
                <div className="flex items-center justify-center py-8 text-ink-2">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Calculando prioridades…
                </div>
            )}

            {!loading && error && (
                <div className="flex items-center gap-2 text-sm text-critical py-4">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </div>
            )}

            {!loading && !error && rows.length === 0 && (
                <p className="text-xs text-ink-2 py-2">Nenhum negócio aberto com valor em risco relevante no momento.</p>
            )}

            {!loading && !error && rows.length > 0 && (
                <motion.ul
                    variants={reduceMotion ? undefined : staggerContainer(0.05)}
                    initial={reduceMotion ? undefined : 'hidden'}
                    animate={reduceMotion ? undefined : 'show'}
                    className="space-y-2"
                >
                    {rows.map((row) => (
                        <motion.li key={row.id} variants={reduceMotion ? undefined : staggerItem} className="rounded-xl border border-line p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-bold text-sm text-ink truncate">{row.title || 'Sem título'}</p>
                                    <p className="text-xs text-ink-2 truncate">{row.companyName || 'Empresa não informada'}{row.owner ? ` · ${row.owner}` : ''}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[10px] uppercase tracking-wide text-ink-2 font-semibold">Em risco</p>
                                    <p className="font-black text-sm text-critical [font-variant-numeric:tabular-nums]">{formatCurrency(riskValue(row))}</p>
                                </div>
                            </div>

                            {row.riskFactors.length > 0 && (
                                <p className="text-[11px] text-critical mt-1.5">
                                    <span className="font-semibold">Por quê: </span>{row.riskFactors.join(' · ')}
                                </p>
                            )}

                            <div className="flex items-center justify-between gap-2 mt-2">
                                <p className="text-[10px] text-ink-2">Valor total: {formatCurrency(row.amount)}</p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => onOpenDrillDown({ title: `Negócio — ${row.title || row.companyName || 'sem título'}`, ids: [row.id] })}
                                >
                                    Ver negócio <ChevronRight className="w-3 h-3 ml-0.5" />
                                </Button>
                            </div>
                        </motion.li>
                    ))}
                </motion.ul>
            )}
        </Card>
    );
}
