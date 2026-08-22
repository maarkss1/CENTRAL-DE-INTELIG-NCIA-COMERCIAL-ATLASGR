import { ChevronRight, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBrand } from '../../contexts/BrandContext';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../Logo';
import { TotalTrackLogo } from '../TotalTrackLogo';
import { TAB_META, type TabType } from './tabMeta';

interface SidebarProps {
    activeTab: TabType;
    mobileOpen?: boolean;
    onCloseMobile?: () => void;
}

interface NavGroupDefinition {
    title: string;
    items: TabType[];
}

export function Sidebar({ activeTab, mobileOpen = false, onCloseMobile }: SidebarProps) {
    const { activeBrand, setActiveBrand } = useBrand();
    const { currentUser, isAdmin, canAccessCommercialIntelligence, logout } = useAuth();
    const isAtlas = activeBrand === 'atlasgr';
    const navigate = useNavigate();

    const selectTab = (tab: TabType) => {
        navigate(`/app/${tab}`);
        onCloseMobile?.();
    };

    const analyzeItems: TabType[] = [
        ...(canAccessCommercialIntelligence ? (['commercial_intelligence'] as TabType[]) : []),
        'analytics',
        'winloss',
        'reports',
    ];

    const administrationItems: TabType[] = [
        'notifications',
        ...(isAdmin ? (['integrations', 'automations', 'usage', 'team'] as TabType[]) : []),
        'settings',
    ];

    // Navegação orientada pela jornada comercial, não pela árvore técnica do projeto.
    // TAB_META é a fonte única de rótulo/ícone e TabType impede destinos fantasma.
    const navGroupsByJourney: NavGroupDefinition[] = [
        { title: 'Visão Geral', items: ['dashboard'] },
        { title: 'Captar', items: ['prospect', 'market-intelligence'] },
        { title: 'Qualificar', items: ['companies', 'contacts', 'mesa-tratamento', 'qualification_matrix'] },
        { title: 'Relacionar', items: ['activities', 'calendar', 'cadence'] },
        { title: 'Fechar', items: ['crm', 'crm360', 'propostas'] },
        { title: 'Analisar', items: analyzeItems },
        {
            title: 'IA & Capacitação',
            items: [
                'intelligence',
                'chatbook',
                'roleplay',
                'objections_matrix',
                'topic_training',
                'knowledge',
                'editor',
                'bitrix',
            ],
        },
        { title: 'Administração', items: administrationItems },
    ];

    // Reordena os MESMOS grupos (nenhum item some, nenhum some por papel — RBAC continua só nos
    // itens condicionais acima) pra abrir a Sidebar já no trecho da jornada comercial que aquele
    // papel usa no dia a dia. Papel ausente/desconhecido e SDR (início do funil: captar→qualificar)
    // caem na ordem padrão da jornada, que já é a ordem natural pra quem prospecta. Ver seção 5 da
    // Constituição (`CLAUDE.md`) — exceção justificada por papel/fluxo real de uso, não estética.
    const GROUP_ORDER_BY_ROLE: Partial<Record<string, string[]>> = {
        // Closer trabalha negócios já qualificados: acompanhamento e fechamento vêm antes de
        // prospecção, que não é responsabilidade dele.
        CLOSER: ['Visão Geral', 'Relacionar', 'Fechar', 'Qualificar', 'Captar', 'Analisar', 'IA & Capacitação', 'Administração'],
        // Gestor/Admin abrem o app pra decidir, não pra prospectar — visão executiva primeiro.
        GESTOR: ['Visão Geral', 'Analisar', 'Fechar', 'Relacionar', 'Qualificar', 'Captar', 'Administração', 'IA & Capacitação'],
        ADMIN: ['Visão Geral', 'Analisar', 'Fechar', 'Relacionar', 'Qualificar', 'Captar', 'Administração', 'IA & Capacitação'],
        // Visualizador só acompanha (sem create/edit em massa) — mesma prioridade de leitura do
        // Gestor, sem a Administração em destaque (não tem os itens extras que só ADMIN ganha).
        VISUALIZADOR: ['Visão Geral', 'Analisar', 'Relacionar', 'Fechar', 'Qualificar', 'Captar', 'IA & Capacitação', 'Administração'],
    };

    const roleOrder = GROUP_ORDER_BY_ROLE[currentUser?.role ?? ''];
    const navGroups = roleOrder
        ? [...navGroupsByJourney].sort((a, b) => roleOrder.indexOf(a.title) - roleOrder.indexOf(b.title))
        : navGroupsByJourney;

    const renderNavItem = (tab: TabType) => {
        const meta = TAB_META[tab];
        if (!meta) return null;
        const Icon = meta.icon;
        const isActive = activeTab === tab;
        return (
            <button
                key={tab}
                type="button"
                onClick={() => selectTab(tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    isActive
                        ? 'bg-brand-active text-[#fff] shadow-md'
                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`}
            >
                <Icon size={20} className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`} aria-hidden="true" />
                <span>{meta.label}</span>
            </button>
        );
    };

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 h-full flex flex-col transition-transform duration-300 bg-surface border-r border-line md:static md:translate-x-0 ${
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
            <div className="p-4 border-b border-line">
                <div className="flex items-center gap-2 mb-3">
                    {isAtlas ? <Logo className="h-8 text-ink" /> : <TotalTrackLogo className="h-8 text-ink" />}
                </div>

                <button
                    type="button"
                    className="relative group cursor-pointer w-full text-left"
                    onClick={() => setActiveBrand(isAtlas ? 'totaltrac' : 'atlasgr')}
                    aria-label={`Alternar para a operação ${isAtlas ? 'Total Trac' : 'AtlasGR'}`}
                >
                    <div className="flex items-center justify-between p-2 rounded-xl border border-line bg-surface-2 hover:bg-brand/10 transition-all">
                        <div className="flex items-center gap-2">
                            {isAtlas ? (
                                <Logo variant="symbol" className="h-6 w-6 shrink-0" />
                            ) : (
                                <TotalTrackLogo variant="symbol" className="h-6 w-6 shrink-0" />
                            )}
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand">Operação Atual</span>
                                <span className="text-sm font-black text-ink">{isAtlas ? 'AtlasGR' : 'Total Trac'}</span>
                            </div>
                        </div>
                        <div className="w-6 h-6 rounded-md flex items-center justify-center bg-surface shadow-sm text-ink-2">
                            <ChevronRight size={14} className="group-hover:rotate-90 transition-transform" aria-hidden="true" />
                        </div>
                    </div>
                </button>
            </div>

            <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
                {navGroups.map((group) => (
                    <section key={group.title} className="space-y-1" aria-label={group.title}>
                        <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-ink-2">
                            {group.title}
                        </p>
                        {group.items.map(renderNavItem)}
                    </section>
                ))}
            </nav>

            <div className="p-3 border-t border-line space-y-2">
                {currentUser && (
                    <div className="px-3 py-2 rounded-xl bg-surface-2/60">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-xs font-bold text-white shadow-sm">
                                {currentUser.name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-ink truncate leading-tight">{currentUser.name}</p>
                                <p className="text-[10px] text-ink-2 truncate leading-tight font-medium">{currentUser.roleTitle || currentUser.role}</p>
                            </div>
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 transition-all cursor-pointer"
                    title="Encerrar sessão e sair da conta"
                >
                    <LogOut size={20} className="shrink-0 opacity-80" />
                    <span>Sair da Conta</span>
                </button>
            </div>
        </aside>
    );
}
