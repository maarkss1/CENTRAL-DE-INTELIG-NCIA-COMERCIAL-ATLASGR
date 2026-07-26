import { authClient } from '../../lib/auth-client';
import { useLiveClock } from '../../hooks/useLiveClock';
import { NAV_ITEMS, type TabType } from './nav';
import { IconMenu, IconSearch, IconBell, IconUser } from '../icons';
import { cn } from '../../lib/utils';

interface TopbarProps {
  activeTab: TabType;
  onOpenMobileMenu: () => void;
}

export function Topbar({ activeTab, onOpenMobileMenu }: TopbarProps) {
  const now = useLiveClock();
  const { data: session } = authClient.useSession();
  const current = NAV_ITEMS.find((item) => item.tab === activeTab) ?? NAV_ITEMS[0];

  const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const userName = session?.user?.name || session?.user?.email || 'Usuário';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-black/5 px-4 glass-panel elevation-1 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-atlas-dark/70 transition-colors hover:bg-black/[0.04] md:hidden"
        aria-label="Abrir menu de navegação"
      >
        <IconMenu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 items-center gap-2.5">
        <current.icon className="h-[18px] w-[18px] shrink-0 text-atlas-orange" />
        <h1 className="truncate text-sm font-bold uppercase tracking-wide text-atlas-dark/80">{current.label}</h1>
      </div>

      <div
        className={cn(
          'ml-2 hidden max-w-sm flex-1 items-center gap-2 rounded-xl border border-black/5 bg-black/[0.025] px-3 py-2 text-slate-400 transition-colors hover:text-slate-500 lg:flex'
        )}
      >
        <IconSearch className="h-4 w-4 shrink-0" />
        <span className="text-sm">Pesquisar…</span>
        <kbd className="ml-auto rounded-md border border-black/10 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-[11px] font-medium capitalize text-slate-400">{dateLabel}</p>
          <p className="text-sm font-bold text-atlas-dark">{timeLabel}</p>
        </div>

        <button
          type="button"
          className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-atlas-dark/70 transition-colors hover:bg-black/[0.04]"
          aria-label="Notificações"
        >
          <IconBell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-atlas-orange" />
        </button>

        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-atlas-orange to-atlas-yellow text-sm font-bold text-white elevation-1"
          title={userName}
        >
          {session?.user ? userInitial : <IconUser className="h-[18px] w-[18px]" />}
        </div>
      </div>
    </header>
  );
}
