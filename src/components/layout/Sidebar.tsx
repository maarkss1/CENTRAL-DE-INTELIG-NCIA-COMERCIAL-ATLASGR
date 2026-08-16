
import {
    Home, LayoutTemplate, Search, Users, Building2,
    Activity, BookOpen, Layers, FileBarChart, Zap, ChevronRight, Database, BarChart3, CalendarDays, Bell, Cpu, Wallet, FileText,
    PhoneCall, Target, Shield, MessageSquare, UserCog, Plug, Settings as SettingsIcon, Download, LineChart, Gauge, FileSignature
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBrand } from '../../contexts/BrandContext';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../Logo';
import { TotalTrackLogo } from '../TotalTrackLogo';
import { TabType } from './tabMeta';

interface SidebarProps {
    activeTab: TabType;
    /** Controla a visibilidade em telas < lg, onde a Sidebar vira um painel off-canvas. */
    mobileOpen?: boolean;
    /** Chamado ao fechar a navegação mobile (backdrop, Escape ou seleção de item). */
    onCloseMobile?: () => void;
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

    // "Equipe" é administrativo de verdade (gestão de usuários da organização) — fica só aqui.
    // "Configurações" (tema, marca ativa, dados do próprio perfil — ver Settings.tsx) não é
    // administrativo: qualquer papel autenticado usa essas preferências pessoais, e a rota em
    // App.tsx já é acessível por URL direta para todos. Antes, o item só aparecia pra admin,
    // então não-admins só chegavam lá digitando a URL — inconsistência entre menu e rota
    // corrigida movendo "Configurações" para fora do bloco admin-only, abaixo.
    const adminTools = [
        { id: 'team' as TabType, label: 'Equipe', icon: <UserCog size={20} /> },
    ];

    const coreTools = [
        { id: 'dashboard' as TabType, label: 'Painel Central', icon: <Home size={20} /> },
        { id: 'prospect' as TabType, label: 'Prospecção', icon: <Search size={20} /> },
        { id: 'crm' as TabType, label: 'Pipeline CRM', icon: <LayoutTemplate size={20} /> },
        { id: 'crm360' as TabType, label: 'Cockpit CRM', icon: <Gauge size={20} /> },
        { id: 'propostas' as TabType, label: 'Propostas', icon: <FileSignature size={20} /> },
        { id: 'contacts' as TabType, label: 'Decisores', icon: <Users size={20} /> },
        { id: 'companies' as TabType, label: 'Empresas', icon: <Building2 size={20} /> },
        { id: 'activities' as TabType, label: 'Agenda', icon: <Activity size={20} /> },
        { id: 'analytics' as TabType, label: 'Analytics', icon: <BarChart3 size={20} /> },
        { id: 'winloss' as TabType, label: 'Win/Loss', icon: <Target size={20} /> },
        { id: 'calendar' as TabType, label: 'Calendário', icon: <CalendarDays size={20} /> },
        { id: 'notifications' as TabType, label: 'Notificações', icon: <Bell size={20} /> },
        { id: 'settings' as TabType, label: 'Configurações', icon: <SettingsIcon size={20} /> },
    ];

    // Comercial Inteligente — módulo executivo restrito (Gestor/Diretor/CEO, mapeados hoje para
    // ADMIN/GESTOR — ver src/lib/auth/authorization.ts). Renderizado como seção própria (não
    // dentro de "Administração", que é ADMIN-only) porque GESTOR também precisa enxergar este
    // item. A proteção real está no backend (requireRole) e na rota (RequireRole) — esconder o
    // item aqui é só uma conveniência de UX, nunca a única barreira.
    const executiveTools = [
        { id: 'commercial_intelligence' as TabType, label: 'Comercial Inteligente', icon: <LineChart size={20} /> },
    ];

    const aiTools = [
        { id: 'roleplay' as TabType, label: 'Roleplay', icon: <PhoneCall size={20} /> },
        { id: 'qualification_matrix' as TabType, label: 'Matriz de Qualificação', icon: <Target size={20} /> },
        { id: 'objections_matrix' as TabType, label: 'Matriz de Objeções', icon: <Shield size={20} /> },
        { id: 'chatbook' as TabType, label: 'Chatbook', icon: <MessageSquare size={20} /> },
        { id: 'intelligence' as TabType, label: 'Hub de IA', icon: <Zap size={20} /> },
        { id: 'market-intelligence' as TabType, label: 'Market Intelligence', icon: <LineChart size={20} /> },
        { id: 'topic_training' as TabType, label: 'Academy', icon: <BookOpen size={20} /> },
        { id: 'bitrix' as TabType, label: 'Guia Bitrix24', icon: <Layers size={20} /> },
        { id: 'integrations' as TabType, label: 'Integrações', icon: <Plug size={20} /> },
        { id: 'reports' as TabType, label: 'Relatórios IA', icon: <FileBarChart size={20} /> },
        { id: 'knowledge' as TabType, label: 'Base de Conhecimento', icon: <Database size={20} /> },
        { id: 'editor' as TabType, label: 'Editor de Documentos', icon: <FileText size={20} /> },
        { id: 'automations' as TabType, label: 'Automações', icon: <Cpu size={20} /> },
        { id: 'usage' as TabType, label: 'Consumo de IA', icon: <Wallet size={20} /> },
    ];

    // Ferramenta estática (HTML/JS puro, sem passar pelo router da SPA) servida direto de
    // public/tools — roda 100% no navegador do usuário, direto contra o webhook Bitrix24 dele,
    // por isso abre em nova aba em vez de navegar dentro do app.
    const externalTools = [
        { label: 'Extrator Bitrix24', href: '/tools/extrator-bitrix.html', icon: <Download size={20} /> },
    ];

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 h-full flex flex-col transition-transform duration-300 bg-surface border-r border-line lg:static lg:translate-x-0 ${
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

                {/* Core Navigation */}
                <div className="space-y-1">
                    <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">
                        Core Modules
                    </p>
                    {coreTools.map(tool => {
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

                {/* Comercial Inteligente — só Gestor/Admin (ver executiveTools acima) */}
                {canAccessCommercialIntelligence && (
                    <div className="space-y-1">
                        <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">
                            Executivo
                        </p>
                        {executiveTools.map(tool => {
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
                )}

                {/* AI Tools */}
                <div className="space-y-1">
                    <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">
                        Inteligência
                    </p>
                    {aiTools.map(tool => {
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

                {/* Ferramentas externas — páginas estáticas fora da SPA */}
                <div className="space-y-1">
                    <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">
                        Ferramentas
                    </p>
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

                {/* Admin Tools — só pra quem tem papel administrativo */}
                {isAdmin && (
                    <div className="space-y-1">
                        <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">
                            Administração
                        </p>
                        {adminTools.map(tool => {
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
                )}
            </div>
        </aside>
    );
}
