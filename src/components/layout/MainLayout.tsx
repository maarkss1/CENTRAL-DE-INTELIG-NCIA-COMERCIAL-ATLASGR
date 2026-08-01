import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { AppTopbar } from './AppTopbar';
import { TabType } from './Header';
import { Toaster } from '../ui/Toaster';
import { AtlasChatbotTrigger } from '../ui/AtlasChatbotTrigger';
import { VoiceCommandWidget } from '../ui/VoiceCommandWidget';
import { motion, AnimatePresence } from 'framer-motion';
import { useBrandAccent } from '../../hooks/useBrandAccent';

interface MainLayoutProps {
    children: ReactNode;
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

export function MainLayout({ children, activeTab, onTabChange }: MainLayoutProps) {
    const { isAtlas } = useBrandAccent();

    return (
        <div className="h-screen w-full flex flex-col bg-bg text-ink font-sans overflow-hidden relative transition-colors duration-500">

            {/* BACKGROUND: superfície neutra e quente, com um brilho sutil da marca ativa */}
            <div className="absolute inset-0 flex z-0 overflow-hidden pointer-events-none bg-bg">
                <div className={`absolute -top-32 -right-32 w-[560px] h-[560px] rounded-full blur-[120px] opacity-40 ${isAtlas ? 'bg-atlas-orange/20' : 'bg-totaltrack-blue/20'}`} />
                <div className={`absolute bottom-0 left-0 w-[420px] h-[420px] rounded-full blur-[110px] opacity-30 ${isAtlas ? 'bg-atlas-yellow/10' : 'bg-sky-300/10'}`} />
            </div>

            <div className="relative z-10 flex h-full w-full">
                {/* Removemos o Header global antigo, injetamos a Sidebar contínua */}
                <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
                <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                <AppTopbar activeTab={activeTab} />
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
        </div>
    );
}
