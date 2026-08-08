import { useEffect, useState } from 'react';
import { clientLogger } from '../lib/clientLogger';

/** Estado/ações da conexão WhatsApp (Baileys) na tela de Integrações — extraído de Integrations.tsx (FRONT-006). */
export function useWhatsAppIntegration() {
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('disconnected');
    const [loading, setLoading] = useState(false);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/whatsapp/status');
            const data = await res.json();
            if (data.success) {
                setStatus(data.data.status);
                setQrCode(data.data.qr);
            }
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to fetch WhatsApp status');
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleConnect = async () => {
        setLoading(true);
        try {
            await fetch('/api/whatsapp/connect', { method: 'POST' });
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to connect');
        }
        setLoading(false);
    };

    const handleDisconnect = async () => {
        setLoading(true);
        try {
            await fetch('/api/whatsapp/disconnect', { method: 'POST' });
            setStatus('disconnected');
            setQrCode(null);
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to disconnect');
        }
        setLoading(false);
    };

    return { qrCode, status, loading, handleConnect, handleDisconnect };
}
