import { ReactNode, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TabType } from './nav';
import { Toaster } from '../ui/Toaster';
import { pageTransition } from '../../lib/motion';

interface MainLayoutProps {
    children: ReactNode;
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

export function MainLayout({ children, activeTab, onTabChange }: MainLayoutProps) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    return (
        <div className="relative flex h-screen w-full overflow-hidden bg-[#F9FAFB] font-sans text-[#333333]">
            <div className="atlas-aurora" aria-hidden="true" />

            <Sidebar
                activeTab={activeTab}
                onTabChange={onTabChange}
                mobileOpen={mobileNavOpen}
                onCloseMobile={() => setMobileNavOpen(false)}
            />

            <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
                <Topbar activeTab={activeTab} onOpenMobileMenu={() => setMobileNavOpen(true)} />

                <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            variants={pageTransition}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="flex min-h-0 flex-1 flex-col overflow-hidden"
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            <Toaster />
        </div>
    );
}
