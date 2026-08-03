
import {
    Home, LayoutTemplate, Search, Users, Building2,
    Activity, BookOpen, Layers, FileBarChart, Zap, ChevronRight, Database, BarChart3, CalendarDays, Bell, Cpu, Wallet, FileText,
    PhoneCall, Target, Shield, MessageSquare, UserCog
} from 'lucide-react';
import { useBrand } from '../../contexts/BrandContext';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../Logo';
import { TotalTrackLogo } from '../TotalTrackLogo';
import { TabType } from './Header';

interface SidebarProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
    const { activeBrand, setActiveBrand } = useBrand();
    const { isAdmin } = useAuth();
    const isAtlas = activeBrand === 'atlasgr';

    const adminTools = [
        { id: 'team' as TabType, label: 'Equipe', icon: <UserCog size={20} /> },
    ];

    const coreTools = [
        { id: 'dashboard' as TabType, label: 'Painel Central', icon: <Home size={20} /> },
        { id: 'prospect' as TabType, label: 'Prospecção', icon: <Search size={20} /> },
        { id: 'crm' as TabType, label: 'Pipeline CRM', icon: <LayoutTemplate size={20} /> },
        { id: 'contacts' as TabType, label: 'Decisores', icon: <Users size={20} /> },
        { id: 'companies' as TabType, label: 'Empresas', icon: <Building2 size={20} /> },
        { id: 'activities' as TabType, label: 'Agenda', icon: <Activity size={20} /> },
        { id: 'analytics' as TabType, label: 'Analytics', icon: <BarChart3 size={20} /> },
        { id: 'calendar' as TabType, label: 'Calendário', icon: <CalendarDays size={20} /> },
        { id: 'notifications' as TabType, label: 'Notificações', icon: <Bell size={20} /> },
    ];

    const aiTools = [
        { id: 'roleplay' as TabType, label: 'Roleplay', icon: <PhoneCall size={20} /> },
        { id: 'qualification_matrix' as TabType, label: 'Matriz de Qualificação', icon: <Target size={20} /> },
        { id: 'objections_matrix' as TabType, label: 'Matriz de Objeções', icon: <Shield size={20} /> },
        { id: 'chatbook' as TabType, label: 'Chatbook', icon: <MessageSquare size={20} /> },
        { id: 'intelligence' as TabType, label: 'Hub de IA', icon: <Zap size={20} /> },
        { id: 'topic_training' as TabType, label: 'Academy', icon: <BookOpen size={20} /> },
        { id: 'bitrix' as TabType, label: 'Bitrix24', icon: <Layers size={20} /> },
        { id: 'reports' as TabType, label: 'Relatórios IA', icon: <FileBarChart size={20} /> },
        { id: 'knowledge' as TabType, label: 'Base de Conhecimento', icon: <Database size={20} /> },
        { id: 'editor' as TabType, label: 'Editor de Documentos', icon: <FileText size={20} /> },
        { id: 'automations' as TabType, label: 'Automações', icon: <Cpu size={20} /> },
        { id: 'usage' as TabType, label: 'Consumo de IA', icon: <Wallet size={20} /> },
    ];

    return (
        <aside className="w-64 h-full flex flex-col transition-colors bg-surface border-r border-line">
            {/* Context Switcher */}
            <div className="p-4 border-b border-line">
                <div className="flex items-center gap-2 mb-3">
                    {isAtlas ? <Logo className="h-8 text-ink" /> : <TotalTrackLogo className="h-8 text-ink" />}
                </div>

                <div className="relative group cursor-pointer" onClick={() => setActiveBrand(isAtlas ? 'totaltrac' : 'atlasgr')}>
                    <div className="flex items-center justify-between p-2 rounded-xl border border-line bg-surface-2 hover:bg-brand/10 transition-all">
                        <div className="flex items-center gap-2">
                            {isAtlas ? (
                                <Logo variant="symbol" className="h-6 w-6 shrink-0" />
                            ) : (
                                <TotalTrackLogo className="h-6 w-6 shrink-0 text-ink" />
                            )}
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand">
                                    Operação Atual
                                </span>
                                <span className="text-sm font-black text-ink">
                                    {isAtlas ? 'AtlasGR' : 'TotalTrac'}
                                </span>
                            </div>
                        </div>
                        <div className="w-6 h-6 rounded-md flex items-center justify-center bg-surface shadow-sm text-ink-2">
                            <ChevronRight size={14} className="group-hover:rotate-90 transition-transform" />
                        </div>
                    </div>
                </div>
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
                                onClick={() => onTabChange(tool.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                    isActive
                                        ? 'bg-brand text-white shadow-md'
                                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                                }`}
                            >
                                <span className={isActive ? 'opacity-100' : 'opacity-70'}>{tool.icon}</span>
                                {tool.label}
                            </button>
                        );
                    })}
                </div>

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
                                onClick={() => onTabChange(tool.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                    isActive
                                        ? 'bg-brand text-white shadow-md'
                                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                                }`}
                            >
                                <span className={isActive ? 'opacity-100' : 'opacity-70'}>{tool.icon}</span>
                                {tool.label}
                            </button>
                        );
                    })}
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
                                    onClick={() => onTabChange(tool.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                        isActive
                                            ? 'bg-brand text-white shadow-md'
                                            : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                                    }`}
                                >
                                    <span className={isActive ? 'opacity-100' : 'opacity-70'}>{tool.icon}</span>
                                    {tool.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </aside>
    );
}
