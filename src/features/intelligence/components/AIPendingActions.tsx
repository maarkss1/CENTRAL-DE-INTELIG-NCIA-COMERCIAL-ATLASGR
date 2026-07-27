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
            const response = await api.get<{ data: PendingAction[] }>('/api/intelligence/pending');
            const actionsData = response.data;
            setActions(Array.isArray(actionsData) ? actionsData : []);
        } catch (error) {
            console.error('Error fetching AI actions', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActions();
    }, []);

    const handleApprove = async (id: string) => {
        try {
            await api.post(`/api/intelligence/pending/${id}/approve`);
            setActions(prev => prev.filter(a => a.id !== id));
        } catch (error) {
            console.error('Error approving', error);
        }
    };

    const handleDiscard = async (id: string) => {
        // Num cenário real teríamos uma rota de delete/discard
        setActions(prev => prev.filter(a => a.id !== id));
    };

    if (loading) return <div className="p-4 text-gray-500">Carregando ações da IA...</div>;

    if (actions.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center flex flex-col items-center">
                <div className="bg-blue-50 p-4 rounded-full mb-4">
                    <Bot className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhuma ação pendente</h3>
                <p className="text-gray-500">Seus agentes autônomos estão ociosos no momento.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
                <Bot className="mr-2 w-6 h-6 text-indigo-600" /> 
                Ações Autônomas Aguardando Aprovação
            </h2>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {actions.map(action => (
                    <div key={action.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
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
                                <p className="text-xs text-gray-500 font-medium">Para</p>
                                <p className="text-sm text-gray-900 font-medium truncate">{action.payload.to || 'Desconhecido'}</p>
                            </div>
                            
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Assunto</p>
                                <p className="text-sm text-gray-900 truncate">{action.payload.subject}</p>
                            </div>

                            <div>
                                <p className="text-xs text-gray-500 font-medium mb-1">Mensagem Gerada</p>
                                <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700 h-32 overflow-y-auto whitespace-pre-wrap">
                                    {action.payload.body}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 p-3 bg-gray-50 flex gap-2">
                            <button
                                onClick={() => handleApprove(action.id)}
                                className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Check className="w-4 h-4 mr-1.5" />
                                Aprovar Envio
                            </button>
                            <button
                                onClick={() => handleDiscard(action.id)}
                                className="flex items-center justify-center bg-white hover:bg-red-50 text-red-600 border border-gray-200 py-2 px-3 rounded-lg text-sm transition-colors"
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
