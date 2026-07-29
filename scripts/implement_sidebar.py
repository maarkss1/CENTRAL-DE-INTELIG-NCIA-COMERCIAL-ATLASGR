import os
import re

# We will create a Sidebar.tsx component
sidebar_content = """import React from 'react';
import { 
    Home, LayoutTemplate, Search, Target, Users, Building2, 
    Activity, Bot, BookOpen, Layers, FileBarChart, Zap, ChevronRight
} from 'lucide-react';
import { useBrand } from '../../contexts/BrandContext';
import { Logo } from '../Logo';
import { TotalTrackLogo } from '../TotalTrackLogo';
import { TabType } from './Header';

interface SidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
    const { activeBrand, setActiveBrand } = useBrand();
    const isAtlas = activeBrand === 'atlasgr';

    const coreTools = [
        { id: 'dashboard', label: 'Painel Central', icon: <Home size={20} /> },
        { id: 'prospect', label: 'Prospecção', icon: <Search size={20} /> },
        { id: 'crm', label: 'Pipeline CRM', icon: <LayoutTemplate size={20} /> },
        { id: 'contacts', label: 'Decisores', icon: <Users size={20} /> },
        { id: 'companies', label: 'Empresas', icon: <Building2 size={20} /> },
        { id: 'activities', label: 'Agenda', icon: <Activity size={20} /> },
    ];

    const aiTools = [
        { id: 'roleplay', label: 'Dojo de Vendas', icon: <Bot size={20} /> },
        { id: 'intelligence', label: 'Hub de IA', icon: <Zap size={20} /> },
        { id: 'topic_training', label: 'Academy', icon: <BookOpen size={20} /> },
        { id: 'bitrix', label: 'Bitrix24', icon: <Layers size={20} /> },
        { id: 'reports', label: 'Relatórios IA', icon: <FileBarChart size={20} /> },
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
"""

os.makedirs("src/components/layout", exist_ok=True)
with open("src/components/layout/Sidebar.tsx", "w", encoding="utf-8") as f:
    f.write(sidebar_content)

# Update App.tsx
with open("src/App.tsx", "r", encoding="utf-8") as f:
    app_content = f.read()

# Add missing lazy imports
if "const VoiceRoleplay = lazy(" not in app_content:
    app_content = app_content.replace(
        "const ChatbookHub = lazy(",
        "const VoiceRoleplay = lazy(() => import('./features/intelligence/components/VoiceRoleplay').then(m => ({ default: m.VoiceRoleplay })));\nconst TopicTrainingAcademy = lazy(() => import('./features/intelligence/components/TopicTrainingAcademy').then(m => ({ default: m.TopicTrainingAcademy })));\nconst BitrixGuideHub = lazy(() => import('./features/intelligence/components/BitrixGuideHub').then(m => ({ default: m.BitrixGuideHub })));\nconst ReportsHub = lazy(() => import('./features/intelligence/components/ReportsHub').then(m => ({ default: m.ReportsHub })));\nconst ChatbookHub = lazy("
    )

# Add missing routes in AppLayout
if "activeTab === 'roleplay'" not in app_content:
    app_content = app_content.replace(
        "{activeTab === 'chatbook' && <ChatbookHub />}",
        """{activeTab === 'chatbook' && <ChatbookHub />}
        {activeTab === 'roleplay' && <div className="h-full w-full p-8"><div className="h-[700px] max-w-4xl mx-auto w-full"><VoiceRoleplay onClose={() => setActiveTab('dashboard')} onSwitchToText={() => {}} /></div></div>}
        {activeTab === 'topic_training' && <TopicTrainingAcademy />}
        {activeTab === 'bitrix' && <BitrixGuideHub />}
        {activeTab === 'reports' && <ReportsHub />}"""
    )

with open("src/App.tsx", "w", encoding="utf-8") as f:
    f.write(app_content)

# Update MainLayout.tsx to use Sidebar
with open("src/components/layout/MainLayout.tsx", "r", encoding="utf-8") as f:
    main_layout = f.read()

if "import { Sidebar }" not in main_layout:
    main_layout = main_layout.replace("import { Header", "import { Sidebar }\nfrom './Sidebar';\nimport { Header")
    main_layout = main_layout.replace("import { Sidebar }\nfrom", "import { Sidebar } from")
    
    # Restructure flex layout
    old_main = """            <div className="relative z-10 flex flex-col h-full w-full">
                {activeTab !== 'dashboard' && (
                    <Header activeTab={activeTab} onTabChange={onTabChange} />
                )}"""
    
    new_main = """            <div className="relative z-10 flex h-full w-full">
                {/* Removemos o Header global antigo, injetamos a Sidebar contínua */}
                <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
                <div className="flex-1 flex flex-col h-full overflow-hidden relative">"""
                
    main_layout = main_layout.replace(old_main, new_main)
    
    # Close the extra div
    main_layout = main_layout.replace(
        """                <AnimatePresence mode="wait">
                    <motion.div""",
        """                <AnimatePresence mode="wait">
                    <motion.div"""
    )
    main_layout = main_layout.replace(
        """            </main>
            <Toaster />
            <VoiceCommandWidget />
            <AtlasChatbotTrigger />
            </div>
        </div>""",
        """            </main>
            <Toaster />
            <VoiceCommandWidget />
            <AtlasChatbotTrigger />
            </div>
            </div>
        </div>"""
    )

with open("src/components/layout/MainLayout.tsx", "w", encoding="utf-8") as f:
    f.write(main_layout)

# Update SinglePageDashboard to act as a proper simple Dashboard instead of nested router
dash_path = "src/features/dashboard/components/SinglePageDashboard.tsx"
with open(dash_path, "r", encoding="utf-8") as f:
    dash_content = f.read()

# We need to completely rewrite SinglePageDashboard to be just a Dashboard, 
# not the Step 1, Step 2, Step 3 router.
new_dash_content = """import React from 'react';
import { ClockCalendarWidget } from '../../../components/ui/ClockCalendarWidget';
import { LiveStatsWidget } from '../../../components/ui/LiveStatsWidget';
import { useBrand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';
import { motion } from 'framer-motion';

export function SinglePageDashboard({ onSelectModule }: { onSelectModule?: (tab: string) => void }) {
    const { activeBrand } = useBrand();
    const { currentUser } = useAuth();
    const isAtlas = activeBrand === 'atlasgr';

    return (
        <div className="flex-1 overflow-y-auto bg-transparent flex flex-col items-center relative min-h-screen font-sans p-4 md:p-8 space-y-8">
            <div className="w-full max-w-7xl space-y-8">
                
                {/* Header Simples do Painel */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black">Olá, {currentUser?.name || 'Usuário'}</h1>
                        <p className="text-sm opacity-70">Resumo da operação {isAtlas ? 'AtlasGR' : 'TotalTrac'} de hoje.</p>
                    </div>
                </div>

                <ClockCalendarWidget />
                
                <LiveStatsWidget />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div 
                        whileHover={{ scale: 1.02 }}
                        onClick={() => onSelectModule && onSelectModule('prospect')}
                        className={`p-8 rounded-3xl cursor-pointer shadow-lg border ${isAtlas ? 'bg-orange-500 text-white border-orange-400' : 'bg-blue-600 text-white border-blue-500'}`}
                    >
                        <h2 className="text-xl font-black mb-2">Prospecção Ativa</h2>
                        <p className="text-sm opacity-90">Ir para a área de mapeamento e varredura de mercado.</p>
                    </motion.div>

                    <motion.div 
                        whileHover={{ scale: 1.02 }}
                        onClick={() => onSelectModule && onSelectModule('crm')}
                        className={`p-8 rounded-3xl cursor-pointer shadow-lg border ${isAtlas ? 'bg-white text-slate-900 border-orange-100' : 'bg-slate-800 text-white border-slate-700'}`}
                    >
                        <h2 className="text-xl font-black mb-2">Pipeline de Vendas</h2>
                        <p className="text-sm opacity-90">Acessar os quadros Kanban do CRM.</p>
                    </motion.div>
                </div>

            </div>
        </div>
    );
}
"""

with open(dash_path, "w", encoding="utf-8") as f:
    f.write(new_dash_content)

print("UX Refactoring complete.")
