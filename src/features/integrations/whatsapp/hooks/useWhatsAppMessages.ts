import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';

export interface WhatsAppMessageDto {
    id: string;
    direction: 'inbound' | 'outbound';
    body: string | null;
    receivedAt: string;
}

const POLL_INTERVAL_MS = 5000;

/**
 * Histórico + envio de mensagens de uma conversa (um número) — extraído de WhatsAppChatPanel.tsx
 * pra ser reusado também pelo painel "WhatsApp Web" embutido em Integrations.tsx, sem duplicar a
 * lógica de polling/envio nos dois lugares.
 */
export function useWhatsAppMessages(phone: string | null, connected: boolean) {
    const [messages, setMessages] = useState<WhatsAppMessageDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setError(null);
        if (!phone || !connected) {
            setMessages([]);
            return;
        }

        let cancelled = false;
        let firstLoad = true;
        const loadMessages = async () => {
            try {
                const data = await api.get<WhatsAppMessageDto[]>(`/api/whatsapp/messages?phone=${encodeURIComponent(phone)}`);
                if (cancelled) return;
                setMessages([...data].reverse());
                setError(null);
            } catch (err) {
                // Só reporta erro na carga inicial — uma falha de poll em segundo plano não deve
                // apagar/interromper a conversa já carregada com sucesso antes. Sem isso, uma falha
                // real na primeira carga (401/500) parece silenciosamente "conversa vazia".
                if (!cancelled && firstLoad) {
                    setError(err instanceof Error ? err.message : 'Não foi possível carregar as mensagens.');
                }
            } finally {
                firstLoad = false;
            }
        };

        setLoading(true);
        loadMessages().finally(() => { if (!cancelled) setLoading(false); });
        const interval = window.setInterval(loadMessages, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [phone, connected]);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || !phone || sending) return;
        setSending(true);
        setError(null);
        try {
            await api.post('/api/whatsapp/send', { number: phone, text: trimmed });
            setMessages((prev) => [...prev, { id: `local-${Date.now()}`, direction: 'outbound', body: trimmed, receivedAt: new Date().toISOString() }]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
            throw err;
        } finally {
            setSending(false);
        }
    }, [phone, sending]);

    return { messages, loading, sending, error, sendMessage };
}
