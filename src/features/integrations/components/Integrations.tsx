import { useState } from 'react';
import { ShieldAlert, Copy, KeyRound } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { IconWrench } from '../../../components/icons';
import { BitrixImportPanel } from './BitrixImportPanel';
import { BitrixSyncRulesPanel } from './BitrixSyncRulesPanel';
import { WhatsAppWebPanel } from '../whatsapp/components/WhatsAppWebPanel';
import { useWhatsAppIntegration } from '../../../hooks/useWhatsAppIntegration';
import { useGoogleIntegration } from '../../../hooks/useGoogleIntegration';
import { useBitrixIntegration } from '../../../hooks/useBitrixIntegration';
import { use3CXIntegration } from '../../../hooks/use3CXIntegration';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';

export function Integrations() {
    // O backend já restringe conectar/desconectar/testar integração a ADMIN/GESTOR
    // (requireRole — ver auditoria de autorização da Onda 1); sem este espelho no front, um
    // VISUALIZADOR ou VENDEDOR via os botões normalmente e só descobria que não tinha permissão
    // quando a chamada voltava 403, sem nenhuma explicação na tela (achado do inventário de
    // navegação da Onda 1).
    const { currentUser } = useAuth();
    const canManage = !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR']);

    const { qrCode, status, loading, handleConnect, handleDisconnect } = useWhatsAppIntegration();

    const {
        googleConnected, googleEmail, googleLoading, upcomingEvents,
        handleGoogleConnect, handleGoogleDisconnect,
    } = useGoogleIntegration();

    const {
        bitrixConnections, selectedBitrixConnectionId, setSelectedBitrixConnectionId,
        bitrixWebhookInput, setBitrixWebhookInput, bitrixLabelInput, setBitrixLabelInput,
        bitrixLoading, handleBitrixConnect, handleBitrixDisconnect,
        handleGenerateWebhookSecret, handleToggleInboundEvents,
    } = useBitrixIntegration();
    // Segredo em texto puro só existe uma vez, na resposta de geração — depois disso a API nunca
    // mais devolve o valor (só hasWebhookSecret: true). Fica só em memória do componente, nunca
    // persistido no cliente.
    const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<string | null>(null);

    const {
        threecxConnections, threecxPbxUrlInput, setThreecxPbxUrlInput,
        threecxExtensionInput, setThreecxExtensionInput, threecxLabelInput, setThreecxLabelInput,
        threecxLoading, handle3CXConnect, handle3CXDisconnect, handle3CXTest,
    } = use3CXIntegration();

    type Tab = 'whatsapp' | 'google' | 'bitrix' | '3cx';
    const [activeTab, setActiveTab] = useState<Tab>('whatsapp');

    return (
        // flex-col (mobile) -> flex-row (lg+): a navegação secundária desta tela vira uma barra de
        // abas horizontal em telas estreitas em vez da sidebar vertical fixa de 256px, que sozinha
        // já não cabia num viewport de ~390px e empurrava o conteúdo pra fora da tela (achado real
        // reportado pelo usuário — sidebar fixa + conteúdo sem min-w-0 nunca encolhiam).
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row bg-gray-50/50 transition-colors duration-300">
            {/* Sidebar (vertical em lg+, barra de abas horizontal abaixo disso) */}
            <div className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col lg:h-full shrink-0">
                <div className="hidden lg:block p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-[var(--brand-primary)] border border-gray-200">
                            <IconWrench className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Integrações</h1>
                        </div>
                    </div>
                </div>
                {/* aria-label distingue estas abas dos botões de ação com o mesmo nome dentro de
                    cada painel (ex.: "Conectar WhatsApp") — sem isso, `getByRole('button', {name})`
                    casa com os dois e vira ambíguo pra quem consome esta tela via acessibilidade
                    (leitor de tela, testes). */}
                <nav aria-label="Módulos de integração" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto p-3 lg:p-4 lg:space-y-1 lg:flex-1">
                    <button
                        onClick={() => setActiveTab('whatsapp')}
                        className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'whatsapp' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <span className="text-lg">💬</span> WhatsApp
                    </button>
                    <button
                        onClick={() => setActiveTab('google')}
                        className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'google' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <span className="text-lg">📧</span> Google Workspace
                    </button>
                    <button
                        onClick={() => setActiveTab('bitrix')}
                        className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'bitrix' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <span className="text-lg">🔗</span> Bitrix24
                    </button>
                    <button
                        onClick={() => setActiveTab('3cx')}
                        className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === '3cx' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <IconWrench className="w-4 h-4 text-sky-500" /> PABX 3CX
                    </button>
                </nav>
            </div>

            {/* Content Area — min-w-0 é o que faz este flex item de fato encolher pra caber no
                viewport em vez de manter a largura "natural" do conteúdo e transbordar pra fora da
                tela (o bug real visto nas screenshots: texto/botões cortados na borda direita). */}
            <div className="flex-1 min-w-0 overflow-y-auto p-4 md:p-8">
                <div className="max-w-4xl mx-auto">
                    {!canManage && (
                        <div className="mb-6 p-3.5 rounded-xl border border-line bg-surface-2 flex items-center gap-2.5 text-xs text-ink-2">
                            <ShieldAlert className="w-4 h-4 text-brand shrink-0" />
                            Você pode ver o status das integrações, mas conectar, desconectar ou testar exige permissão de Gestor ou Administrador.
                        </div>
                    )}

                    {activeTab === 'whatsapp' && (
                    <Card className="p-4 md:p-8 bg-white dark:bg-white/5 border border-gray-100 shadow-sm rounded-2xl">
                        {/* Cabeçalho compacto quando conectado — a lista de conversas + chat precisa do máximo
                            de altura disponível, especialmente em mobile, onde a descrição não cabia sem
                            empurrar o painel pra abaixo da dobra. */}
                        <div className={`flex items-center justify-between gap-3 ${status === 'connected' ? 'mb-3' : 'mb-6'}`}>
                            <div className="min-w-0">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">WhatsApp</h2>
                                <p className={`text-sm text-gray-500 dark:text-gray-400 ${status === 'connected' ? 'hidden sm:block' : ''}`}>
                                    {status === 'connected'
                                        ? 'WhatsApp Web da organização — converse direto pela plataforma.'
                                        : 'Conecte para disparar quebra-gelos e conversar pelo WhatsApp direto na plataforma.'}
                                </p>
                            </div>
                            <div className={`bg-green-50 dark:bg-green-500/10 rounded-full flex items-center justify-center shrink-0 ${status === 'connected' ? 'w-9 h-9' : 'w-12 h-12'}`}>
                                <span className={status === 'connected' ? 'text-lg' : 'text-2xl'}>💬</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Conectando...' : 'Desconectado'}
                                    </span>
                                </div>
                                {status === 'connected' && (
                                    <button
                                        onClick={handleDisconnect}
                                        disabled={loading || !canManage}
                                        title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                        className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {loading ? 'Desconectando...' : 'Desconectar'}
                                    </button>
                                )}
                            </div>

                            {status === 'disconnected' && (
                                <div className="space-y-2">
                                    <button
                                        onClick={handleConnect}
                                        disabled={loading || !canManage}
                                        title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                        className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {loading ? 'Iniciando...' : 'Conectar WhatsApp'}
                                    </button>
                                    {/* Servidor no plano free do Render (ver render.yaml) — hiberna sozinho após
                                        alguns minutos sem uso e perde a sessão do WhatsApp junto (não há disco
                                        persistente pra sobreviver ao ciclo de hibernação). Sem este aviso, "estava
                                        conectado ontem e hoje pede QR de novo" parece bug em vez de comportamento
                                        esperado do plano atual. */}
                                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                                        Se já conectou antes e caiu sozinho, é o servidor gratuito hibernando por inatividade — basta escanear o QR de novo.
                                    </p>
                                </div>
                            )}

                            {status === 'connecting' && qrCode && (
                                <div className="text-center p-4 bg-gray-50 dark:bg-black/20 rounded-lg border border-gray-100">
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Escaneie o QR Code abaixo:</p>
                                    <img src={qrCode} alt="WhatsApp QR Code" className="mx-auto rounded-xl shadow-sm border border-gray-200 dark:border-white/10" />
                                </div>
                            )}

                            {status === 'connected' && <WhatsAppWebPanel connected />}
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
                                        disabled={googleLoading || !canManage}
                                        title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                        className="w-full py-2 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {googleLoading ? 'Desconectando...' : 'Desconectar'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={handleGoogleConnect}
                                    disabled={googleLoading || !canManage}
                                    title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                                                disabled={bitrixLoading || !canManage}
                                                title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                                className="shrink-0 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                                        placeholder="Nome pra identificar (ex.: AtlasGR, Total Trac)"
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
                                    disabled={bitrixLoading || !canManage}
                                    title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                                >
                                    {bitrixLoading ? 'Validando webhook...' : 'Conectar'}
                                </button>
                            </div>

                            {selectedBitrixConnectionId && (
                                <div className="space-y-6 pt-2">
                                    {(() => {
                                        const conn = bitrixConnections.find((c) => c.id === selectedBitrixConnectionId);
                                        if (!conn) return null;
                                        return (
                                            <div className="p-5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                                        <KeyRound className="w-4 h-4 text-orange-500" /> Webhook de entrada (Bitrix24 → Atlas)
                                                    </p>
                                                    <label className="relative inline-flex items-center cursor-pointer shrink-0" title={!conn.hasWebhookSecret ? 'Gere o segredo antes de ativar' : undefined}>
                                                        <input
                                                            type="checkbox"
                                                            aria-label="Receber eventos do Bitrix24 automaticamente"
                                                            checked={conn.inboundEventsEnabled}
                                                            disabled={!canManage || !conn.hasWebhookSecret || bitrixLoading}
                                                            onChange={(e) => handleToggleInboundEvents(conn.id, e.target.checked)}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-9 h-5 bg-gray-200 dark:bg-white/10 rounded-full peer-checked:bg-orange-600 transition-colors peer-disabled:opacity-40" />
                                                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                                                    </label>
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Opcional — sem isto, o Atlas continua trazendo dados do Bitrix24 por importação manual/regra automática (a cada 15 min). Ativar aqui faz o Bitrix avisar o Atlas na hora quando um Lead/Negócio já importado muda, sem esperar o próximo ciclo. Só atualiza registros já importados — nunca cria um novo sozinho.
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        readOnly
                                                        value={conn.webhookReceiverUrl}
                                                        onFocus={(e) => e.target.select()}
                                                        className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 text-gray-700 dark:text-gray-300"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => navigator.clipboard.writeText(conn.webhookReceiverUrl)}
                                                        title="Copiar URL"
                                                        className="shrink-0 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <button
                                                        type="button"
                                                        disabled={!canManage || bitrixLoading}
                                                        onClick={async () => {
                                                            const result = await handleGenerateWebhookSecret(conn.id);
                                                            setRevealedWebhookSecret(result?.webhookSecret ?? null);
                                                        }}
                                                        title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                                        className="px-3 py-2 text-xs font-bold bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-100 rounded-lg transition-colors border border-orange-100 dark:border-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                                                    >
                                                        {conn.hasWebhookSecret ? 'Gerar novo segredo' : 'Gerar segredo'}
                                                    </button>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {conn.hasWebhookSecret ? 'Segredo configurado.' : 'Nenhum segredo gerado ainda.'} Cole a URL acima e o segredo no cadastro do webhook de saída (Aplicativos → Webhooks → Webhook de saída) do Bitrix24, com os eventos de Lead/Negócio.
                                                    </span>
                                                </div>
                                                {revealedWebhookSecret && selectedBitrixConnectionId === conn.id && (
                                                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-1.5">
                                                        <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                                                            Copie agora — este segredo só aparece uma vez:
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <code className="flex-1 text-xs font-mono break-all text-amber-900 dark:text-amber-200">{revealedWebhookSecret}</code>
                                                            <button
                                                                type="button"
                                                                onClick={() => navigator.clipboard.writeText(revealedWebhookSecret)}
                                                                className="shrink-0 p-1.5 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 rounded-md transition-colors"
                                                                title="Copiar segredo"
                                                            >
                                                                <Copy className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
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
                                                    disabled={!canManage}
                                                    title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                                    className="px-3 py-2 text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg transition-colors border border-sky-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    Testar PABX
                                                </button>
                                                <button
                                                    onClick={() => handle3CXDisconnect(conn.id)}
                                                    disabled={threecxLoading || !canManage}
                                                    title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                                    className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                                    disabled={threecxLoading || !canManage}
                                    title={canManage ? undefined : 'Requer permissão de Gestor ou Administrador'}
                                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
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
