import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';

export interface WhatsAppConversationDto {
    phoneE164: string;
    contactId: string | null;
    contactName: string | null;
    lastMessageBody: string | null;
    lastMessageDirection: 'inbound' | 'outbound';
    lastMessageAt: string;
}

const POLL_INTERVAL_MS = 5000;

/** Lista de conversas (uma por número) do painel "WhatsApp Web" — mesmo intervalo de polling de
 * useWhatsAppMessages, pra o resumo da última mensagem na lista não ficar defasado em relação ao
 * chat aberto. */
export function useWhatsAppConversations(connected: boolean) {
    const [conversations, setConversations] = useState<WhatsAppConversationDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setError(null);
        if (!connected) {
            setConversations([]);
            return;
        }

        let cancelled = false;
        let firstLoad = true;
        const load = async () => {
            try {
                const data = await api.get<WhatsAppConversationDto[]>('/api/whatsapp/conversations');
                if (cancelled) return;
                setConversations(data);
                setError(null);
            } catch (err) {
                // Só reporta erro na carga inicial — uma falha de poll em segundo plano não deve
                // apagar/interromper a lista já carregada com sucesso antes (mesma decisão de
                // useWhatsAppMessages). Sem isso, uma falha real (401/500) fica indistinguível de
                // "nenhuma conversa ainda" — a lista simplesmente nunca aparece, sem explicação.
                if (!cancelled && firstLoad) {
                    setError(err instanceof Error ? err.message : 'Não foi possível carregar as conversas.');
                }
            } finally {
                firstLoad = false;
            }
        };

        setLoading(true);
        load().finally(() => { if (!cancelled) setLoading(false); });
        const interval = window.setInterval(load, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [connected]);

    return { conversations, loading, error };
}
