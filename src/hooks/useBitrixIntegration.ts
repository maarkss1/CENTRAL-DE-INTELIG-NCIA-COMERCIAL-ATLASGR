import { useEffect, useState } from 'react';
import { toast } from '../lib/toast';
import { clientLogger } from '../lib/clientLogger';

interface BitrixConnectionSummary {
    id: string;
    label: string;
    portalDomain: string | null;
}

/** Estado/ações das conexões Bitrix24 na tela de Integrações — extraído de Integrations.tsx (FRONT-006). */
export function useBitrixIntegration() {
    const [bitrixConnections, setBitrixConnections] = useState<BitrixConnectionSummary[]>([]);
    const [selectedBitrixConnectionId, setSelectedBitrixConnectionId] = useState<string | null>(null);
    const [bitrixWebhookInput, setBitrixWebhookInput] = useState('');
    const [bitrixLabelInput, setBitrixLabelInput] = useState('');
    const [bitrixLoading, setBitrixLoading] = useState(false);

    const fetchBitrixConnections = async () => {
        try {
            const res = await fetch('/api/bitrix/connections');
            const data = await res.json();
            if (data.success) {
                const connections: BitrixConnectionSummary[] = data.data;
                setBitrixConnections(connections);
                // Mantém a seleção atual se ela ainda existir; senão cai pra primeira conexão.
                setSelectedBitrixConnectionId((prev) => (prev && connections.some((c) => c.id === prev) ? prev : connections[0]?.id ?? null));
            }
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to fetch Bitrix24 connections');
        }
    };

    useEffect(() => {
        fetchBitrixConnections();
    }, []);

    const handleBitrixConnect = async () => {
        if (!bitrixWebhookInput.trim()) {
            toast.error('Cole a URL do webhook de entrada do Bitrix24.');
            return;
        }
        setBitrixLoading(true);
        try {
            const res = await fetch('/api/bitrix/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ webhookUrl: bitrixWebhookInput.trim(), label: bitrixLabelInput.trim() || undefined }),
            });
            const data = await res.json();
            if (data.success) {
                setBitrixWebhookInput('');
                setBitrixLabelInput('');
                setSelectedBitrixConnectionId(data.data.id);
                await fetchBitrixConnections();
                toast.success('Bitrix24 conectado com sucesso.');
            } else {
                toast.error(data.error || 'Não foi possível conectar ao Bitrix24.');
            }
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to connect Bitrix24');
            toast.error('Não foi possível conectar ao Bitrix24.');
        }
        setBitrixLoading(false);
    };

    const handleBitrixDisconnect = async (connectionId: string) => {
        setBitrixLoading(true);
        try {
            await fetch(`/api/bitrix/disconnect/${connectionId}`, { method: 'POST' });
            await fetchBitrixConnections();
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to disconnect Bitrix24');
        }
        setBitrixLoading(false);
    };

    return {
        bitrixConnections,
        selectedBitrixConnectionId,
        setSelectedBitrixConnectionId,
        bitrixWebhookInput,
        setBitrixWebhookInput,
        bitrixLabelInput,
        setBitrixLabelInput,
        bitrixLoading,
        handleBitrixConnect,
        handleBitrixDisconnect,
    };
}
