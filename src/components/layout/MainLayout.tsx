import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AppTopbar } from './AppTopbar';
import { OfflineBanner } from './OfflineBanner';
import { TabType } from './tabMeta';
import { Toaster } from '../ui/Toaster';
import { AtlasChatbotTrigger } from '../ui/AtlasChatbotTrigger';
import { BugReportButton } from '../ui/BugReportButton';
import { VoiceCommandWidget } from '../ui/VoiceCommandWidget';
import { CommandPalette } from '../ui/CommandPalette';
import { motion } from 'framer-motion';
import { useBrandAccent } from '../../hooks/useBrandAccent';
import { useNavigationBusBridge } from '../../hooks/useNavigationBusBridge';

interface MainLayoutProps {
    children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
    const { isAtlas } = useBrandAccent();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const location = useLocation();
    // Liga o navigationBus (usado hoje pelo comando de voz) à navegação real — ver
    // useNavigationBusBridge.ts sobre por que isto precisa ficar aqui dentro do Router.
    useNavigationBusBridge();
    // "/app" (dashboard) ou "/app/prospect" etc — o segmento logo após "/app" é o módulo ativo.
    // TabType assumido aqui porque toda rota é registrada em App.tsx com um valor de TabType como
    // path; qualquer path desconhecido já é redirecionado pra "/app" antes de chegar aqui.
    const activeTab = (location.pathname.split('/')[2] as TabType) || 'dashboard';

    // Fecha a navegação mobile sempre que o módulo ativo muda (ex.: usuário tocou num item do menu).
    useEffect(() => {
        setMobileNavOpen(false);
    }, [activeTab]);

    // Fecha com Escape, igual ao comportamento do Drawer/Dialog compartilhados.
    useEffect(() => {
        if (!mobileNavOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMobileNavOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mobileNavOpen]);

    return (
        <div className="h-screen w-full flex flex-col bg-bg text-ink font-sans overflow-hidden relative transition-colors duration-500">

            {/* BACKGROUND: superfície neutra e quente, com um brilho sutil da marca ativa */}
            <div className="absolute inset-0 flex z-0 overflow-hidden pointer-events-none bg-bg">
                {/* bg-brand/bg-brand-2 (não bg-atlas-orange/bg-totaltrack-blue estáticos) — reagem a
                    document.documentElement.style.setProperty em BrandContext.tsx sem precisar
                    tocar este componente se a paleta de alguma marca mudar. */}
                <div className={`absolute -top-32 -right-32 w-[560px] h-[560px] rounded-full blur-[120px] opacity-40 ${isAtlas ? 'bg-brand/20' : 'bg-brand-2/20'}`} />
                <div className={`absolute bottom-0 left-0 w-[420px] h-[420px] rounded-full blur-[110px] opacity-30 ${isAtlas ? 'bg-atlas-yellow/10' : 'bg-sky-300/10'}`} />
            </div>

            <OfflineBanner />

            <div className="relative z-10 flex flex-1 min-h-0 w-full">
                {/* Removemos o Header global antigo, injetamos a Sidebar contínua */}
                <Sidebar
                    activeTab={activeTab}
                    mobileOpen={mobileNavOpen}
                    onCloseMobile={() => setMobileNavOpen(false)}
                />
                {/* Backdrop da navegação mobile — some em telas md+, onde a Sidebar é estática */}
                {mobileNavOpen && (
                    <div
                        className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm md:hidden"
                        onClick={() => setMobileNavOpen(false)}
                        aria-hidden="true"
                    />
                )}
                <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                <AppTopbar activeTab={activeTab} onOpenMobileNav={() => setMobileNavOpen(true)} />
                <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-transparent">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="flex-1 flex flex-col min-h-0 overflow-hidden"
                    >
                        {children}
                    </motion.div>
            </main>
            <Toaster />
            <VoiceCommandWidget />
            <AtlasChatbotTrigger />
            <BugReportButton />
            <CommandPalette />
            </div>
            </div>
        </div>
    );
}
