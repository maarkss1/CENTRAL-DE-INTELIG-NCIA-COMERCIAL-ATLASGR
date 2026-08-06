import { useEffect, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { IconWrench } from '../../../components/icons';
import { toast } from '../../../lib/toast';
import { BitrixImportPanel } from './BitrixImportPanel';
import { BitrixSyncRulesPanel } from './BitrixSyncRulesPanel';

interface UpcomingEvent {
    id: string;
    summary: string;
    start: string | null;
}

interface BitrixConnectionSummary {
    id: string;
    label: string;
    portalDomain: string | null;
}

export function Integrations() {
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('disconnected');
    const [loading, setLoading] = useState(false);

    const [googleConnected, setGoogleConnected] = useState(false);
    const [googleEmail, setGoogleEmail] = useState<string | null>(null);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);

    const [bitrixConnections, setBitrixConnections] = useState<BitrixConnectionSummary[]>([]);
    const [selectedBitrixConnectionId, setSelectedBitrixConnectionId] = useState<string | null>(null);
    const [bitrixWebhookInput, setBitrixWebhookInput] = useState('');
    const [bitrixLabelInput, setBitrixLabelInput] = useState('');
    const [bitrixLoading, setBitrixLoading] = useState(false);

    // 3CX PABX State
    const [threecxConnections, setThreecxConnections] = useState<Array<{ id: string; label: string; pbxUrl: string; extension: string; autoDialEnabled: boolean }>>([]);
    const [threecxPbxUrlInput, setThreecxPbxUrlInput] = useState('');
    const [threecxExtensionInput, setThreecxExtensionInput] = useState('');
    const [threecxLabelInput, setThreecxLabelInput] = useState('');
    const [threecxLoading, setThreecxLoading] = useState(false);
    
    type Tab = 'whatsapp' | 'google' | 'bitrix' | '3cx';
    const [activeTab, setActiveTab] = useState<Tab>('whatsapp');

    const fetchThreeCXConnections = async () => {
        try {
            const res = await fetch('/api/integrations/3cx/connections');
            const data = await res.json();
            if (data.success) {
                setThreecxConnections(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch 3CX connections', error);
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/whatsapp/status');
            const data = await res.json();
            if (data.success) {
                setStatus(data.data.status);
                setQrCode(data.data.qr);
            }
        } catch (error) {
            console.error('Failed to fetch WhatsApp status', error);
        }
    };

    const fetchGoogleStatus = async () => {
        try {
            const res = await fetch('/api/google/status');
            const data = await res.json();
            if (data.success) {
                setGoogleConnected(data.data.connected);
                setGoogleEmail(data.data.email);
                if (data.data.connected) {
                    const eventsRes = await fetch('/api/google/calendar/upcoming');
                    const eventsData = await eventsRes.json();
                    if (eventsData.success) setUpcomingEvents(eventsData.data);
                }
            }
        } catch (error) {
            console.error('Failed to fetch Google status', error);
        }
    };

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
            console.error('Failed to fetch Bitrix24 connections', error);
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchGoogleStatus();
        fetchBitrixConnections();
        fetchThreeCXConnections();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
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

    const handleConnect = async () => {
        setLoading(true);
        try {
            await fetch('/api/whatsapp/connect', { method: 'POST' });
        } catch (error) {
            console.error('Failed to connect', error);
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
            console.error('Failed to disconnect', error);
        }
        setLoading(false);
    };

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
            console.error('Failed to start Google connect', error);
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
        } catch (error) {
            console.error('Failed to disconnect Google', error);
        }
        setGoogleLoading(false);
    };

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
            console.error('Failed to connect Bitrix24', error);
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
            console.error('Failed to disconnect Bitrix24', error);
        }
        setBitrixLoading(false);
    };

    return (
        <div className="flex-1 overflow-hidden flex bg-gray-50/50 transition-colors duration-300">
            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-[var(--brand-primary)] border border-gray-200">
                            <IconWrench className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Integrações</h1>
                        </div>
                    </div>
                </div>
                <div className="p-4 space-y-1 flex-1 overflow-y-auto">
                    <button
                        onClick={() => setActiveTab('whatsapp')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'whatsapp' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <span className="text-lg">💬</span> WhatsApp
                    </button>
                    <button
                        onClick={() => setActiveTab('google')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'google' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <span className="text-lg">📧</span> Google Workspace
                    </button>
                    <button
                        onClick={() => setActiveTab('bitrix')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'bitrix' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <span className="text-lg">🔗</span> Bitrix24
                    </button>
                    <button
                        onClick={() => setActiveTab('3cx')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === '3cx' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <IconWrench className="w-4 h-4 text-sky-500" /> PABX 3CX
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-4xl mx-auto">


                    {activeTab === 'whatsapp' && (
                    <Card className="p-8 bg-white dark:bg-white/5 border border-gray-100 shadow-sm rounded-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">WhatsApp</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Disparo de quebra-gelos automático via WhatsApp.</p>
                            </div>
                            <div className="w-12 h-12 bg-green-50 dark:bg-green-500/10 rounded-full flex items-center justify-center">
                                <span className="text-2xl">💬</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Conectando...' : 'Desconectado'}
                                </span>
                            </div>

                            {status === 'disconnected' && (
                                <button
                                    onClick={handleConnect}
                                    disabled={loading}
                                    className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                                >
                                    {loading ? 'Iniciando...' : 'Conectar WhatsApp'}
                                </button>
                            )}

                            {status === 'connecting' && qrCode && (
                                <div className="text-center p-4 bg-gray-50 dark:bg-black/20 rounded-lg border border-gray-100">
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Escaneie o QR Code abaixo:</p>
                                    <img src={qrCode} alt="WhatsApp QR Code" className="mx-auto rounded-xl shadow-sm border border-gray-200 dark:border-white/10" />
                                </div>
                            )}

                            {status === 'connected' && (
                                <button
                                    onClick={handleDisconnect}
                                    disabled={loading}
                                    className="w-full py-2 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 font-medium rounded-lg transition-colors"
                                >
                                    {loading ? 'Desconectando...' : 'Desconectar'}
                                </button>
                            )}
                        </div>
                    </Card>
                    )}

                    {activeTab === 'google' && (
                    <Card className="p-8 bg-white dark:bg-white/5 border border-gray-100 shadow-sm rounded-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Google Workspace</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Gmail e Calendar integrados.</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center">
                                <span className="text-2xl">📧</span>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${googleConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {googleConnected ? `Conectado (${googleEmail})` : 'Desconectado'}
                                </span>
                            </div>

                            {googleConnected ? (
                                <>
                                    {upcomingEvents.length > 0 && (
                                        <div className="space-y-1.5">
                                            <p className="text-xs text-gray-500 font-medium">Próximos eventos do Calendar</p>
                                            {upcomingEvents.map((event) => (
                                                <div key={event.id} className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-black/20 border border-gray-100 rounded-lg px-3 py-2 truncate">
                                                    {event.summary}
                                                    {event.start && <span className="text-gray-400 text-xs ml-2">{new Date(event.start).toLocaleString('pt-BR')}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        onClick={handleGoogleDisconnect}
                                        disabled={googleLoading}
                                        className="w-full py-2 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 font-medium rounded-lg transition-colors"
                                    >
                                        {googleLoading ? 'Desconectando...' : 'Desconectar'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={handleGoogleConnect}
                                    disabled={googleLoading}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                                >
                                    {googleLoading ? 'Conectando...' : 'Conectar Conta Google'}
                                </button>
                            )}
                        </div>
                    </Card>
                    )}

                    {activeTab === 'bitrix' && (
                    <Card className="p-8 bg-white dark:bg-white/5 border border-gray-100 shadow-sm rounded-2xl">
                        <div className="flex items-start justify-between mb-8">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bitrix24</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
                                    Todo lead novo do Atlas vai automaticamente pro primeiro portal Bitrix24 conectado. A importação do Bitrix pro Atlas é manual — você escolhe o que trazer, portal por portal.
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-500/10 rounded-full flex items-center justify-center shrink-0">
                                <span className="text-2xl">🔗</span>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {bitrixConnections.length > 0 && (
                                <div className="space-y-2">
                                    {bitrixConnections.map((conn) => (
                                        <div
                                            key={conn.id}
                                            className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${selectedBitrixConnectionId === conn.id ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-500/10 shadow-sm' : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                            onClick={() => setSelectedBitrixConnectionId(conn.id)}
                                        >
                                            <span className={`w-3 h-3 rounded-full ${selectedBitrixConnectionId === conn.id ? 'bg-green-500' : 'bg-gray-300'} shrink-0`} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{conn.label}</p>
                                                {conn.portalDomain && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{conn.portalDomain}</p>}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleBitrixDisconnect(conn.id); }}
                                                disabled={bitrixLoading}
                                                className="shrink-0 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 transition-colors"
                                            >
                                                Desconectar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="p-5 rounded-xl border border-dashed border-gray-300 dark:border-white/20 bg-gray-50/50 space-y-4">
                                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                    {bitrixConnections.length > 0 ? 'Conectar outro portal Bitrix24' : 'Conectar Bitrix24'}
                                </p>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={bitrixLabelInput}
                                        onChange={(e) => setBitrixLabelInput(e.target.value)}
                                        placeholder="Nome pra identificar (ex.: AtlasGR, TotalTrac)"
                                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 shadow-sm bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    />
                                    <input
                                        type="url"
                                        value={bitrixWebhookInput}
                                        onChange={(e) => setBitrixWebhookInput(e.target.value)}
                                        placeholder="https://seudominio.bitrix24.com.br/rest/1/xxxxxxxx/"
                                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 shadow-sm bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Gere em Bitrix24 → Aplicativos → Webhooks → Webhook de entrada, com permissão <strong className="font-bold text-gray-700">crm</strong>.
                                </p>
                                <button
                                    onClick={handleBitrixConnect}
                                    disabled={bitrixLoading}
                                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 shadow-sm disabled:opacity-60 text-white font-bold rounded-lg transition-colors"
                                >
                                    {bitrixLoading ? 'Validando webhook...' : 'Conectar'}
                                </button>
                            </div>

                            {selectedBitrixConnectionId && (
                                <div className="space-y-6 pt-2">
                                    <BitrixImportPanel connectionId={selectedBitrixConnectionId} />
                                    <BitrixSyncRulesPanel connectionId={selectedBitrixConnectionId} />
                                </div>
                            )}
                        </div>
                    </Card>
                    )}

                    {/* 3CX PABX Telephony Card */}
                    {activeTab === '3cx' && (
                    <Card className="glass-card p-8 border border-gray-100 shadow-sm rounded-2xl">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
                                    <IconWrench className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">PABX Telefonia 3CX</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Click-to-Call, gravação de chamadas e prospecção fria de IA 24h via 3CX IP PBX.
                                    </p>
                                </div>
                            </div>
                            <span className={`px-3 py-1.5 text-xs font-bold rounded-lg ${threecxConnections.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                {threecxConnections.length > 0 ? 'Ativo 24h' : 'Não conectado'}
                            </span>
                        </div>

                        <div className="space-y-6">
                            {threecxConnections.length > 0 && (
                                <div className="space-y-3">
                                    {threecxConnections.map((conn) => (
                                        <div key={conn.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{conn.label}</p>
                                                    <p className="text-xs text-gray-500">{conn.pbxUrl} — Ramal {conn.extension}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handle3CXTest(conn.id)}
                                                    className="px-3 py-2 text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg transition-colors border border-sky-100"
                                                >
                                                    Testar PABX
                                                </button>
                                                <button
                                                    onClick={() => handle3CXDisconnect(conn.id)}
                                                    disabled={threecxLoading}
                                                    className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    Desconectar
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="p-5 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 space-y-4">
                                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                    {threecxConnections.length > 0 ? 'Conectar outro PABX 3CX' : 'Conectar Servidor 3CX PABX'}
                                </p>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={threecxLabelInput}
                                        onChange={(e) => setThreecxLabelInput(e.target.value)}
                                        placeholder="Nome de exibição (ex.: 3CX Comercial, Ramal 101)"
                                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 shadow-sm bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                                    />
                                    <input
                                        type="url"
                                        value={threecxPbxUrlInput}
                                        onChange={(e) => setThreecxPbxUrlInput(e.target.value)}
                                        placeholder="https://seu-pabx.3cx.us"
                                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 shadow-sm bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                                    />
                                    <input
                                        type="text"
                                        value={threecxExtensionInput}
                                        onChange={(e) => setThreecxExtensionInput(e.target.value)}
                                        placeholder="Ramal (ex.: 101)"
                                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 shadow-sm bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                                    />
                                </div>
                                <button
                                    onClick={handle3CXConnect}
                                    disabled={threecxLoading}
                                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 shadow-sm disabled:opacity-60 text-white font-bold rounded-lg transition-colors"
                                >
                                    {threecxLoading ? 'Registrando 3CX...' : 'Conectar 3CX PABX'}
                                </button>
                            </div>
                        </div>
                    </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
