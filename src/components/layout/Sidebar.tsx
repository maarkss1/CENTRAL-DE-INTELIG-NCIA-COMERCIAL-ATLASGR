
import { 
    Home, LayoutTemplate, Search, Users, Building2, 
    Activity, Bot, BookOpen, Layers, FileBarChart, Zap, ChevronRight, Database
} from 'lucide-react';
import { useBrand } from '../../contexts/BrandContext';
import { Logo } from '../Logo';
import { TotalTrackLogo } from '../TotalTrackLogo';
import { TabType } from './Header';

interface SidebarProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
    const { activeBrand, setActiveBrand } = useBrand();
    const isAtlas = activeBrand === 'atlasgr';

    const coreTools = [
        { id: 'dashboard' as TabType, label: 'Painel Central', icon: <Home size={20} /> },
        { id: 'prospect' as TabType, label: 'Prospecção', icon: <Search size={20} /> },
        { id: 'crm' as TabType, label: 'Pipeline CRM', icon: <LayoutTemplate size={20} /> },
        { id: 'contacts' as TabType, label: 'Decisores', icon: <Users size={20} /> },
        { id: 'companies' as TabType, label: 'Empresas', icon: <Building2 size={20} /> },
        { id: 'activities' as TabType, label: 'Agenda', icon: <Activity size={20} /> },
    ];

    const aiTools = [
        { id: 'roleplay' as TabType, label: 'Dojo de Vendas', icon: <Bot size={20} /> },
        { id: 'intelligence' as TabType, label: 'Hub de IA', icon: <Zap size={20} /> },
        { id: 'topic_training' as TabType, label: 'Academy', icon: <BookOpen size={20} /> },
        { id: 'bitrix' as TabType, label: 'Bitrix24', icon: <Layers size={20} /> },
        { id: 'reports' as TabType, label: 'Relatórios IA', icon: <FileBarChart size={20} /> },
        { id: 'knowledge' as TabType, label: 'Base de Conhecimento', icon: <Database size={20} /> },
    ];

    return (
        <aside className={`w-64 h-full flex flex-col transition-colors border-r ${
            isAtlas ? 'bg-white border-orange-100' : 'bg-slate-900 border-white/10'
        }`}>
            {/* Context Switcher */}
            <div className={`p-4 border-b ${isAtlas ? 'border-orange-100' : 'border-white/10'}`}>
                <div className="flex items-center gap-2 mb-3">
                    {isAtlas ? <Logo className="h-8 text-slate-900" /> : <TotalTrackLogo className="h-8 text-white" />}
                </div>
                
                <div className="relative group cursor-pointer" onClick={() => setActiveBrand(isAtlas ? 'totaltrac' : 'atlasgr')}>
                    <div className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                        isAtlas ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' : 'bg-blue-900/30 border-blue-800 hover:bg-blue-900/50'
                    }`}>
                        <div className="flex flex-col">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isAtlas ? 'text-orange-600' : 'text-blue-400'}`}>
                                Operação Atual
                            </span>
                            <span className={`text-sm font-black ${isAtlas ? 'text-slate-900' : 'text-white'}`}>
                                {isAtlas ? 'AtlasGR' : 'TotalTrac'}
                            </span>
                        </div>
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isAtlas ? 'bg-white shadow-sm text-slate-400' : 'bg-slate-800 text-slate-400'}`}>
                            <ChevronRight size={14} className="group-hover:rotate-90 transition-transform" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
                
                {/* Core Navigation */}
                <div className="space-y-1">
                    <p className={`px-3 mb-2 text-[10px] font-black uppercase tracking-widest ${isAtlas ? 'text-slate-400' : 'text-slate-500'}`}>
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
                                        ? (isAtlas ? 'bg-orange-500 text-white shadow-md' : 'bg-blue-600 text-white shadow-md')
                                        : (isAtlas ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900' : 'text-slate-400 hover:bg-white/5 hover:text-white')
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
                    <p className={`px-3 mb-2 text-[10px] font-black uppercase tracking-widest ${isAtlas ? 'text-slate-400' : 'text-slate-500'}`}>
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
                                        ? (isAtlas ? 'bg-orange-500 text-white shadow-md' : 'bg-blue-600 text-white shadow-md')
                                        : (isAtlas ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900' : 'text-slate-400 hover:bg-white/5 hover:text-white')
                                }`}
                            >
                                <span className={isActive ? 'opacity-100' : 'opacity-70'}>{tool.icon}</span>
                                {tool.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
}
