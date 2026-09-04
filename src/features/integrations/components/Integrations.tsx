import { useState, type ReactNode } from 'react';
import {
  ShieldAlert,
  Copy,
  KeyRound,
  AlertTriangle,
  type CheckCircle2,
  Clock3,
  Eye,
  Pencil,
  PlugZap,
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { IconWrench } from '../../../components/icons';
import { BitrixImportPanel } from './BitrixImportPanel';
import { BitrixSyncRulesPanel } from './BitrixSyncRulesPanel';
import { BitrixExtractionPanel } from './BitrixExtractionPanel';
import { WhatsAppWebPanel } from '../whatsapp/components/WhatsAppWebPanel';
import { useWhatsAppIntegration } from '../../../hooks/useWhatsAppIntegration';
import { useGoogleIntegration } from '../../../hooks/useGoogleIntegration';
import { useBitrixIntegration } from '../../../hooks/useBitrixIntegration';
import { use3CXIntegration } from '../../../hooks/use3CXIntegration';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { WebhookMonitor } from './WebhookMonitor';
import { Activity } from 'lucide-react';

type IntegrationCapabilityStatus = 'connected' | 'read' | 'write' | 'stub' | 'error' | 'pending';

const CAPABILITY_STYLES: Record<
  IntegrationCapabilityStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  connected: {
    label: 'conectado',
    icon: PlugZap,
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  },
  read: {
    label: 'leitura real',
    icon: Eye,
    className:
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20',
  },
  write: {
    label: 'escrita real',
    icon: Pencil,
    className:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20',
  },
  stub: {
    label: 'stub/local',
    icon: AlertTriangle,
    className:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  },
  error: {
    label: 'erro visível',
    icon: AlertTriangle,
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
  },
  pending: {
    label: 'pendente de escopo',
    icon: Clock3,
    className:
      'bg-gray-50 text-gray-700 border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10',
  },
};

function CapabilityBadge({
  status,
  children,
}: {
  status: IntegrationCapabilityStatus;
  children?: string;
}) {
  const config = CAPABILITY_STYLES[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${config.className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children ?? config.label}
    </span>
  );
}

function IntegrationTruthBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-black/20 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-2">
      {children}
    </div>
  );
}

export function Integrations() {
  // O backend já restringe conectar/desconectar/testar integração a ADMIN/GESTOR
  // (requireRole — ver auditoria de autorização da Onda 1); sem este espelho no front, um
  // VISUALIZADOR ou CLOSER/SDR via os botões normalmente e só descobria que não tinha permissão
  // quando a chamada voltava 403, sem nenhuma explicação na tela (achado do inventário de
  // navegação da Onda 1).
  const { currentUser } = useAuth();
  const canManage = !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR']);

  const { qrCode, status, loading, handleConnect, handleDisconnect } = useWhatsAppIntegration();

  const {
    googleConnected,
    googleEmail,
    googleLoading,
    upcomingEvents,
    hasCalendarWriteScope,
    handleGoogleConnect,
    handleGoogleDisconnect,
  } = useGoogleIntegration();

  const {
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
  } = useBitrixIntegration();
  // Segredo em texto puro só existe uma vez, na resposta de geração — depois disso a API nunca
  // mais devolve o valor (só hasWebhookSecret: true). Fica só em memória do componente, nunca
  // persistido no cliente.
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<string | null>(null);

  const {
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
  } = use3CXIntegration();

  type Tab = 'whatsapp' | 'google' | 'bitrix' | '3cx' | 'webhooks';
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
        <nav
          aria-label="Módulos de integração"
          className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto p-3 lg:p-4 lg:space-y-1 lg:flex-1"
        >
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'whatsapp' ? 'bg-brand/10 text-brand-active dark:text-brand-2' : 'text-ink-2 hover:bg-surface-2'}`}
          >
            <span className="text-lg">💬</span> WhatsApp
          </button>
          <button
            onClick={() => setActiveTab('google')}
            className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'google' ? 'bg-brand/10 text-brand-active dark:text-brand-2' : 'text-ink-2 hover:bg-surface-2'}`}
          >
            <span className="text-lg">📧</span> Google Workspace
          </button>
          <button
            onClick={() => setActiveTab('bitrix')}
            className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'bitrix' ? 'bg-brand/10 text-brand-active dark:text-brand-2' : 'text-ink-2 hover:bg-surface-2'}`}
          >
            <span className="text-lg">🔗</span> Bitrix24
          </button>
          <button
            onClick={() => setActiveTab('3cx')}
            className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === '3cx' ? 'bg-brand/10 text-brand-active dark:text-brand-2' : 'text-ink-2 hover:bg-surface-2'}`}
          >
            <IconWrench className="w-4 h-4 text-sky-500" /> PABX 3CX
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'webhooks' ? 'bg-brand/10 text-brand-active dark:text-brand-2' : 'text-ink-2 hover:bg-surface-2'}`}
          >
            <Activity className="w-4 h-4 text-brand" /> Webhooks & Monitor
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
              Você pode ver o status das integrações, mas conectar, desconectar ou testar exige
              permissão de Gestor ou Administrador.
            </div>
          )}

          {activeTab === 'whatsapp' && (
            <Card className="p-4 md:p-8 bg-white dark:bg-white/5 border border-gray-100 shadow-sm rounded-2xl">
              {/* Cabeçalho compacto quando conectado — a lista de conversas + chat precisa do máximo
                            de altura disponível, especialmente em mobile, onde a descrição não cabia sem
                            empurrar o painel pra abaixo da dobra. */}
              <div
                className={`flex items-center justify-between gap-3 ${status === 'connected' ? 'mb-3' : 'mb-6'}`}
              >
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">WhatsApp</h2>
                  <p
                    className={`text-sm text-gray-500 dark:text-gray-400 ${status === 'connected' ? 'hidden sm:block' : ''}`}
                  >
                    {status === 'connected'
                      ? 'WhatsApp Web da organização — leitura e envio pela sessão local do servidor.'
                      : 'Conecte para disparar quebra-gelos e conversar pelo WhatsApp direto na plataforma.'}
                  </p>
                </div>
                <div
                  className={`bg-green-50 dark:bg-green-500/10 rounded-full flex items-center justify-center shrink-0 ${status === 'connected' ? 'w-9 h-9' : 'w-12 h-12'}`}
                >
                  <span className={status === 'connected' ? 'text-lg' : 'text-2xl'}>💬</span>
                </div>
              </div>

              <div className="space-y-4">
                <IntegrationTruthBox>
                  <div className="flex flex-wrap gap-2">
                    <CapabilityBadge
                      status={
                        status === 'connected'
                          ? 'connected'
                          : status === 'connecting'
                            ? 'pending'
                            : 'error'
                      }
                    >
                      {status === 'connected'
                        ? 'conectado'
                        : status === 'connecting'
                          ? 'pendente'
                          : 'desconectado'}
                    </CapabilityBadge>
                    <CapabilityBadge status={status === 'connected' ? 'read' : 'pending'}>
                      leitura via sessão local
                    </CapabilityBadge>
                    <CapabilityBadge status={status === 'connected' ? 'write' : 'pending'}>
                      escrita via sessão local
                    </CapabilityBadge>
                    <CapabilityBadge status="stub">não é API oficial Meta</CapabilityBadge>
                  </div>
                  <p>
                    Integração Baileys/WhatsApp Web: funciona quando a sessão está viva no servidor;
                    não há garantia de persistência após hibernação/restart.
                  </p>
                </IntegrationTruthBox>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-success' : status === 'connecting' ? 'bg-warning animate-pulse' : 'bg-danger'}`}
                    ></span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {status === 'connected'
                        ? 'Conectado'
                        : status === 'connecting'
                          ? 'Conectando...'
                          : 'Desconectado'}
                    </span>
                    {status === 'connected' && (
                      <IntegrationStatusBadge
                        capability="write"
                        title="Envia e recebe mensagens de verdade pela sessão WhatsApp Web conectada"
                      />
                    )}
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
                      // bg-ok-active (não bg-green-600) — texto branco direto sobre verde-600 só
                      // atinge ~3.2:1 (WCAG AA exige 4.5:1 pra texto normal); mesmo padrão já
                      // usado em bg-brand-active (Button.tsx) pra texto branco sobre cor sólida.
                      className="w-full py-2 bg-ok-active hover:brightness-110 text-white font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Iniciando...' : 'Conectar WhatsApp'}
                    </button>
                    {/* Servidor no plano free do Render (ver render.yaml) — hiberna sozinho após
                                        alguns minutos sem uso e perde a sessão do WhatsApp junto (não há disco
                                        persistente pra sobreviver ao ciclo de hibernação). Sem este aviso, "estava
                                        conectado ontem e hoje pede QR de novo" parece bug em vez de comportamento
                                        esperado do plano atual. */}
                    {/* text-ink-2 (não text-gray-400) — 2.6:1 contra fundo claro, abaixo do
                                        mínimo AA de 4.5:1 pra texto normal (axe-core color-contrast). */}
                    <p className="text-xs text-ink-2 text-center">
                      Se já conectou antes e caiu sozinho, é o servidor gratuito hibernando por
                      inatividade — basta escanear o QR de novo.
                    </p>
                  </div>
                )}

                {status === 'connecting' && qrCode && (
                  <div className="text-center p-4 bg-gray-50 dark:bg-black/20 rounded-lg border border-gray-100">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Escaneie o QR Code abaixo:
                    </p>
                    <img
                      src={qrCode}
                      alt="WhatsApp QR Code"
                      className="mx-auto rounded-xl shadow-sm border border-gray-200 dark:border-white/10"
                    />
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
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Google Workspace
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Gmail em modo leitura; Calendar tem leitura e escrita real (via Cadência); a
                    Agenda do produto continua local.
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center">
                  <span className="text-2xl">📧</span>
                </div>
              </div>
              <div className="space-y-4">
                <IntegrationTruthBox>
                  <div className="flex flex-wrap gap-2">
                    <CapabilityBadge status={googleConnected ? 'connected' : 'error'}>
                      {googleConnected ? 'conectado' : 'desconectado'}
                    </CapabilityBadge>
                    <CapabilityBadge status={googleConnected ? 'read' : 'pending'}>
                      Calendar leitura
                    </CapabilityBadge>
                    <CapabilityBadge status={hasCalendarWriteScope ? 'write' : 'pending'}>
                      Calendar escrita via Cadência
                    </CapabilityBadge>
                    <CapabilityBadge status="stub">Agenda local</CapabilityBadge>
                  </div>
                  <p>
                    Eventos abaixo vêm do Google Calendar de verdade. A Agenda do Atlas continua
                    local e não sincroniza com o Google. Só a Cadência cria eventos reais no Google
                    Calendar, e só quando o vendedor confirma manualmente uma reunião (ver aviso
                    abaixo) — não existe sincronização geral de compromissos.
                  </p>
                </IntegrationTruthBox>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`w-3 h-3 rounded-full ${googleConnected ? 'bg-success' : 'bg-danger'}`}
                  ></span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {googleConnected ? `Conectado (${googleEmail})` : 'Desconectado'}
                  </span>
                  {googleConnected && (
                    <IntegrationStatusBadge
                      capability="read"
                      title="Lê Gmail e eventos do Calendar de verdade"
                    />
                  )}
                  {googleConnected && (
                    <IntegrationStatusBadge
                      capability={hasCalendarWriteScope ? 'write' : 'pending_scope'}
                      title={
                        hasCalendarWriteScope
                          ? 'Cria eventos reais no Google Calendar quando a Cadência confirma uma reunião'
                          : 'Conexão feita antes do escopo de escrita — reconecte para habilitar a criação real de eventos'
                      }
                    />
                  )}
                </div>

                {googleConnected && !hasCalendarWriteScope && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30">
                    <IntegrationStatusBadge capability="pending_scope" />
                    <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                      Esta conexão foi feita antes do escopo de escrita (
                      <code className="font-mono">calendar.events</code>) existir, então ainda tem
                      só <code className="font-mono">calendar.readonly</code>. Agendamento pela
                      Cadência vai continuar gravando a confirmação no Atlas normalmente, mas a
                      criação do evento no Google Calendar vai falhar em silêncio até você
                      desconectar e reconectar a conta abaixo.
                    </p>
                  </div>
                )}

                {googleConnected && hasCalendarWriteScope && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-dashed border-sky-300 bg-sky-50 dark:bg-sky-500/10 dark:border-sky-500/30">
                    <IntegrationStatusBadge capability="pending_scope" />
                    <p className="text-xs text-sky-800 dark:text-sky-200 leading-relaxed">
                      Agendamento pela Cadência cria o evento de verdade no Google Calendar sempre
                      que o vendedor confirma manualmente uma reunião. Os outros dois gatilhos
                      automáticos do domínio — réplica de calendário por e-mail e clique em link de
                      agendamento self-service — ainda não têm transporte implementado (pendente de
                      escopo de produto), então só a confirmação manual dispara escrita real hoje.
                    </p>
                  </div>
                )}

                {googleConnected ? (
                  <>
                    {upcomingEvents.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-gray-500 font-medium">
                          Próximos eventos do Calendar
                        </p>
                        {upcomingEvents.map((event) => (
                          <div
                            key={event.id}
                            className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-black/20 border border-gray-100 rounded-lg px-3 py-2 truncate"
                          >
                            {event.summary}
                            {event.start && (
                              <span className="text-gray-400 text-xs ml-2">
                                {new Date(event.start).toLocaleString('pt-BR')}
                              </span>
                            )}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bitrix24</h2>
                    {bitrixConnections.length > 0 && (
                      <>
                        <IntegrationStatusBadge
                          capability="write"
                          title="Todo lead novo é enviado automaticamente para o Bitrix24"
                        />
                        <IntegrationStatusBadge
                          capability="read"
                          title="Importação do Bitrix24 para o Atlas é manual, portal por portal"
                        />
                      </>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
                    Bitrix24 tem leitura/importação real, escrita real de leads e comentários, e
                    webhook de entrada opcional para atualizar registros já importados.
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-50 dark:bg-orange-500/10 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-2xl">🔗</span>
                </div>
              </div>

              <div className="space-y-6">
                <IntegrationTruthBox>
                  <div className="flex flex-wrap gap-2">
                    <CapabilityBadge status={bitrixConnections.length > 0 ? 'connected' : 'error'}>
                      {bitrixConnections.length > 0 ? 'conectado' : 'desconectado'}
                    </CapabilityBadge>
                    <CapabilityBadge status={bitrixConnections.length > 0 ? 'read' : 'pending'}>
                      leitura/importação real
                    </CapabilityBadge>
                    <CapabilityBadge status={bitrixConnections.length > 0 ? 'write' : 'pending'}>
                      escrita real Atlas→Bitrix
                    </CapabilityBadge>
                    <CapabilityBadge
                      status={
                        bitrixConnections.some((c) => c.inboundEventsEnabled) ? 'read' : 'pending'
                      }
                    >
                      webhook entrada opcional
                    </CapabilityBadge>
                  </div>
                  <p>
                    Não é espelho bidirecional completo: importação automática segue regras/ciclos e
                    o webhook só atualiza Lead/Negócio já importado.
                  </p>
                </IntegrationTruthBox>
                {bitrixConnections.length > 0 && (
                  <div className="space-y-2">
                    {bitrixConnections.map((conn) => (
                      <div
                        key={conn.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${selectedBitrixConnectionId === conn.id ? 'border-brand bg-brand/10 shadow-sm' : 'border-line hover:bg-surface-2'}`}
                      >
                        {/* Botão real (não <div onClick>) para a seleção — o "desconectar" abaixo
                            é irmão, não filho, pra evitar botão-dentro-de-botão (achado do
                            Piloto 011). */}
                        <button
                          type="button"
                          onClick={() => setSelectedBitrixConnectionId(conn.id)}
                          aria-pressed={selectedBitrixConnectionId === conn.id}
                          className="flex items-center gap-4 flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg"
                        >
                          <span
                            className={`w-3 h-3 rounded-full ${selectedBitrixConnectionId === conn.id ? 'bg-success' : 'bg-line'} shrink-0`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-ink truncate">{conn.label}</p>
                            {conn.portalDomain && (
                              <p className="text-xs text-ink-2 truncate mt-0.5">
                                {conn.portalDomain}
                              </p>
                            )}
                            {/* Checkpoint real de importação incremental, nunca exposto aqui antes
                                (achado do Piloto 011 — dado já existia em connections.ts). */}
                            <p className="text-[11px] text-ink-2 truncate mt-0.5">
                              {conn.lastImportedAt
                                ? `Última sincronização: ${new Date(conn.lastImportedAt).toLocaleString('pt-BR')}`
                                : 'Nunca sincronizado'}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBitrixDisconnect(conn.id)}
                          disabled={bitrixLoading || !canManage}
                          title={
                            canManage ? undefined : 'Requer permissão de Gestor ou Administrador'
                          }
                          className="shrink-0 text-sm font-medium text-danger-active dark:text-danger hover:brightness-110 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Desconectar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-5 rounded-xl border border-dashed border-gray-300 dark:border-white/20 bg-gray-50/50 dark:bg-white/[0.03] space-y-4">
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {bitrixConnections.length > 0
                      ? 'Conectar outro portal Bitrix24'
                      : 'Conectar Bitrix24'}
                  </p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={bitrixLabelInput}
                      onChange={(e) => setBitrixLabelInput(e.target.value)}
                      placeholder="Nome pra identificar (ex.: AtlasGR, Total Trac)"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 shadow-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                    />
                    <input
                      type="url"
                      value={bitrixWebhookInput}
                      onChange={(e) => setBitrixWebhookInput(e.target.value)}
                      placeholder="https://seudominio.bitrix24.com.br/rest/1/xxxxxxxx/"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 shadow-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Gere em Bitrix24 → Aplicativos → Webhooks → Webhook de entrada, com permissão{' '}
                    <strong className="font-bold text-gray-700 dark:text-gray-300">crm</strong>.
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
                      const conn = bitrixConnections.find(
                        (c) => c.id === selectedBitrixConnectionId,
                      );
                      if (!conn) return null;
                      return (
                        <div className="p-5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                              <KeyRound className="w-4 h-4 text-orange-500" /> Webhook de entrada
                              (Bitrix24 → Atlas)
                            </p>
                            <label
                              className="relative inline-flex items-center cursor-pointer shrink-0"
                              title={
                                !conn.hasWebhookSecret
                                  ? 'Gere o segredo antes de ativar'
                                  : undefined
                              }
                            >
                              <input
                                type="checkbox"
                                aria-label="Receber eventos do Bitrix24 automaticamente"
                                checked={conn.inboundEventsEnabled}
                                disabled={!canManage || !conn.hasWebhookSecret || bitrixLoading}
                                onChange={(e) =>
                                  handleToggleInboundEvents(conn.id, e.target.checked)
                                }
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-200 dark:bg-white/10 rounded-full peer-checked:bg-orange-600 transition-colors peer-disabled:opacity-40" />
                              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                            </label>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Opcional — sem isto, o Atlas continua trazendo dados do Bitrix24 por
                            importação manual/regra automática (a cada 15 min). Ativar aqui faz o
                            Bitrix avisar o Atlas na hora quando um Lead/Negócio já importado muda,
                            sem esperar o próximo ciclo. Só atualiza registros já importados — nunca
                            cria um novo sozinho.
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
                              title={
                                canManage
                                  ? undefined
                                  : 'Requer permissão de Gestor ou Administrador'
                              }
                              className="px-3 py-2 text-xs font-bold bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-100 rounded-lg transition-colors border border-orange-100 dark:border-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {conn.hasWebhookSecret ? 'Gerar novo segredo' : 'Gerar segredo'}
                            </button>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {conn.hasWebhookSecret
                                ? 'Segredo configurado.'
                                : 'Nenhum segredo gerado ainda.'}{' '}
                              Cole a URL acima e o segredo no cadastro do webhook de saída
                              (Aplicativos → Webhooks → Webhook de saída) do Bitrix24, com os
                              eventos de Lead/Negócio.
                            </span>
                          </div>
                          {revealedWebhookSecret && selectedBitrixConnectionId === conn.id && (
                            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-1.5">
                              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                                Copie agora — este segredo só aparece uma vez:
                              </p>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 text-xs font-mono break-all text-amber-900 dark:text-amber-200">
                                  {revealedWebhookSecret}
                                </code>
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigator.clipboard.writeText(revealedWebhookSecret)
                                  }
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
                    <BitrixExtractionPanel
                      connectionId={selectedBitrixConnectionId}
                      canManage={canManage}
                    />
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
                  <div className="p-4 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-xl border border-sky-100 dark:border-sky-500/20">
                    <IconWrench className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      PABX Telefonia 3CX
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Cadastro de PABX 3CX e teste de comunicação; recursos avançados dependem da
                      instalação 3CX conectada e dos webhooks habilitados.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg ${threecxConnections.length > 0 ? 'bg-success/15 text-success-active dark:text-success' : 'bg-surface-2 text-ink-2'}`}
                  >
                    {threecxConnections.length > 0 ? 'Ativo 24h' : 'Não conectado'}
                  </span>
                  {threecxConnections.length > 0 && (
                    <IntegrationStatusBadge
                      capability="write"
                      title="Click-to-call dispara chamada real no PABX conectado"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <IntegrationTruthBox>
                  <div className="flex flex-wrap gap-2">
                    <CapabilityBadge status={threecxConnections.length > 0 ? 'connected' : 'error'}>
                      {threecxConnections.length > 0 ? 'conectado' : 'desconectado'}
                    </CapabilityBadge>
                    <CapabilityBadge status={threecxConnections.length > 0 ? 'write' : 'pending'}>
                      click-to-call configurado
                    </CapabilityBadge>
                    <CapabilityBadge status="pending">
                      gravações dependem de webhook
                    </CapabilityBadge>
                    <CapabilityBadge status="pending">
                      discador IA depende de escopo
                    </CapabilityBadge>
                  </div>
                  <p>
                    Esta tela registra conexão/ramal e testa comunicação; ela não prova, sozinha,
                    gravação de chamadas ou prospecção 24h em produção.
                  </p>
                </IntegrationTruthBox>
                {threecxConnections.length > 0 && (
                  <div className="space-y-3">
                    {threecxConnections.map((conn) => (
                      <div
                        key={conn.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-line bg-surface shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-ink">{conn.label}</p>
                            <p className="text-xs text-ink-2">
                              {conn.pbxUrl} — Ramal {conn.extension}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handle3CXTest(conn.id)}
                            disabled={!canManage}
                            title={
                              canManage ? undefined : 'Requer permissão de Gestor ou Administrador'
                            }
                            className="px-3 py-2 text-xs font-bold bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 rounded-lg transition-colors border border-sky-100 dark:border-sky-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Testar PABX
                          </button>
                          <button
                            onClick={() => handle3CXDisconnect(conn.id)}
                            disabled={threecxLoading || !canManage}
                            title={
                              canManage ? undefined : 'Requer permissão de Gestor ou Administrador'
                            }
                            className="px-3 py-2 text-xs font-bold text-danger-active dark:text-danger hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Desconectar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-5 rounded-xl border border-dashed border-gray-300 dark:border-white/20 bg-gray-50/50 dark:bg-white/[0.03] space-y-4">
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {threecxConnections.length > 0
                      ? 'Conectar outro PABX 3CX'
                      : 'Conectar Servidor 3CX PABX'}
                  </p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={threecxLabelInput}
                      onChange={(e) => setThreecxLabelInput(e.target.value)}
                      placeholder="Nome de exibição (ex.: 3CX Comercial, Ramal 101)"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 shadow-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                    />
                    <input
                      type="url"
                      value={threecxPbxUrlInput}
                      onChange={(e) => setThreecxPbxUrlInput(e.target.value)}
                      placeholder="https://seu-pabx.3cx.us"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 shadow-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                    />
                    <input
                      type="text"
                      value={threecxExtensionInput}
                      onChange={(e) => setThreecxExtensionInput(e.target.value)}
                      placeholder="Ramal (ex.: 101)"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 shadow-sm bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
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

          {activeTab === 'webhooks' && <WebhookMonitor />}
        </div>
      </div>
    </div>
  );
}
