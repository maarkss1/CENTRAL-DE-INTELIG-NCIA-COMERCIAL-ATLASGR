import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
    commercialIntelligenceApi, formatCurrency,
    type CommercialFilter, type DealDrillDownRow, type ForecastTier,
} from '../commercialIntelligence.api';

export interface DrillDownQuery {
    title: string;
    tier?: ForecastTier;
    stageId?: string;
    agingCritical?: boolean;
    missingNextAction?: boolean;
}

interface DealDrillDownDrawerProps {
    filter: CommercialFilter;
    query: DrillDownQuery | null;
    onClose: () => void;
}

const TIER_LABEL: Record<ForecastTier, string> = {
    Commit: 'Commit', BestCase: 'Best Case', Pipeline: 'Pipeline', Upside: 'Upside',
};

function formatDate(iso: string | null): string {
    if (!iso) return 'Não disponível';
    return new Date(iso).toLocaleDateString('pt-BR');
}

/** Drill-down genérico (seção 29) — nenhum KPI/gráfico do módulo deve ficar "morto". */
export function DealDrillDownDrawer({ filter, query, onClose }: DealDrillDownDrawerProps) {
    const [rows, setRows] = useState<DealDrillDownRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!query) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .deals(filter, { tier: query.tier, stageId: query.stageId, agingCritical: query.agingCritical, missingNextAction: query.missingNextAction, limit: 100 })
            .then((result) => {
                if (cancelled) return;
                setRows(result.rows);
                setTotal(result.total);
            })
            .catch((err) => {
                if (!cancelled) setError((err as Error).message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [filter, query]);

    return (
        <Drawer isOpen={!!query} onClose={onClose} title={query?.title ?? 'Negócios'} subtitle={total > 0 ? `${total} negócio(s)` : undefined}>
            {loading && (
                <div className="flex items-center justify-center py-12 text-ink-2">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
                </div>
            )}
            {!loading && error && (
                <div className="flex items-center gap-2 text-sm text-[#d03b3b] py-6">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </div>
            )}
            {!loading && !error && rows.length === 0 && (
                <EmptyState title="Nenhum negócio encontrado" description="Não há negócios que atendam a este filtro no momento." />
            )}
            {!loading && !error && rows.length > 0 && (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <div key={row.id} className="rounded-xl border border-line p-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="font-bold text-sm text-ink">{row.title || 'Sem título'}</p>
                                    <p className="text-xs text-ink-2">{row.companyName || 'Empresa não informada'}</p>
                                </div>
                                <p className="font-black text-sm text-ink [font-variant-numeric:tabular-nums]">{formatCurrency(row.amount)}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                {row.stageName && <Badge variant="outline">{row.stageName}</Badge>}
                                {row.tier && <Badge variant={row.tier === 'Commit' ? 'success' : row.tier === 'Upside' ? 'default' : 'info'}>{TIER_LABEL[row.tier]}</Badge>}
                                {row.agingDays > 45 && <Badge variant="danger">{row.agingDays}d na etapa</Badge>}
                                {!row.nextAction && <Badge variant="warning">Sem próxima ação</Badge>}
                            </div>
                            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-ink-2 pt-1">
                                <div><dt className="inline font-semibold">Responsável: </dt><dd className="inline">{row.owner || 'Não disponível'}</dd></div>
                                <div><dt className="inline font-semibold">Probabilidade: </dt><dd className="inline">{row.weightedProbability != null ? `${row.weightedProbability}%` : 'Não disponível'}</dd></div>
                                <div><dt className="inline font-semibold">Prev. fechamento: </dt><dd className="inline">{formatDate(row.expectedCloseAt)}</dd></div>
                                <div><dt className="inline font-semibold">Última atividade: </dt><dd className="inline">{formatDate(row.lastInteraction)}</dd></div>
                            </dl>
                            {row.riskFactors.length > 0 && (
                                <p className="text-[11px] text-[#d03b3b] pt-1">
                                    <span className="font-semibold">Fatores de risco:</span> {row.riskFactors.join(' · ')}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    );
}
