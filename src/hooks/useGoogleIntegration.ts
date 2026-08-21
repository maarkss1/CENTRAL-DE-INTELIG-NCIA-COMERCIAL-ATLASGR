import { useEffect, useState } from 'react';
import { toast } from '../lib/toast';
import { clientLogger } from '../lib/clientLogger';

interface UpcomingEvent {
    id: string;
    summary: string;
    start: string | null;
}

/** Estado/ações da conexão Google Workspace na tela de Integrações — extraído de Integrations.tsx (FRONT-006). */
export function useGoogleIntegration() {
    const [googleConnected, setGoogleConnected] = useState(false);
    const [googleEmail, setGoogleEmail] = useState<string | null>(null);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
    // Conexões feitas antes do escopo `calendar.events` (Onda 27/QA) ficaram só com
    // `calendar.readonly` — o Google não amplia escopo de um token já emitido, então a escrita real
    // via Cadência falharia (403) silenciosamente até a organização reconectar. Sem este sinal, a
    // tela de Integrações afirmaria escrita real pra uma conexão que na prática ainda não tem o
    // escopo (ver Onda 3 — "Integrações honestas").
    const [hasCalendarWriteScope, setHasCalendarWriteScope] = useState(false);

    const fetchGoogleStatus = async () => {
        try {
            const res = await fetch('/api/google/status');
            const data = await res.json();
            if (data.success) {
                setGoogleConnected(data.data.connected);
                setGoogleEmail(data.data.email);
                setHasCalendarWriteScope(!!data.data.hasCalendarWriteScope);
                if (data.data.connected) {
                    const eventsRes = await fetch('/api/google/calendar/upcoming');
                    const eventsData = await eventsRes.json();
                    if (eventsData.success) setUpcomingEvents(eventsData.data);
                }
            }
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to fetch Google status');
        }
    };

    useEffect(() => {
        fetchGoogleStatus();
    }, []);

    // Depois do callback OAuth (google.routes.ts redireciona pra cá com ?google=connected|error),
    // mostra o resultado e limpa a URL — sem isso, um F5 na página reenviaria os mesmos parâmetros.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const googleParam = params.get('google');
        if (googleParam === 'connected') {
            toast.success('Google Workspace conectado com sucesso.');
        } else if (googleParam === 'error') {
            toast.error(params.get('message') || 'Falha ao conectar com o Google.');
        }
        if (googleParam) {
            params.delete('google');
            params.delete('message');
            const query = params.toString();
            window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
        }
    }, []);

    const handleGoogleConnect = async () => {
        setGoogleLoading(true);
        try {
            const res = await fetch('/api/google/auth-url');
            const data = await res.json();
            if (data.success) {
                window.location.href = data.data.url;
                return;
            }
            toast.error(data.error || 'Não foi possível iniciar a conexão com o Google.');
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to start Google connect');
            toast.error('Não foi possível iniciar a conexão com o Google.');
        }
        setGoogleLoading(false);
    };

    const handleGoogleDisconnect = async () => {
        setGoogleLoading(true);
        try {
            await fetch('/api/google/disconnect', { method: 'POST' });
            setGoogleConnected(false);
            setGoogleEmail(null);
            setUpcomingEvents([]);
            setHasCalendarWriteScope(false);
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to disconnect Google');
        }
        setGoogleLoading(false);
    };

    return { googleConnected, googleEmail, googleLoading, upcomingEvents, hasCalendarWriteScope, handleGoogleConnect, handleGoogleDisconnect };
}
