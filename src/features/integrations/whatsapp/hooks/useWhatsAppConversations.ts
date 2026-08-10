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

    useEffect(() => {
        if (!connected) {
            setConversations([]);
            return;
        }

        let cancelled = false;
        const load = async () => {
            try {
                const data = await api.get<WhatsAppConversationDto[]>('/api/whatsapp/conversations');
                if (!cancelled) setConversations(data);
            } catch {
                // Falha silenciosa no polling — mesma decisão de useWhatsAppMessages.
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

    return { conversations, loading };
}
