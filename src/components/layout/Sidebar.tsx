
import {
    Home, Search, Users, Building2,
    Activity, Layers, FileBarChart, Zap, ChevronRight, Database, CalendarDays, Cpu, Wallet, FileText,
    Target, Plug, Settings as SettingsIcon, Download, LineChart, Gauge, UserCog, Headset
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
    mobileOpen?: boolean;
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

    const navGroups = [
        {
            title: 'Visão Geral',
            items: [
                { id: 'dashboard' as TabType, label: 'Painel Central', icon: <Home size={20} /> },
            ]
        },
        {
            title: 'Captar',
            items: [
                { id: 'prospect' as TabType, label: 'Prospecção', icon: <Search size={20} /> },
                { id: 'market' as TabType, label: 'Market Intelligence', icon: <Globe size={20} /> },
            ]
        },
        {
            title: 'Qualificar',
            items: [
                { id: 'companies' as TabType, label: 'Empresas', icon: <Building2 size={20} /> },
                { id: 'contacts' as TabType, label: 'Decisores', icon: <Users size={20} /> },
                { id: 'mesa' as TabType, label: 'Mesa de Tratamento', icon: <Headset size={20} /> },
                { id: 'matrix' as TabType, label: 'Matriz de Qualificação', icon: <Target size={20} /> },
            ]
        },
        {
            title: 'Relacionar',
            items: [
                { id: 'activities' as TabType, label: 'Agenda & Atividades', icon: <Activity size={20} /> },
                { id: 'calendar' as TabType, label: 'Calendário', icon: <CalendarDays size={20} /> },
                { id: 'cadence' as TabType, label: 'Cadências', icon: <Repeat size={20} /> },
            ]
        },
        {
            title: 'Fechar',
            items: [
                { id: 'crm' as TabType, label: 'Pipeline CRM', icon: <Layers size={20} /> },
                { id: 'propostas' as TabType, label: 'Propostas', icon: <FileSignature size={20} /> },
            ]
        }
    ];

    const analisarItems = canAccessCommercialIntelligence ? [
        { id: 'commercial-intelligence' as TabType, label: 'Comercial Inteligente', icon: <Gauge size={20} /> },
        { id: 'analytics' as TabType, label: 'Analytics', icon: <LineChart size={20} /> },
        { id: 'reports' as TabType, label: 'Relatórios IA', icon: <FileBarChart size={20} /> },
    ] : [];

    const iaItems = [
        { id: 'intelligence' as TabType, label: 'Hub de IA', icon: <Zap size={20} /> },
        { id: 'knowledge' as TabType, label: 'Base de Conhecimento', icon: <Database size={20} /> },
    ];

    const adminItems = isAdmin ? [
        { id: 'integrations' as TabType, label: 'Integrações', icon: <Plug size={20} /> },
        { id: 'automations' as TabType, label: 'Automações', icon: <Cpu size={20} /> },
        { id: 'usage' as TabType, label: 'Consumo de IA', icon: <Wallet size={20} /> },
        { id: 'team' as TabType, label: 'Equipe', icon: <UserCog size={20} /> },
    ] : [];

    const bottomItems = [
        { id: 'settings' as TabType, label: 'Configurações', icon: <SettingsIcon size={20} /> },
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

                {navGroups.map((group, i) => (
                    <div key={i} className="space-y-1">
                        <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">
                            {group.title}
                        </p>
                        {group.items.map(tool => {
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
                ))}

                {analisarItems.length > 0 && (
                    <div className="space-y-1">
                        <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">Analisar</p>
                        {analisarItems.map(tool => {
                            const isActive = activeTab === tool.id;
                            return (
                                <button key={tool.id} onClick={() => selectTab(tool.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left transition-all ${isActive ? 'bg-brand-active text-[#fff] shadow-md' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
                                    <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`}>{tool.icon}</span>
                                    <span>{tool.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="space-y-1">
                    <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">IA & Capacitação</p>
                    {iaItems.map(tool => {
                        const isActive = activeTab === tool.id;
                        return (
                            <button key={tool.id} onClick={() => selectTab(tool.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left transition-all ${isActive ? 'bg-brand-active text-[#fff] shadow-md' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
                                <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`}>{tool.icon}</span>
                                <span>{tool.label}</span>
                            </button>
                        );
                    })}
                </div>

                {adminItems.length > 0 && (
                    <div className="space-y-1">
                        <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">Administração</p>
                        {adminItems.map(tool => {
                            const isActive = activeTab === tool.id;
                            return (
                                <button key={tool.id} onClick={() => selectTab(tool.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left transition-all ${isActive ? 'bg-brand-active text-[#fff] shadow-md' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
                                    <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`}>{tool.icon}</span>
                                    <span>{tool.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="space-y-1 pt-4 border-t border-line">
                    {bottomItems.map(tool => {
                        const isActive = activeTab === tool.id;
                        return (
                            <button key={tool.id} onClick={() => selectTab(tool.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left transition-all ${isActive ? 'bg-brand-active text-[#fff] shadow-md' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
                                <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`}>{tool.icon}</span>
                                <span>{tool.label}</span>
                            </button>
                        );
                    })}
                </div>

            </div>
        </aside>
    );
}
