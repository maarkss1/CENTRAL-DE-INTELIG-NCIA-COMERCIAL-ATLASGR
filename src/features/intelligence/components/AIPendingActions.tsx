import { useEffect, useState, type ReactNode } from 'react';
import { Bot, BrainCircuit, CalendarClock, Check, Mail, ShieldCheck, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { clientLogger } from '../../../lib/clientLogger';

interface PendingActionPayload {
    to?: string;
    subject?: string;
    body?: string;
    leadId?: string;
    synthesis?: string;
    trigger?: string;
    triggerDetail?: string;
    role?: string;
    date?: string;
    observations?: string;
}

interface PendingAction {
    id: string;
    entity: string;
    action: string;
    payload: PendingActionPayload;
    agentRole?: string | null;
    riskLevel?: string;
    confidence?: number | null;
    createdAt?: string;
}

interface ActionPresentation {
    title: string;
    approveLabel: string;
    approveTitle: string;
    icon: ReactNode;
}

function presentationFor(action: PendingAction): ActionPresentation {
    if (action.action === 'send_email') {
        return {
            title: 'Primeiro contato do SDR',
            approveLabel: 'Aprovar e enviar',
            approveTitle: 'Envia via SMTP; sem SMTP, abre o rascunho no cliente de e-mail.',
            icon: <Mail className="w-4 h-4 mr-2" />,
        };
    }
    if (action.action === 'create_follow_up') {
        return {
            title: 'Atividade sugerida',
            approveLabel: 'Criar atividade',
            approveTitle: 'Cria a atividade vinculada ao lead no CRM.',
            icon: <CalendarClock className="w-4 h-4 mr-2" />,
        };
    }
    return {
        title: `${action.agentRole || action.payload.role || 'IA'} · recomendação`,
        approveLabel: 'Salvar no CRM',
        approveTitle: 'Salva a recomendação como nota auditável no histórico do lead.',
        icon: <BrainCircuit className="w-4 h-4 mr-2" />,
    };
}

function riskLabel(level?: string): string {
    if (level === 'high') return 'Risco alto';
    if (level === 'low') return 'Risco baixo';
    return 'Risco médio';
}

export function AIPendingActions() {
    const [actions, setActions] = useState<PendingAction[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchActions = async () => {
        try {
            const response = await api.get<PendingAction[]>('/api/intelligence/pending');
            setActions(Array.isArray(response) ? response : []);
        } catch (error) {
            clientLogger.error({ err: error }, 'Error fetching AI actions');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchActions();
    }, []);

    const handleApprove = async (action: PendingAction) => {
        setProcessingId(action.id);
        try {
            const result = await api.post<{ execution: { sent: boolean; reason?: string } }>(
                `/api/intelligence/pending/${action.id}/approve`,
            );

            // O fallback manual só faz sentido para e-mail. Recomendações antes abriam um mailto
            // vazio porque toda ação era renderizada como se fosse mensagem externa.
            if (!result.execution.sent && action.action === 'send_email') {
                const to = encodeURIComponent(action.payload.to || '');
                const subject = encodeURIComponent(action.payload.subject || '');
                const body = encodeURIComponent(action.payload.body || '');
                window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
            }

            setActions((previous) => previous.filter((item) => item.id !== action.id));
        } catch (error) {
            clientLogger.error({ err: error }, 'Error approving AI action');
        } finally {
            setProcessingId(null);
        }
    };

    const handleDiscard = async (id: string) => {
        setProcessingId(id);
        try {
            await api.delete(`/api/intelligence/pending/${id}`);
            setActions((previous) => previous.filter((action) => action.id !== id));
        } catch (error) {
            clientLogger.error({ err: error }, 'Error discarding AI action');
        } finally {
            setProcessingId(null);
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
                <p className="text-ink-2">O piloto automático segue monitorando o funil em segundo plano.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-xl font-bold text-ink flex items-center">
                        <Bot className="mr-2 w-6 h-6 text-indigo-600" />
                        Central de decisões autônomas
                    </h2>
                    <p className="text-sm text-ink-2 mt-1">Cada ação mostra origem, risco, confiança e evidência antes da execução.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-3 py-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {actions.length} decisão{actions.length === 1 ? '' : 'ões'} aguardando revisão
                </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {actions.map((action) => {
                    const presentation = presentationFor(action);
                    const isEmail = action.action === 'send_email';
                    const busy = processingId === action.id;
                    return (
                        <article key={action.id} className="bg-surface rounded-xl shadow-sm border border-line overflow-hidden hover:shadow-md transition-shadow">
                            <header className="bg-indigo-50 border-b border-indigo-100 px-4 py-3 flex items-center justify-between gap-3">
                                <div className="flex items-center text-indigo-800 font-medium text-sm min-w-0">
                                    {presentation.icon}
                                    <span className="truncate">{presentation.title}</span>
                                </div>
                                <span className={`text-[11px] px-2 py-1 rounded-full font-semibold whitespace-nowrap ${action.riskLevel === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                    {riskLabel(action.riskLevel)}
                                </span>
                            </header>

                            <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
                                    <span>{action.entity}{action.payload.leadId ? ` · ${action.payload.leadId.slice(0, 10)}…` : ''}</span>
                                    {action.confidence != null && <span>Confiança {Math.round(action.confidence * 100)}%</span>}
                                </div>

                                {isEmail ? (
                                    <>
                                        <div>
                                            <p className="text-xs text-ink-2 font-medium">Para</p>
                                            <p className="text-sm text-ink font-medium truncate">{action.payload.to || 'Destinatário não identificado'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-ink-2 font-medium">Assunto</p>
                                            <p className="text-sm text-ink">{action.payload.subject || 'Sem assunto'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-ink-2 font-medium mb-1">Mensagem gerada com playbook</p>
                                            <div className="bg-surface-2 rounded-md p-3 text-sm text-ink-2 h-36 overflow-y-auto whitespace-pre-wrap">
                                                {action.payload.body}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {action.payload.triggerDetail && (
                                            <div>
                                                <p className="text-xs text-ink-2 font-medium mb-1">Evidência que ativou o agente</p>
                                                <p className="text-sm text-ink">{action.payload.triggerDetail}</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-xs text-ink-2 font-medium mb-1">Decisão recomendada</p>
                                            <div className="bg-surface-2 rounded-md p-3 text-sm text-ink-2 h-40 overflow-y-auto whitespace-pre-wrap">
                                                {action.payload.synthesis || action.payload.observations || 'Sem detalhamento textual.'}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <footer className="border-t border-line p-3 bg-surface-2 flex gap-2">
                                <button
                                    onClick={() => void handleApprove(action)}
                                    disabled={busy}
                                    className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                                    title={presentation.approveTitle}
                                >
                                    <Check className="w-4 h-4 mr-1.5" />
                                    {busy ? 'Processando...' : presentation.approveLabel}
                                </button>
                                <button
                                    onClick={() => void handleDiscard(action.id)}
                                    disabled={busy}
                                    className="flex items-center justify-center bg-surface hover:bg-red-50 disabled:opacity-60 text-red-600 border border-line py-2 px-3 rounded-lg text-sm transition-colors"
                                    title="Descartar mantendo o registro de auditoria"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </footer>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
