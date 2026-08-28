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
      if (!res.ok || !data.success) {
        // Achado de auditoria (onda 12): quando a rota respondia erro (ex.: conexão de
        // outro tenant, falha no banco), o hook não mostrava nada — o usuário via o botão
        // "Desconectar" não fazer nada, sem saber se deu certo ou não.
        toast.error(data.error || 'Erro ao desconectar 3CX.');
        return;
      }
      toast.success('PABX 3CX desconectado.');
      fetchThreeCXConnections();
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
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Não foi possível testar a comunicação com o 3CX.');
        return;
      }
      // BUG DE AUDITORIA (onda 12, mesma classe do bloqueador #7 do AGENTS.md — "afirma que
      // fez/confirmou algo sem confirmar de verdade"): `data.success` é só o envelope HTTP da
      // rota (sempre `true` quando a requisição foi processada, mesmo que o PABX não tenha
      // respondido). O resultado REAL do healthcheck é `data.data.success`
      // (`test3CXConnection`, threecx.service.ts) — o código antigo ignorava esse campo e
      // sempre mostrava um toast de SUCESSO com `data.data.message`, inclusive quando a
      // mensagem era literalmente "Servidor 3CX respondeu com erro" ou "Tempo limite
      // esgotado": o vendedor via uma confirmação verde de que o PABX estava pronto para
      // ligar, exatamente quando ele não estava.
      if (data.data?.success) {
        toast.success(data.data.message || 'PABX 3CX pronto para chamadas!');
      } else {
        toast.error(data.data?.message || 'PABX 3CX não respondeu ao teste de comunicação.');
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
