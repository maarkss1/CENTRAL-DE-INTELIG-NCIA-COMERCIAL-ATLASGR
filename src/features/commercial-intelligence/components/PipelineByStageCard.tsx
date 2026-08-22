import { Card } from '../../../components/ui/Card';
import { formatCurrency, type FunnelStageConversion } from '../commercialIntelligence.api';

interface PipelineByStageCardProps {
    funnel: FunnelStageConversion[];
    currency: string;
}

/**
 * Valor aberto (R$) por etapa do funil Negócio — mesma fonte de dados de `FunnelConversionCard`
 * (`performance.funnel`), já buscada pelo Cockpit; aqui o eixo é valor (`amount`), não contagem/
 * conversão, então é uma segunda leitura do mesmo array em vez de uma chamada de API nova.
 */
export function PipelineByStageCard({ funnel, currency }: PipelineByStageCardProps) {
    const openStages = funnel.filter((stage) => stage.amount > 0 || stage.count > 0);
    const maxAmount = Math.max(1, ...openStages.map((stage) => stage.amount));

    return (
        <Card padding="sm">
            <h3 className="text-sm font-bold text-ink mb-1">Pipeline por estágio</h3>
            <p className="text-[11px] text-ink-2 mb-3">Valor aberto (R$) de negócios do funil Negócio, por etapa atual — não confundir com a conversão histórica do funil acima.</p>
            {openStages.length === 0 ? (
                <p className="text-xs text-ink-2">Nenhum negócio aberto no funil Negócio ainda.</p>
            ) : (
                <div className="space-y-2">
                    {openStages.map((stage) => (
                        <div key={stage.stageId} className="flex items-center gap-3">
                            <div className="w-40 shrink-0 text-xs font-semibold text-ink truncate" title={stage.label}>{stage.label}</div>
                            <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                                <div
                                    className="h-full bg-brand/70 rounded-md"
                                    style={{ width: `${Math.max(4, (stage.amount / maxAmount) * 100)}%` }}
                                />
                            </div>
                            <div className="w-24 shrink-0 text-right text-xs [font-variant-numeric:tabular-nums] text-ink">{formatCurrency(stage.amount, currency)}</div>
                            <div className="w-16 shrink-0 text-right text-[11px] text-ink-2">{stage.count} negócio(s)</div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
