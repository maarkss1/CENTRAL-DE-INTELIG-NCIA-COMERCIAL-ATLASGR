import { useState, useEffect } from 'react';
import { Bot, Check, X, Mail } from 'lucide-react';
import { api } from '../../../lib/api';

interface PendingAction {
    id: string;
    entity: string;
    action: string;
    payload: {
        to: string;
        subject: string;
        body: string;
        leadId?: string;
    };
    approved: boolean;
}

export function AIPendingActions() {
    const [actions, setActions] = useState<PendingAction[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchActions = async () => {
        try {
            const response = await api.get<PendingAction[]>('/api/intelligence/pending');
            setActions(Array.isArray(response) ? response : []);
        } catch (error) {
            console.error('Error fetching AI actions', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActions();
    }, []);

    /**
     * "Aprovar" agora envia o e-mail de verdade via SMTP quando o servidor está configurado
     * (IA-005). Só cai no fallback de abrir o rascunho no cliente de e-mail do próprio usuário
     * (mailto:) quando o backend reporta que não enviou — SMTP ausente ou envio falhou — nunca
     * incondicionalmente, senão o lead receberia a mensagem duas vezes.
     */
    const handleApprove = async (action: PendingAction) => {
        try {
            const result = await api.post<{ execution: { sent: boolean; reason?: string } }>(
                `/api/intelligence/pending/${action.id}/approve`,
            );

            if (!result.execution.sent) {
                const to = encodeURIComponent(action.payload.to || '');
                const subject = encodeURIComponent(action.payload.subject || '');
                const body = encodeURIComponent(action.payload.body || '');
                window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
            }

            setActions(prev => prev.filter(a => a.id !== action.id));
        } catch (error) {
            console.error('Error approving', error);
        }
    };

    const handleDiscard = async (id: string) => {
        try {
            await api.delete(`/api/intelligence/pending/${id}`);
            setActions(prev => prev.filter(a => a.id !== id));
        } catch (error) {
            console.error('Error discarding', error);
        }
    };

    if (loading) return <div className="p-4 text-ink-2">Carregando ações da IA...</div>;

    if (actions.length === 0) {
        return (
            <div className="bg-surface rounded-lg shadow-sm border border-line p-8 text-center flex flex-col items-center">
                <div className="bg-blue-50 p-4 rounded-full mb-4">
                    <Bot className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-medium text-ink mb-1">Nenhuma ação pendente</h3>
                <p className="text-ink-2">Seus agentes autônomos estão ociosos no momento.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-ink flex items-center">
                <Bot className="mr-2 w-6 h-6 text-indigo-600" />
                Ações Autônomas Aguardando Aprovação
            </h2>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {actions.map(action => (
                    <div key={action.id} className="bg-surface rounded-xl shadow-sm border border-line overflow-hidden hover:shadow-md transition-shadow">
                        <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center text-indigo-800 font-medium text-sm">
                                <Mail className="w-4 h-4 mr-2" />
                                Rascunho de E-mail
                            </div>
                            <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full font-semibold">
                                {action.entity}
                            </span>
                        </div>
                        
                        <div className="p-4 space-y-3">
                            <div>
                                <p className="text-xs text-ink-2 font-medium">Para</p>
                                <p className="text-sm text-ink font-medium truncate">{action.payload.to || 'Desconhecido'}</p>
                            </div>

                            <div>
                                <p className="text-xs text-ink-2 font-medium">Assunto</p>
                                <p className="text-sm text-ink truncate">{action.payload.subject}</p>
                            </div>

                            <div>
                                <p className="text-xs text-ink-2 font-medium mb-1">Mensagem Gerada</p>
                                <div className="bg-surface-2 rounded-md p-3 text-sm text-ink-2 h-32 overflow-y-auto whitespace-pre-wrap">
                                    {action.payload.body}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-line p-3 bg-surface-2 flex gap-2">
                            <button
                                onClick={() => handleApprove(action)}
                                className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                                title="Envia o e-mail de verdade quando o servidor de e-mail está configurado; senão, abre o rascunho no seu cliente de e-mail para você enviar"
                            >
                                <Check className="w-4 h-4 mr-1.5" />
                                Aprovar e enviar
                            </button>
                            <button
                                onClick={() => handleDiscard(action.id)}
                                className="flex items-center justify-center bg-surface hover:bg-red-50 text-red-600 border border-line py-2 px-3 rounded-lg text-sm transition-colors"
                                title="Descartar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
