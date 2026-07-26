import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from '../Logo';
import { NAV_ITEMS, type TabType } from './nav';
import { IconChevronsLeft } from '../icons';
import { cn } from '../../lib/utils';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const COLLAPSE_KEY = 'atlasgr:sidebar-collapsed';

function NavList({
  activeTab,
  onTabChange,
  collapsed,
  onNavigate,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3">
      {NAV_ITEMS.map((item) => {
        const isActive = activeTab === item.tab;
        return (
          <button
            key={item.tab}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            onClick={() => {
              onTabChange(item.tab);
              onNavigate();
            }}
            className={cn(
              'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200 cursor-pointer',
              isActive ? 'text-atlas-orange' : 'text-slate-500 hover:text-atlas-dark hover:bg-black/[0.035]',
              collapsed && 'justify-center px-0'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-xl bg-atlas-orange/10 ring-1 ring-atlas-orange/20"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <item.icon className="relative z-10 h-5 w-5 shrink-0" strokeWidth={isActive ? 2 : 1.75} />
            {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export function Sidebar({ activeTab, onTabChange, mobileOpen, onCloseMobile }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <>
      {/* Sidebar de área de trabalho — persistente e recolhível */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 252 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="relative z-20 hidden h-full shrink-0 flex-col overflow-hidden border-r border-black/5 glass-panel-strong elevation-1 md:flex"
      >
        <div className={cn('flex items-center gap-3 px-5 pb-4 pt-6', collapsed && 'justify-center px-0')}>
          <Logo variant={collapsed ? 'symbol' : 'default'} className={collapsed ? 'h-8 w-8' : 'h-8'} />
        </div>

        <NavList activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} onNavigate={() => {}} />

        <div className="border-t border-black/5 px-3 pb-5 pt-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:bg-black/[0.035] hover:text-atlas-dark',
              collapsed && 'justify-center px-0'
            )}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <IconChevronsLeft className={cn('h-4 w-4 transition-transform duration-300', collapsed && 'rotate-180')} />
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </motion.aside>

      {/* Gaveta mobile */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-30 bg-atlas-dark/40 backdrop-blur-sm md:hidden"
              aria-hidden="true"
            />
            <motion.aside
              key="sidebar-drawer"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col glass-panel-strong elevation-4 md:hidden"
            >
              <div className="flex items-center gap-3 px-5 pb-4 pt-6">
                <Logo variant="default" className="h-8" />
              </div>
              <NavList activeTab={activeTab} onTabChange={onTabChange} collapsed={false} onNavigate={onCloseMobile} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
