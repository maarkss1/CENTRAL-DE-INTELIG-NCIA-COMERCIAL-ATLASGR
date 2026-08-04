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
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, []);

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
        <div className="flex-1 overflow-y-auto bg-white p-8 transition-colors duration-300">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center gap-4 border-b border-gray-200 pb-6">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-[var(--brand-primary)] border border-gray-200">
                        <IconWrench className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Integrações Omnicanal</h1>
                        <p className="text-gray-500">Conecte seus canais de comunicação com a IA do AtlasGR.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-8 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10">
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
                                <div className="text-center p-4 bg-gray-50 dark:bg-black/20 rounded-lg">
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

                    <Card className="p-8 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10">
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
                                                <div key={event.id} className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-black/20 rounded-lg px-3 py-2 truncate">
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

                    <Card className="p-8 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bitrix24</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Todo lead novo do Atlas vai automaticamente pro primeiro portal Bitrix24 conectado. A importação do Bitrix pro Atlas é manual — você escolhe o que trazer, portal por portal.</p>
                            </div>
                            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-500/10 rounded-full flex items-center justify-center">
                                <span className="text-2xl">🔗</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {bitrixConnections.length > 0 && (
                                <div className="space-y-2">
                                    {bitrixConnections.map((conn) => (
                                        <div
                                            key={conn.id}
                                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedBitrixConnectionId === conn.id ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10' : 'border-gray-100 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                            onClick={() => setSelectedBitrixConnectionId(conn.id)}
                                        >
                                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{conn.label}</p>
                                                {conn.portalDomain && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{conn.portalDomain}</p>}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleBitrixDisconnect(conn.id); }}
                                                disabled={bitrixLoading}
                                                className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                                            >
                                                Desconectar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="p-3 rounded-lg border border-dashed border-gray-200 dark:border-white/10 space-y-2">
                                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                    {bitrixConnections.length > 0 ? 'Conectar outro portal Bitrix24' : 'Conectar Bitrix24'}
                                </p>
                                <input
                                    type="text"
                                    value={bitrixLabelInput}
                                    onChange={(e) => setBitrixLabelInput(e.target.value)}
                                    placeholder="Nome pra identificar (ex.: AtlasGR, TotalTrac)"
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                                />
                                <input
                                    type="url"
                                    value={bitrixWebhookInput}
                                    onChange={(e) => setBitrixWebhookInput(e.target.value)}
                                    placeholder="https://seudominio.bitrix24.com.br/rest/1/xxxxxxxx/"
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Gere em Bitrix24 → Aplicativos → Webhooks → Webhook de entrada, com permissão <strong>crm</strong>.
                                </p>
                                <button
                                    onClick={handleBitrixConnect}
                                    disabled={bitrixLoading}
                                    className="w-full py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
                                >
                                    {bitrixLoading ? 'Validando webhook...' : 'Conectar'}
                                </button>
                            </div>

                            {selectedBitrixConnectionId && (
                                <>
                                    <BitrixImportPanel connectionId={selectedBitrixConnectionId} />
                                    <BitrixSyncRulesPanel connectionId={selectedBitrixConnectionId} />
                                </>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
