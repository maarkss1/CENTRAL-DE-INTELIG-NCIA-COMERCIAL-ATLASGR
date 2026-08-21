import { Eye, PenLine, FlaskConical, AlertTriangle, Lock } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';

/**
 * Taxonomia de maturidade real por integração (Onda 3 — "Integrações honestas"): o que a tela de
 * Integrações mostra como "Conectado" hoje não distinguia leitura de escrita, nem escrita real de
 * gravação puramente local (ver `PrismaCalendarSchedulerPort.ts`/`GovBrSignatureProviderPort.ts`,
 * que já documentavam "stub de transporte" em comentário sem nenhum reflexo nesta tela).
 */
export type IntegrationCapability = 'read' | 'write' | 'stub' | 'error' | 'pending_scope';

const CAPABILITY_CONFIG: Record<IntegrationCapability, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'outline'; icon: typeof Eye }> = {
    write: { label: 'Escrita real', variant: 'success', icon: PenLine },
    read: { label: 'Leitura real', variant: 'info', icon: Eye },
    stub: { label: 'Local (não sincroniza)', variant: 'warning', icon: FlaskConical },
    pending_scope: { label: 'Pendente de escopo', variant: 'outline', icon: Lock },
    error: { label: 'Erro', variant: 'danger', icon: AlertTriangle },
};

interface IntegrationStatusBadgeProps {
    capability: IntegrationCapability;
    title?: string;
}

export function IntegrationStatusBadge({ capability, title }: IntegrationStatusBadgeProps) {
    const { label, variant, icon: Icon } = CAPABILITY_CONFIG[capability];
    return (
        <Badge variant={variant} title={title} className="gap-1.5">
            <Icon className="w-3 h-3" />
            {label}
        </Badge>
    );
}
