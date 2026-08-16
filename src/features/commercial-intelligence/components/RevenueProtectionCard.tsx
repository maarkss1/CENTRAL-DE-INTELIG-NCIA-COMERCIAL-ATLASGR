import { Card } from '../../../components/ui/Card';
import { formatCurrency, formatMultiple, type RevenueProtectionSnapshot } from '../commercialIntelligence.api';

const STATUS_LABEL: Record<RevenueProtectionSnapshot['status'], string> = {
    critical: 'Crítico',
    attention: 'Atenção',
    healthy: 'Saudável',
    unknown: 'Não disponível',
};

const STATUS_CLASS: Record<RevenueProtectionSnapshot['status'], string> = {
    critical: 'text-[#d03b3b]',
    attention: 'text-[#b8860b]',
    healthy: 'text-[#0ca30c]',
    unknown: 'text-ink-2',
};

interface RevenueProtectionCardProps {
    snapshots: RevenueProtectionSnapshot[];
    currency: string;
}

/**
 * Proteção de Receita M/M+1/M+2/M+3 — mesmo bloco do Cockpit legado (`cockpitCalcularProtecao` em
 * `js/cockpit.js`), reimplementado reaproveitando `coverageRecommended` (1 / Win Rate) já
 * calculado por este módulo em vez do threshold fixo 2x/3x não validado do legado. Ver
 * `application/revenueProtection.ts` para a fórmula de status.
 */
export function RevenueProtectionCard({ snapshots, currency }: RevenueProtectionCardProps) {
    if (snapshots.length === 0) return null;

    return (
        <Card padding="sm">
            <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-bold text-ink">Proteção de Receita — M/M+1/M+2/M+3</h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-left text-ink-2 uppercase tracking-wide text-[10px]">
                            <th className="py-1 pr-3 font-semibold">Mês</th>
                            <th className="py-1 pr-3 font-semibold">Meta restante</th>
                            <th className="py-1 pr-3 font-semibold">Pipeline elegível</th>
                            <th className="py-1 pr-3 font-semibold">Coverage</th>
                            <th className="py-1 pr-3 font-semibold">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {snapshots.map((snapshot) => (
                            <tr key={snapshot.period} className="border-t border-line">
                                <td className="py-1.5 pr-3 font-semibold text-ink [font-variant-numeric:tabular-nums]">
                                    {snapshot.label} <span className="text-ink-2 font-normal">({snapshot.period})</span>
                                </td>
                                <td className="py-1.5 pr-3 text-ink [font-variant-numeric:tabular-nums]">
                                    {snapshot.goal ? formatCurrency(snapshot.remainingGoal, currency) : 'Sem meta cadastrada'}
                                </td>
                                <td className="py-1.5 pr-3 text-ink [font-variant-numeric:tabular-nums]">
                                    {formatCurrency(snapshot.pipelineEligible, currency)}
                                </td>
                                <td className="py-1.5 pr-3 text-ink [font-variant-numeric:tabular-nums]">
                                    {formatMultiple(snapshot.coverage)}
                                    {snapshot.coverageRecommended != null && (
                                        <span className="text-ink-2"> / rec. {formatMultiple(snapshot.coverageRecommended)}</span>
                                    )}
                                </td>
                                <td className={`py-1.5 pr-3 font-bold ${STATUS_CLASS[snapshot.status]}`}>{STATUS_LABEL[snapshot.status]}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
