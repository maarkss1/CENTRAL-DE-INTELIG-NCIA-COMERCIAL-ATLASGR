import { useEffect, useState } from 'react';
import { toast } from '../lib/toast';
import { clientLogger } from '../lib/clientLogger';

interface BitrixConnectionSummary {
    id: string;
    label: string;
    portalDomain: string | null;
    webhookReceiverUrl: string;
    hasWebhookSecret: boolean;
    inboundEventsEnabled: boolean;
}

/** Estado/ações das conexões Bitrix24 na tela de Integrações — extraído de Integrations.tsx (FRONT-006). */
export function useBitrixIntegration() {
    const [bitrixConnections, setBitrixConnections] = useState<BitrixConnectionSummary[]>([]);
    const [selectedBitrixConnectionId, setSelectedBitrixConnectionId] = useState<string | null>(null);
    const [bitrixWebhookInput, setBitrixWebhookInput] = useState('https://atlasgr.bitrix24.com.br/rest/450/xa4srbrft9jpe880/');
    const [bitrixLabelInput, setBitrixLabelInput] = useState('AtlasGR Bitrix24');
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
            const res = await fetch(`/api/bitrix/disconnect/${connectionId}`, { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                // Antes desta correção, uma falha aqui só ia pro console (clientLogger.error) — a
                // conexão simplesmente continuava na lista sem nenhuma explicação visível pra
                // pessoa que acabou de clicar "Desconectar" (achado P3-3 da auditoria).
                toast.error(data.error || 'Não foi possível desconectar este portal Bitrix24.');
            }
            await fetchBitrixConnections();
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to disconnect Bitrix24');
            toast.error('Não foi possível desconectar este portal Bitrix24.');
        }
        setBitrixLoading(false);
    };

    /** Segredo em texto puro só existe nesta resposta — a pessoa precisa colar no admin do Bitrix agora. */
    const handleGenerateWebhookSecret = async (connectionId: string): Promise<{ webhookSecret: string; webhookReceiverUrl: string } | null> => {
        setBitrixLoading(true);
        try {
            const res = await fetch(`/api/bitrix/connections/${connectionId}/webhook-secret`, { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                toast.error(data.error || 'Não foi possível gerar o segredo do webhook.');
                return null;
            }
            await fetchBitrixConnections();
            return data.data as { webhookSecret: string; webhookReceiverUrl: string };
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to generate Bitrix24 webhook secret');
            toast.error('Não foi possível gerar o segredo do webhook.');
            return null;
        } finally {
            setBitrixLoading(false);
        }
    };

    const handleToggleInboundEvents = async (connectionId: string, enabled: boolean) => {
        setBitrixLoading(true);
        try {
            const res = await fetch(`/api/bitrix/connections/${connectionId}/inbound-events`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            });
            const data = await res.json();
            if (!data.success) {
                toast.error(data.error || 'Não foi possível atualizar o recebimento de eventos.');
            } else {
                toast.success(enabled ? 'Recebimento de eventos do Bitrix24 ativado.' : 'Recebimento de eventos do Bitrix24 desativado.');
            }
            await fetchBitrixConnections();
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to toggle Bitrix24 inbound events');
            toast.error('Não foi possível atualizar o recebimento de eventos.');
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
        handleGenerateWebhookSecret,
        handleToggleInboundEvents,
    };
}
