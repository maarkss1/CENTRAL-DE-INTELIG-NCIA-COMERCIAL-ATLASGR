import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { api } from '../../../lib/api';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { staggerContainer, staggerItem } from '../../../lib/motion';
import { IconBot, IconCheck, IconClose, IconMail, IconSpinner } from '../../../components/icons';

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

    if (loading) {
        return (
            <div className="p-4 text-atlas-dark/50 flex items-center gap-2">
                <IconSpinner className="w-4 h-4 animate-spin text-atlas-orange" /> Carregando ações da IA...
            </div>
        );
    }

    if (actions.length === 0) {
        return (
            <div className="p-8 text-center flex flex-col items-center">
                <div className="bg-blue-50 p-4 rounded-full mb-4">
                    <IconBot className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold text-atlas-dark mb-1">Nenhuma ação pendente</h3>
                <p className="text-atlas-dark/50">Seus agentes autônomos estão ociosos no momento.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-atlas-dark flex items-center gap-2">
                <IconBot className="w-6 h-6 text-indigo-600" />
                Ações Autônomas Aguardando Aprovação
            </h2>

            <motion.div variants={staggerContainer(0.06)} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {actions.map(action => (
                    <motion.div key={action.id} variants={staggerItem}>
                        <Card variant="interactive" className="overflow-hidden">
                            <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-3 flex items-center justify-between">
                                <div className="flex items-center text-indigo-800 font-semibold text-sm gap-2">
                                    <IconMail className="w-4 h-4" />
                                    Rascunho de E-mail
                                </div>
                                <Badge variant="default" className="bg-indigo-100 text-indigo-800">
                                    {action.entity}
                                </Badge>
                            </div>

                            <div className="p-4 space-y-3">
                                <div>
                                    <p className="text-xs text-atlas-dark/45 font-medium">Para</p>
                                    <p className="text-sm text-atlas-dark font-medium truncate">{action.payload.to || 'Desconhecido'}</p>
                                </div>

                                <div>
                                    <p className="text-xs text-atlas-dark/45 font-medium">Assunto</p>
                                    <p className="text-sm text-atlas-dark truncate">{action.payload.subject}</p>
                                </div>

                                <div>
                                    <p className="text-xs text-atlas-dark/45 font-medium mb-1">Mensagem Gerada</p>
                                    <div className="bg-black/[0.02] rounded-lg p-3 text-sm text-atlas-dark/70 h-32 overflow-y-auto whitespace-pre-wrap">
                                        {action.payload.body}
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-black/5 p-3 bg-black/[0.015] flex gap-2">
                                <button
                                    onClick={() => handleApprove(action.id)}
                                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
                                >
                                    <IconCheck className="w-4 h-4" />
                                    Aprovar Envio
                                </button>
                                <button
                                    onClick={() => handleDiscard(action.id)}
                                    className="flex items-center justify-center bg-white hover:bg-red-50 text-red-600 border border-black/10 py-2 px-3 rounded-lg text-sm transition-colors"
                                    title="Descartar"
                                >
                                    <IconClose className="w-4 h-4" />
                                </button>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </motion.div>
        </div>
    );
}
