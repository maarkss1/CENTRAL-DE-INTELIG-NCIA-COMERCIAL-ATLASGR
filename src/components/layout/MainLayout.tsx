import { ReactNode } from 'react';
import { Header, TabType } from './Header';
import { Toaster } from '../ui/Toaster';
import { AtlasChatbotTrigger } from '../ui/AtlasChatbotTrigger';
import { VoiceCommandWidget } from '../ui/VoiceCommandWidget';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';

interface MainLayoutProps {
    children: ReactNode;
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

export function MainLayout({ children, activeTab, onTabChange }: MainLayoutProps) {
    const { theme } = useTheme();

    return (
        <div className={`h-screen w-full flex flex-col bg-transparent ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'} font-sans overflow-hidden relative transition-colors duration-500`}>
            
            {/* DUAL BRAND ANIMATED GRADIENT BACKGROUND (LARANJA ATLASGR & AZUL TOTALTRAC) */}
            <div className="absolute inset-0 flex z-0 overflow-hidden pointer-events-none">
                {/* Lado Esquerdo: Laranja Vibrante AtlasGR */}
                <div 
                    className="w-1/2 h-full relative overflow-hidden animate-[gradient-flow_8s_ease-in-out_infinite] transition-all duration-700"
                    style={{
                        background: theme === 'light'
                            ? 'linear-gradient(135deg, #ffffff 0%, #fff7ed 45%, #ffedd5 100%)'
                            : 'linear-gradient(135deg, #fff3eb 0%, #ffab80 45%, #FF5618 100%)',
                        backgroundSize: '200% 200%'
                    }}
                >
                    <div className={`absolute -top-24 -left-24 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse ${theme === 'light' ? 'bg-orange-300/25' : 'bg-[#FF5618]/30'}`} />
                    <div className="absolute bottom-10 left-10 w-96 h-96 bg-atlas-yellow/15 rounded-full blur-3xl" />
                </div>

                {/* Lado Direito: Azul Vibrante TotalTrac */}
                <div 
                    className="w-1/2 h-full relative overflow-hidden animate-[gradient-flow_8s_ease-in-out_infinite] transition-all duration-700"
                    style={{
                        background: theme === 'light'
                            ? 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 45%, #e0f2fe 100%)'
                            : 'linear-gradient(135deg, #eaf8ff 0%, #80d4ff 45%, #0088CC 100%)',
                        backgroundSize: '200% 200%',
                        animationDelay: '1s'
                    }}
                >
                    <div className={`absolute -top-24 -right-24 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse ${theme === 'light' ? 'bg-sky-300/25' : 'bg-[#0088CC]/30'}`} />
                    <div className="absolute bottom-10 right-10 w-96 h-96 bg-sky-400/15 rounded-full blur-3xl" />
                </div>

                {/* Divisor Central Suave em Glassmorphism */}
                <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-64 ${theme === 'light' ? 'bg-gradient-to-r from-orange-200/30 via-white/70 to-blue-200/30' : 'bg-gradient-to-r from-orange-400/20 via-white/40 to-blue-400/20'} backdrop-blur-md pointer-events-none`} />
            </div>

            <div className="relative z-10 flex flex-col h-full w-full">
                {activeTab !== 'dashboard' && (
                    <Header activeTab={activeTab} onTabChange={onTabChange} />
                )}
                <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-transparent">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="flex-1 flex flex-col min-h-0 overflow-hidden"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </main>
            <Toaster />
            <VoiceCommandWidget />
            <AtlasChatbotTrigger />
            </div>
        </div>
    );
}
