import { ChevronRight, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBrand } from '../../contexts/BrandContext';
import { useAuth } from '../../contexts/AuthContext';
import { hasRequiredRole, MESA_TRATAMENTO_ROLES } from '../../lib/auth/authorization';
import { EXECUTIVE_HUB_ALLOWED_EMAIL } from '../../config/access-policy';
import { SoundFX } from '../../lib/soundEffects';
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
  const { currentUser, isAdmin, canAccessCommercialIntelligence, canAccessCopilotoIa, logout } =
    useAuth();
  const isAtlas = activeBrand === 'atlasgr';
  const navigate = useNavigate();
  const canManageOperations =
    !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR']);
  const canAccessMesaTratamento =
    !!currentUser && hasRequiredRole(currentUser.role, MESA_TRATAMENTO_ROLES);

  const isJoaoReisOrAdmin =
    !!currentUser &&
    (currentUser.email?.toLowerCase().includes('joao.reis') ||
      currentUser.name?.toLowerCase().includes('joão reis') ||
      canManageOperations);

  const selectTab = (tab: TabType) => {
    if (tab !== activeTab) SoundFX.play('navigate');
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
    'bitrix',
    ...(canManageOperations ? (['integrations', 'automations'] as TabType[]) : []),
    ...(isAdmin ? (['usage', 'team'] as TabType[]) : []),
    'settings',
  ];

  const isMarcelo =
    !!currentUser && currentUser.email?.toLowerCase().trim() === EXECUTIVE_HUB_ALLOWED_EMAIL;

  const executiveRepoItems: TabType[] = [
    'social-selling',
    'treinamento-atlasgr',
    'proposta-comercial',
    'hub-inteligencia-marketing',
  ];

  // Navegação orientada pela jornada comercial, não pela árvore técnica do projeto.
  // TAB_META é a fonte única de rótulo/ícone e TabType impede destinos fantasma.
  const navGroupsByJourney: NavGroupDefinition[] = [
    {
      title: 'Visão Geral',
      items: ['dashboard', ...(isJoaoReisOrAdmin ? (['sdr-diagnostic-joao'] as TabType[]) : [])],
    },
    ...(isMarcelo
      ? [
          {
            title: 'Repositórios Executivos',
            items: executiveRepoItems,
          },
        ]
      : []),
    { title: 'Captar', items: ['prospect'] },
    {
      title: 'Qualificar',
      items: [
        'companies',
        'contacts',
        ...(canAccessMesaTratamento ? (['mesa-tratamento'] as TabType[]) : []),
        'qualification_matrix',
      ],
    },
    { title: 'Relacionar', items: ['activities', 'calendar', 'cadence'] },
    { title: 'Fechar', items: ['crm', 'crm360', 'propostas'] },
    { title: 'Analisar', items: analyzeItems },
    {
      title: 'IA & Capacitação',
      items: [
        ...(canAccessCopilotoIa ? (['copiloto_ia'] as TabType[]) : []),
        'intelligence',
        'chatbook',
        'roleplay',
        'objections_matrix',
        'topic_training',
        'knowledge',
        'editor',
      ],
    },
    { title: 'Administração', items: administrationItems },
  ];

  const GROUP_ORDER_BY_ROLE: Partial<Record<string, string[]>> = {
    CLOSER: [
      'Visão Geral',
      'Relacionar',
      'Fechar',
      'Qualificar',
      'Captar',
      'Analisar',
      'IA & Capacitação',
      'Administração',
    ],
    GESTOR: [
      'Visão Geral',
      'Analisar',
      'Fechar',
      'Relacionar',
      'Qualificar',
      'Captar',
      'Administração',
      'IA & Capacitação',
    ],
    ADMIN: [
      'Visão Geral',
      'Analisar',
      'Fechar',
      'Relacionar',
      'Qualificar',
      'Captar',
      'Administração',
      'IA & Capacitação',
    ],
    VISUALIZADOR: [
      'Visão Geral',
      'Analisar',
      'Relacionar',
      'Fechar',
      'Qualificar',
      'Captar',
      'IA & Capacitação',
      'Administração',
    ],
  };

  const roleOrder = GROUP_ORDER_BY_ROLE[currentUser?.role ?? ''];
  const navGroups = roleOrder
    ? [...navGroupsByJourney].sort(
        (a, b) => roleOrder.indexOf(a.title) - roleOrder.indexOf(b.title),
      )
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
        className={`group relative w-full overflow-hidden rounded-xl border px-2.5 py-2 text-left text-sm font-bold transition-[transform,background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          isActive
            ? 'translate-x-1 border-brand/20 bg-brand-active text-white shadow-[0_14px_28px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.16)]'
            : 'border-transparent text-ink-2 hover:translate-x-0.5 hover:border-line hover:bg-surface-2 hover:text-ink'
        }`}
      >
        {isActive && (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.45)]"
          />
        )}
        <span className="relative z-10 flex items-center gap-2.5">
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-[transform,background-color,border-color] duration-200 group-hover:scale-105 ${
              isActive
                ? 'border-white/15 bg-white/10'
                : 'border-line/80 bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
            }`}
          >
            <Icon size={17} aria-hidden="true" />
          </span>
          <span className="truncate">{meta.label}</span>
        </span>
      </button>
    );
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex h-full w-[min(21rem,calc(100vw-2rem))] flex-col border-r border-line bg-surface/96 shadow-[18px_0_48px_-36px_rgba(0,0,0,0.9),inset_-1px_0_0_rgba(255,255,255,0.025)] backdrop-blur-xl transition-transform duration-300 md:static md:w-72 md:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-label="Navegação principal por jornada comercial"
    >
      <div className="relative border-b border-line p-4">
        <div
          className="pointer-events-none absolute -left-14 -top-20 h-40 w-40 rounded-full bg-brand/8 blur-[60px]"
          aria-hidden="true"
        />
        <div className="relative z-10 mb-3 flex items-center gap-2">
          {isAtlas ? (
            <Logo className="h-8 text-ink" />
          ) : (
            <TotalTrackLogo className="h-8 text-ink" />
          )}
        </div>

        <button
          type="button"
          className="group relative w-full cursor-pointer text-left"
          onClick={() => {
            SoundFX.play('confirm');
            setActiveBrand(isAtlas ? 'totaltrac' : 'atlasgr');
          }}
          aria-label={`Alternar para a operação ${isAtlas ? 'Total Trac' : 'AtlasGR'}`}
        >
          <div className="flex items-center justify-between rounded-[var(--radius-nav-item)] border border-line bg-surface-2/80 p-2.5 shadow-[0_12px_28px_-24px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,border-color,background-color,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:border-brand/25 group-hover:bg-brand/8 group-hover:shadow-card">
            <div className="flex items-center gap-2">
              {isAtlas ? (
                <Logo variant="symbol" className="h-7 w-7 shrink-0" />
              ) : (
                <TotalTrackLogo variant="symbol" className="h-7 w-7 shrink-0" />
              )}
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-brand-active dark:text-brand-2">
                  Operação Atual
                </span>
                <span className="text-sm font-black text-ink">
                  {isAtlas ? 'AtlasGR' : 'Total Trac'}
                </span>
              </div>
            </div>
            <div className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-ink-2 shadow-sm">
              <ChevronRight
                size={14}
                className="transition-transform duration-200 group-hover:rotate-90"
                aria-hidden="true"
              />
            </div>
          </div>
        </button>
      </div>

      <nav
        aria-label="Navegação principal"
        className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-3 py-4"
      >
        {navGroups.map((group) => (
          <section key={group.title} className="space-y-1" aria-label={group.title}>
            <div className="mb-2 flex items-center gap-2 px-3">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-ink-2">
                {group.title}
              </p>
              <span
                className="h-px flex-1 bg-gradient-to-r from-line to-transparent"
                aria-hidden="true"
              />
            </div>
            {group.items.map(renderNavItem)}
          </section>
        ))}
      </nav>

      <div className="space-y-2 border-t border-line p-3">
        {currentUser && (
          <div className="rounded-xl border border-line bg-surface-2/70 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-xs font-bold text-white shadow-card ring-1 ring-white/10">
                {currentUser.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold leading-tight text-ink">
                  {currentUser.name}
                </p>
                <p className="truncate text-[10px] font-medium leading-tight text-ink-2">
                  {currentUser.roleTitle || currentUser.role}
                </p>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={logout}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-bold text-critical transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:border-critical/15 hover:bg-critical/10 active:translate-y-0"
          title="Encerrar sessão e sair da conta"
        >
          <LogOut size={20} className="shrink-0 opacity-80" />
          <span>Sair da Conta</span>
        </button>
      </div>
    </aside>
  );
}
