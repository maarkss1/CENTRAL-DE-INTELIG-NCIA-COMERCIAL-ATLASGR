import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Sun, Moon, Menu } from 'lucide-react';
import { TabType, TAB_META } from './tabMeta';
import { useLiveClock } from '../../hooks/useLiveClock';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { OPEN_COMMAND_PALETTE_EVENT } from '../../lib/paletteIntent';
import { notificationsApi } from '../../features/notifications/notifications.api';

interface AppTopbarProps {
    activeTab: TabType;
    /** Abre a Sidebar off-canvas em telas < lg. */
    onOpenMobileNav?: () => void;
}

export function AppTopbar({ activeTab, onOpenMobileNav }: AppTopbarProps) {
    const now = useLiveClock();
    const { currentUser } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const meta = TAB_META[activeTab] ?? TAB_META.dashboard;
    const Icon = meta.icon;

    // Contagem real de não lidas — GET /api/notifications?unread=1 (mesmo endpoint usado pela
    // tela de Notificações). Sem isso o sino era cenográfico: nenhum clique navegava e o ponto
    // vermelho aparecia sempre, mesmo com a caixa zerada. Recarrega ao montar e ao focar a aba
    // (sem polling contínuo — este produto evita loop/timer sem necessidade comprovada, ver
    // CLAUDE.md seção 8/11) para refletir notificações lidas/criadas em outra aba ou sessão.
    const [unreadCount, setUnreadCount] = useState(0);
    useEffect(() => {
        let cancelled = false;
        const loadUnread = async () => {
            try {
                const { unread } = await notificationsApi.list(true);
                if (!cancelled) setUnreadCount(unread);
            } catch {
                // Falha ao consultar não derruba o topbar — o sino continua navegando de verdade,
                // só fica sem o indicador até a próxima tentativa bem-sucedida.
                if (!cancelled) setUnreadCount(0);
            }
        };
        void loadUnread();
        window.addEventListener('focus', loadUnread);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', loadUnread);
        };
    }, []);

    const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
    const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const userInitial = currentUser?.name?.charAt(0).toUpperCase() || 'U';

    return (
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/90 backdrop-blur-xl px-4 sm:px-6">
            <button
                type="button"
                onClick={onOpenMobileNav}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 lg:hidden"
                aria-label="Abrir menu de navegação"
            >
                <Menu className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 items-center gap-2.5">
                <Icon className="h-[18px] w-[18px] shrink-0 text-brand" />
                <h1 className="truncate text-sm font-bold uppercase tracking-wide text-ink">{meta.label}</h1>
            </div>

            <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
                className="ml-2 hidden max-w-sm flex-1 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-ink-2 transition-colors hover:border-brand/40 hover:text-ink lg:flex"
            >
                <Search className="h-4 w-4 shrink-0" />
                <span className="text-sm">Buscar empresa, decisor ou comando…</span>
                <kbd className="ml-auto rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                    ⌘K
                </kbd>
            </button>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
                <div className="hidden text-right leading-tight sm:block">
                    <p className="text-[11px] font-medium capitalize text-ink-2">{dateLabel}</p>
                    <p className="text-sm font-bold text-ink">{timeLabel}</p>
                </div>

                <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2"
                    aria-label="Alternar tema"
                    title={`Mudar para modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
                >
                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>

                <button
                    type="button"
                    onClick={() => navigate('/app/notifications')}
                    className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2"
                    aria-label={unreadCount > 0 ? `Notificações — ${unreadCount} não lida${unreadCount === 1 ? '' : 's'}` : 'Notificações'}
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                    )}
                </button>

                <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-sm font-bold text-white shadow-card"
                    title={currentUser?.name || 'Usuário'}
                >
                    {userInitial}
                </div>
            </div>
        </header>
    );
}
