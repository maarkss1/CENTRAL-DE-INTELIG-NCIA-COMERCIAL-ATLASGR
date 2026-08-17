import { useCallback, useEffect, useState } from 'react';
import { PhoneCall, Target } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from '../../../lib/toast';
import { mesaTratamentoApi, type MesaQueueResponse } from '../mesaTratamento.api';
import { QueueList } from './QueueList';
import { CurrentLeadCard } from './CurrentLeadCard';

/** Página da Mesa de Tratamento SDR. ADMIN/GESTOR e CLOSER/SDR veem a mesma fila nesta primeira
 *  entrega (ADMIN/GESTOR sem filtro de dono = fila do time todo) — ações de gestão dedicadas
 *  (reatribuir, comentar, marcar decidido) ficam pra próxima rodada, ver AGENTS.md desta pasta. */
export function MesaTratamento() {
    const { currentUser } = useAuth();
    const [data, setData] = useState<MesaQueueResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadQueue = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await mesaTratamentoApi.queue();
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível carregar a fila.');
            toast.error('Falha ao carregar a Mesa de Tratamento.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    if (loading && !data) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_0.7fr] gap-4">
                <Skeleton className="h-[520px] rounded-card" />
                <Skeleton className="h-[520px] rounded-card" />
            </div>
        );
    }

    if (error && !data) {
        return (
            <EmptyState
                title="Não foi possível carregar a Mesa de Tratamento"
                description={error}
                actionLabel="Tentar novamente"
                onAction={loadQueue}
                icon={<PhoneCall className="w-8 h-8 text-brand" />}
            />
        );
    }

    if (!data?.connectionId) {
        return (
            <EmptyState
                title="Bitrix24 não conectado"
                description="Conecte um portal Bitrix24 em Configurações antes de usar a Mesa de Tratamento."
                icon={<PhoneCall className="w-8 h-8 text-brand" />}
            />
        );
    }

    if (!data.current) {
        return (
            <EmptyState
                title="Fila produtiva zerada 🎯"
                description={`Nenhum Lead aberto atribuído a ${currentUser?.name ?? 'você'} no momento.`}
                actionLabel="Atualizar"
                onAction={loadQueue}
                icon={<Target className="w-8 h-8 text-brand" />}
            />
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_0.7fr] gap-4 items-start">
            <CurrentLeadCard lead={data.current} leadStatuses={data.leadStatuses} onRegistered={loadQueue} />
            <QueueList queue={data.queue} />
        </div>
    );
}
