import { Card, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Lock, PlayCircle } from 'lucide-react';
import type { QueueLeadSummary } from '../mesaTratamento.api';

const TEMPERATURE_VARIANT: Record<string, 'danger' | 'warning' | 'info'> = {
    Quente: 'danger',
    Morno: 'warning',
    Frio: 'info',
};

interface QueueListProps {
    queue: QueueLeadSummary[];
}

/** Fila sequencial: só o primeiro item (o card principal) é acionável — os demais ficam
 *  "bloqueados" até o atual ser registrado, mesmo princípio "um Lead por vez" do protótipo
 *  original. Ver AGENTS.md desta pasta para o que ainda falta (fila com abas Retornos/Concluídos). */
export function QueueList({ queue }: QueueListProps) {
    return (
        <Card padding="sm" className="sticky top-4">
            <CardHeader>
                <CardTitle className="text-sm">Fila sequencial ({queue.length})</CardTitle>
            </CardHeader>
            <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
                {queue.length === 0 && (
                    <p className="text-sm text-ink-2">Fila zerada — sem leads abertos no momento.</p>
                )}
                {queue.map((lead, index) => (
                    <div
                        key={lead.id}
                        className={`rounded-xl border border-line p-3 text-sm ${index === 0 ? 'bg-brand/10 border-brand/30' : 'bg-surface-2/60 opacity-70'}`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-semibold text-ink truncate">
                                {index === 0 ? <PlayCircle size={14} className="text-brand shrink-0" /> : <Lock size={12} className="text-ink-2 shrink-0" />}
                                {lead.title}
                            </span>
                            <span className="text-xs text-ink-2 shrink-0">#{index + 1}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Badge variant="outline">{lead.status.replace(/_/g, ' ')}</Badge>
                            {lead.temperature && (
                                <Badge variant={TEMPERATURE_VARIANT[lead.temperature] ?? 'default'}>{lead.temperature}</Badge>
                            )}
                            {lead.daysSinceTouch !== null && (
                                <span className="text-xs text-ink-2">{lead.daysSinceTouch}d sem toque</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
