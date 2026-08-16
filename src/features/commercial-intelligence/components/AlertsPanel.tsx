import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import type { ExecutiveAlert } from '../commercialIntelligence.api';

const SEVERITY_STYLE: Record<ExecutiveAlert['severity'], { icon: typeof AlertTriangle; className: string }> = {
    critical: { icon: AlertTriangle, className: 'text-[#d03b3b] bg-[#d03b3b]/10 border-[#d03b3b]/20' },
    warning: { icon: AlertCircle, className: 'text-[#b8860b] bg-[#b8860b]/10 border-[#b8860b]/20' },
    info: { icon: Info, className: 'text-info bg-info/10 border-info/20' },
    positive: { icon: CheckCircle2, className: 'text-[#0ca30c] bg-[#0ca30c]/10 border-[#0ca30c]/20' },
};

const SEVERITY_ORDER: Record<ExecutiveAlert['severity'], number> = { critical: 0, warning: 1, info: 2, positive: 3 };

/** Alertas executivos (seção 26) — sempre derivados de métricas já calculadas, nunca um texto fixo. */
export function AlertsPanel({ alerts, loading }: { alerts: ExecutiveAlert[]; loading: boolean }) {
    if (loading) return null;

    if (alerts.length === 0) {
        return (
            <Card padding="sm" className="border-[#0ca30c]/20 bg-[#0ca30c]/5">
                <p className="text-sm font-semibold text-[#0ca30c]">Nenhum risco identificado no momento.</p>
            </Card>
        );
    }

    const sorted = [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    return (
        <div className="space-y-2">
            <h2 className="text-sm font-bold text-ink px-1">Alertas gerenciais</h2>
            {sorted.map((alert) => {
                const { icon: Icon, className } = SEVERITY_STYLE[alert.severity];
                return (
                    <div key={alert.id} className={`rounded-xl border p-3 flex items-start gap-2.5 ${className}`}>
                        <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                        <div>
                            <p className="text-sm font-bold">{alert.title}</p>
                            <p className="text-xs opacity-90">{alert.description}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
