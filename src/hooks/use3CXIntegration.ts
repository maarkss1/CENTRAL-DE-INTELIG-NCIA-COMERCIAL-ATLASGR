import { useEffect, useState } from 'react';
import { toast } from '../lib/toast';
import { clientLogger } from '../lib/clientLogger';

interface ThreeCXConnection {
    id: string;
    label: string;
    pbxUrl: string;
    extension: string;
    autoDialEnabled: boolean;
}

/** Estado/ações das conexões PABX 3CX na tela de Integrações — extraído de Integrations.tsx (FRONT-006). */
export function use3CXIntegration() {
    const [threecxConnections, setThreecxConnections] = useState<ThreeCXConnection[]>([]);
    const [threecxPbxUrlInput, setThreecxPbxUrlInput] = useState('');
    const [threecxExtensionInput, setThreecxExtensionInput] = useState('');
    const [threecxLabelInput, setThreecxLabelInput] = useState('');
    const [threecxLoading, setThreecxLoading] = useState(false);

    const fetchThreeCXConnections = async () => {
        try {
            const res = await fetch('/api/integrations/3cx/connections');
            const data = await res.json();
            if (data.success) {
                setThreecxConnections(data.data);
            }
        } catch (error) {
            clientLogger.error({ err: error }, 'Failed to fetch 3CX connections');
        }
    };

    useEffect(() => {
        fetchThreeCXConnections();
    }, []);

    const handle3CXConnect = async () => {
        if (!threecxPbxUrlInput.trim() || !threecxExtensionInput.trim()) {
            toast.error('Informe a URL do PABX 3CX e o Ramal.');
            return;
        }
        setThreecxLoading(true);
        try {
            const res = await fetch('/api/integrations/3cx/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pbxUrl: threecxPbxUrlInput,
                    extension: threecxExtensionInput,
                    label: threecxLabelInput || `3CX Ramal ${threecxExtensionInput}`,
                    autoDialEnabled: true,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Falha ao conectar PABX 3CX.');
            }
            toast.success('PABX 3CX registrado com sucesso!');
            setThreecxPbxUrlInput('');
            setThreecxExtensionInput('');
            setThreecxLabelInput('');
            fetchThreeCXConnections();
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setThreecxLoading(false);
        }
    };

    const handle3CXDisconnect = async (id: string) => {
        setThreecxLoading(true);
        try {
            const res = await fetch(`/api/integrations/3cx/disconnect/${id}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                toast.success('PABX 3CX desconectado.');
                fetchThreeCXConnections();
            }
        } catch {
            toast.error('Erro ao desconectar 3CX.');
        } finally {
            setThreecxLoading(false);
        }
    };

    const handle3CXTest = async (id: string) => {
        try {
            const res = await fetch(`/api/integrations/3cx/connections/${id}/test`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                toast.success(data.data.message || 'PABX 3CX pronto para chamadas!');
            }
        } catch {
            toast.error('Não foi possível testar a comunicação com o 3CX.');
        }
    };

    return {
        threecxConnections,
        threecxPbxUrlInput,
        setThreecxPbxUrlInput,
        threecxExtensionInput,
        setThreecxExtensionInput,
        threecxLabelInput,
        setThreecxLabelInput,
        threecxLoading,
        handle3CXConnect,
        handle3CXDisconnect,
        handle3CXTest,
    };
}
