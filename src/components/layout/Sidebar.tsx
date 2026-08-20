
import {
    Home, LayoutTemplate, Search, Users, Building2,
    Activity, BookOpen, Layers, FileBarChart, Zap, ChevronRight, Database, BarChart3, CalendarDays, Bell, Cpu, Wallet, FileText,
    PhoneCall, Target, Shield, MessageSquare, UserCog, Plug, Settings as SettingsIcon, Download, LineChart, Gauge, Repeat, FileSignature, Headset
} from 'lucide-react';
import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrand } from '../../contexts/BrandContext';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../Logo';
import { TotalTrackLogo } from '../TotalTrackLogo';
import { TabType } from './tabMeta';

interface SidebarProps {
    activeTab: TabType;
    /** Controla a visibilidade em telas < md, onde a Sidebar vira um painel off-canvas. */
    mobileOpen?: boolean;
    /** Chamado ao fechar a navegação mobile (backdrop, Escape ou seleção de item). */
    onCloseMobile?: () => void;
}

interface NavItem {
    id: TabType;
    label: string;
    icon: ReactNode;
}

export function Sidebar({ activeTab, mobileOpen = false, onCloseMobile }: SidebarProps) {
    const { activeBrand, setActiveBrand } = useBrand();
    const { isAdmin, canAccessCommercialIntelligence } = useAuth();
    const isAtlas = activeBrand === 'atlasgr';
    const navigate = useNavigate();

    const selectTab = (tab: TabType) => {
        navigate(`/app/${tab}`);
        onCloseMobile?.();
    };

    // Item único, sem seção — é a tela inicial de qualquer papel, não pertence a nenhuma jornada
    // específica (prospecção/vendas/gestão).
    const overviewTools: NavItem[] = [
        { id: 'dashboard', label: 'Painel Central', icon: <Home size={20} /> },
    ];

    // Onda 4 — navegação reagrupada por jornada/persona (era 2 listas planas de 15 e 14 itens sem
    // nenhum critério de agrupamento — "Core Modules" misturava prospecção, pipeline, agenda e
    // configurações pessoais no mesmo nível; "Inteligência" misturava treinamento de IA com
    // billing e automações de sistema). Critério usado, alinhado aos papéis descritos em
    // `.claude/CLAUDE.md` (SDR, closers, gestão): cada grupo é "o que essa pessoa faz nesta tela",
    // não "que tecnologia foi usada pra construir a tela".
    const prospectingTools: NavItem[] = [
        { id: 'prospect', label: 'Prospecção', icon: <Search size={20} /> },
        { id: 'companies', label: 'Empresas', icon: <Building2 size={20} /> },
        { id: 'contacts', label: 'Decisores', icon: <Users size={20} /> },
        { id: 'cadence', label: 'Cadência', icon: <Repeat size={20} /> },
    ];

    const salesTools: NavItem[] = [
        { id: 'crm', label: 'Pipeline CRM', icon: <LayoutTemplate size={20} /> },
        { id: 'crm360', label: 'Cockpit CRM', icon: <Gauge size={20} /> },
        { id: 'mesa-tratamento', label: 'Mesa de Tratamento', icon: <Headset size={20} /> },
        { id: 'propostas', label: 'Propostas', icon: <FileSignature size={20} /> },
        { id: 'activities', label: 'Agenda', icon: <Activity size={20} /> },
        { id: 'calendar', label: 'Calendário', icon: <CalendarDays size={20} /> },
    ];

    // "Guia Bitrix24" e "Base de Conhecimento"/"Editor de Documentos" são conteúdo de apoio (guia,
    // artigo, playbook), não configuração de integração — por isso ficam aqui, e não em Sistema.
    const enablementTools: NavItem[] = [
        { id: 'roleplay', label: 'Roleplay', icon: <PhoneCall size={20} /> },
        { id: 'qualification_matrix', label: 'Matriz de Qualificação', icon: <Target size={20} /> },
        { id: 'objections_matrix', label: 'Matriz de Objeções', icon: <Shield size={20} /> },
        { id: 'chatbook', label: 'Chatbook', icon: <MessageSquare size={20} /> },
        { id: 'intelligence', label: 'Hub de IA', icon: <Zap size={20} /> },
        { id: 'topic_training', label: 'Academy', icon: <BookOpen size={20} /> },
        { id: 'knowledge', label: 'Base de Conhecimento', icon: <Database size={20} /> },
        { id: 'editor', label: 'Editor de Documentos', icon: <FileText size={20} /> },
        { id: 'bitrix', label: 'Guia Bitrix24', icon: <Layers size={20} /> },
    ];

    // "Comercial Inteligente" continua com o próprio gate de papel (Gestor/Diretor/CEO — ver
    // `canAccessCommercialIntelligence`) mesmo dentro deste grupo; a proteção real está no backend
    // (requireRole) e na rota (RequireRole), esconder o item aqui é só conveniência de UX.
    const insightsTools: NavItem[] = [
        { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
        { id: 'winloss', label: 'Win/Loss', icon: <Target size={20} /> },
        { id: 'market-intelligence', label: 'Market Intelligence', icon: <LineChart size={20} /> },
        { id: 'reports', label: 'Relatórios IA', icon: <FileBarChart size={20} /> },
        ...(canAccessCommercialIntelligence
            ? [{ id: 'commercial_intelligence' as TabType, label: 'Comercial Inteligente', icon: <LineChart size={20} /> }]
            : []),
    ];

    const systemTools: NavItem[] = [
        { id: 'integrations', label: 'Integrações', icon: <Plug size={20} /> },
        { id: 'automations', label: 'Automações', icon: <Cpu size={20} /> },
        { id: 'usage', label: 'Consumo de IA', icon: <Wallet size={20} /> },
        { id: 'notifications', label: 'Notificações', icon: <Bell size={20} /> },
        { id: 'settings', label: 'Configurações', icon: <SettingsIcon size={20} /> },
    ];

    // "Equipe" é administrativo de verdade (gestão de usuários da organização) — fica só aqui.
    const adminTools: NavItem[] = [
        { id: 'team', label: 'Equipe', icon: <UserCog size={20} /> },
    ];

    // Ferramenta estática (HTML/JS puro, sem passar pelo router da SPA) servida direto de
    // public/tools — roda 100% no navegador do usuário, direto contra o webhook Bitrix24 dele,
    // por isso abre em nova aba em vez de navegar dentro do app. Portal multi-página (Home,
    // Cockpit Executivo, Extrator, Forecast Semanal, SDR) que substituiu o antigo
    // extrator-bitrix.html de arquivo único — ver docs/security/runbooks/ROTATE_BITRIX24_WEBHOOKS.md.
    const externalTools = [
        { label: 'Portal Comercial Bitrix24', href: '/tools/portal-comercial/index.html', icon: <Download size={20} /> },
    ];

    function NavGroup({ title, items }: { title?: string; items: NavItem[] }) {
        if (items.length === 0) return null;
        return (
            <div className="space-y-1">
                {title && (
                    <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">
                        {title}
                    </p>
                )}
                {items.map(tool => {
                    const isActive = activeTab === tool.id;
                    return (
                        <button
                            key={tool.id}
                            onClick={() => selectTab(tool.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left transition-all ${
                                isActive
                                    ? 'bg-brand-active text-[#fff] shadow-md'
                                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                            }`}
                        >
                            <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`}>{tool.icon}</span>
                            <span>{tool.label}</span>
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 h-full flex flex-col transition-transform duration-300 bg-surface border-r border-line md:static md:translate-x-0 ${
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
            {/* Context Switcher */}
            <div className="p-4 border-b border-line">
                <div className="flex items-center gap-2 mb-3">
                    {isAtlas ? <Logo className="h-8 text-ink" /> : <TotalTrackLogo className="h-8 text-ink" />}
                </div>

                <button
                    type="button"
                    className="relative group cursor-pointer w-full text-left"
                    onClick={() => setActiveBrand(isAtlas ? 'totaltrac' : 'atlasgr')}
                    aria-label={`Alternar para a operação ${isAtlas ? 'Total Trac' : 'AtlasGR'}`}
                >
                    <div className="flex items-center justify-between p-2 rounded-xl border border-line bg-surface-2 hover:bg-brand/10 transition-all">
                        <div className="flex items-center gap-2">
                            {isAtlas ? (
                                <Logo variant="symbol" className="h-6 w-6 shrink-0" />
                            ) : (
                                <TotalTrackLogo variant="symbol" className="h-6 w-6 shrink-0" />
                            )}
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand">
                                    Operação Atual
                                </span>
                                <span className="text-sm font-black text-ink">
                                    {isAtlas ? 'AtlasGR' : 'Total Trac'}
                                </span>
                            </div>
                        </div>
                        <div className="w-6 h-6 rounded-md flex items-center justify-center bg-surface shadow-sm text-ink-2">
                            <ChevronRight size={14} className="group-hover:rotate-90 transition-transform" />
                        </div>
                    </div>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
                <NavGroup items={overviewTools} />
                <NavGroup title="Prospecção" items={prospectingTools} />
                <NavGroup title="Vendas & Atendimento" items={salesTools} />
                <NavGroup title="Inteligência & Capacitação" items={enablementTools} />
                <NavGroup title="Análise & Gestão" items={insightsTools} />
                <NavGroup title="Sistema" items={systemTools} />

                {/* Ferramentas externas — páginas estáticas fora da SPA, mesma seção visual de
                    Sistema (integração/operação), mas fora do NavGroup por navegar via <a> real. */}
                <div className="space-y-1">
                    {externalTools.map(tool => (
                        <a
                            key={tool.href}
                            href={tool.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left transition-all text-ink-2 hover:bg-surface-2 hover:text-ink"
                        >
                            <span className="shrink-0 opacity-70">{tool.icon}</span>
                            <span>{tool.label}</span>
                        </a>
                    ))}
                </div>

                {isAdmin && <NavGroup title="Administração" items={adminTools} />}
            </div>
        </aside>
    );
}
