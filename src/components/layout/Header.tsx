import { Home, Moon, Sun } from 'lucide-react';
import { Logo } from '../Logo';
import { useTheme } from '../../contexts/ThemeContext';

export type TabType = 'dashboard' | 'companies' | 'contacts' | 'crm' | 'activities' | 'prospect' | 'enrich' | 'intelligence' | 'prompts' | 'chatbook' | 'roleplay' | 'topic_training' | 'bitrix' | 'reports' | 'integrations' | 'knowledge';

interface HeaderProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

export function Header({ activeTab, onTabChange }: HeaderProps) {
    const { theme, toggleTheme } = useTheme();
    
    return (
        <header className="bg-white dark:bg-black/40 border-b-4 border-atlas-orange sticky top-0 z-30 shadow-sm backdrop-blur-xl transition-colors duration-300">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                <div 
                    className="flex items-center gap-3 shrink-0 mr-6 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onTabChange('dashboard')}
                >
                    <Logo className="h-10" />
                    <div className="h-8 w-px bg-gray-200 dark:bg-gray-800 mx-2 hidden md:block"></div>
                    <span className="font-bold text-xs tracking-widest uppercase bg-gradient-to-r from-atlas-orange to-amber-500 bg-clip-text text-transparent hidden md:block">
                        ⚡ Turbo CRM
                    </span>
                </div>

                <nav className="flex gap-4 shrink-0 items-center">
                    <button 
                        onClick={toggleTheme}
                        className="p-2.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/20 transition-all cursor-pointer"
                        title={`Mudar para modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
                    >
                        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                    {activeTab !== 'dashboard' && (
                        <button
                            onClick={() => onTabChange('dashboard')}
                            className="flex items-center gap-2 px-4 py-2.5 font-bold text-sm uppercase tracking-wider rounded-xl transition-all cursor-pointer bg-atlas-dark dark:bg-white/10 text-white shadow-md hover:bg-gray-800 dark:hover:bg-white/20"
                        >
                            <Home size={16} />
                            <span className="hidden sm:inline">Painel Central</span>
                        </button>
                    )}
                </nav>
            </div>
        </header>
    );
}
