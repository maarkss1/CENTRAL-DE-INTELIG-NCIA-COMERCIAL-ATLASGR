<<<<<<< HEAD
import { ChevronRight, LogOut } from 'lucide-react';
=======
import {
    Home, LayoutTemplate, Search, Users, Building2,
    Activity, BookOpen, Layers, FileBarChart, Zap, ChevronRight, Database, BarChart3, CalendarDays, Bell, Cpu, Wallet, FileText,
    PhoneCall, Target, Shield, MessageSquare, UserCog, Plug, Settings as SettingsIcon, Download, LineChart, Gauge, Repeat, FileSignature, Headset, Sparkles
} from 'lucide-react';
import { ReactNode } from 'react';
>>>>>>> origin/codex/redesenhar-navegacao-por-jornada
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

<<<<<<< HEAD
interface NavGroupDefinition {
    title: string;
    items: TabType[];
}
=======
type NavTool = {
    id: TabType;
    label: string;
    icon: ReactNode;
    helper?: string;
};

type NavJourney = {
    title: string;
    persona: string;
    promise: string;
    tools: NavTool[];
    adminOnly?: boolean;
    executiveOnly?: boolean;
};
>>>>>>> origin/codex/redesenhar-navegacao-por-jornada

export function Sidebar({ activeTab, mobileOpen = false, onCloseMobile }: SidebarProps) {
    const { activeBrand, setActiveBrand } = useBrand();
    const { currentUser, isAdmin, canAccessCommercialIntelligence, logout } = useAuth();
    const isAtlas = activeBrand === 'atlasgr';
    const navigate = useNavigate();

    const selectTab = (tab: TabType) => {
        navigate(`/app/${tab}`);
        onCloseMobile?.();
    };

<<<<<<< HEAD
    const analyzeItems: TabType[] = [
        ...(canAccessCommercialIntelligence ? (['commercial_intelligence'] as TabType[]) : []),
        'analytics',
        'winloss',
        'reports',
    ];

    const administrationItems: TabType[] = [
        'notifications',
        'bitrix',
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
            // Guia Bitrix24 saiu daqui: é referência estática de mapeamento de campos, não gera
            // nada com IA — morava aqui só por associação de nome com o resto do grupo. Agora fica
            // em Administração, ao lado de Integrações, onde a função real dele pertence.
            title: 'IA & Capacitação',
            items: [
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
=======
    const journeys: NavJourney[] = [
        {
            title: 'Vender hoje',
            persona: 'SDR / vendedor',
            promise: 'Abrir carteira, priorizar contas e executar follow-up sem procurar módulos soltos.',
            tools: [
                { id: 'dashboard', label: 'Painel Central', icon: <Home size={20} />, helper: 'Resumo da operação' },
                { id: 'prospect', label: 'Prospecção', icon: <Search size={20} />, helper: 'Encontrar novas contas' },
                { id: 'companies', label: 'Empresas', icon: <Building2 size={20} />, helper: 'ICP e contexto' },
                { id: 'contacts', label: 'Decisores', icon: <Users size={20} />, helper: 'Pessoas-chave' },
                { id: 'activities', label: 'Agenda', icon: <Activity size={20} />, helper: 'Próximas ações' },
                { id: 'calendar', label: 'Calendário', icon: <CalendarDays size={20} />, helper: 'Compromissos' },
            ],
        },
        {
            title: 'Fechar receita',
            persona: 'Closer / gestor comercial',
            promise: 'Acompanhar negociação, proposta, cadência e recuperação de perda na mesma jornada.',
            tools: [
                { id: 'crm', label: 'Pipeline CRM', icon: <LayoutTemplate size={20} />, helper: 'Board de oportunidades' },
                { id: 'crm360', label: 'Cockpit CRM', icon: <Gauge size={20} />, helper: 'Visão 360' },
                { id: 'mesa-tratamento', label: 'Mesa de Tratamento', icon: <Headset size={20} />, helper: 'Fila operacional' },
                { id: 'cadence', label: 'Cadência', icon: <Repeat size={20} />, helper: 'Sequências multicanal' },
                { id: 'propostas', label: 'Propostas', icon: <FileSignature size={20} />, helper: 'Documentos comerciais' },
                { id: 'winloss', label: 'Win/Loss', icon: <Target size={20} />, helper: 'Aprender com perdas' },
            ],
        },
        {
            title: 'Decidir e demonstrar',
            persona: 'Diretoria / pré-venda',
            promise: 'Mostrar valor executivo com métricas, inteligência de mercado e relatórios prontos para reunião.',
            executiveOnly: true,
            tools: [
                { id: 'commercial_intelligence', label: 'Comercial Inteligente', icon: <LineChart size={20} />, helper: 'Sala executiva' },
                { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={20} />, helper: 'Indicadores' },
                { id: 'market-intelligence', label: 'Market Intelligence', icon: <LineChart size={20} />, helper: 'Território e contas' },
                { id: 'reports', label: 'Relatórios IA', icon: <FileBarChart size={20} />, helper: 'Narrativas para demo' },
            ],
        },
        {
            title: 'Capacitar com IA',
            persona: 'Enablement / operação',
            promise: 'Treinar discurso, padronizar playbooks e automatizar tarefas repetitivas.',
            tools: [
                { id: 'chatbook', label: 'Chatbook', icon: <MessageSquare size={20} />, helper: 'Copiloto comercial' },
                { id: 'intelligence', label: 'Hub de IA', icon: <Zap size={20} />, helper: 'Ferramentas de IA' },
                { id: 'roleplay', label: 'Roleplay', icon: <PhoneCall size={20} />, helper: 'Simulação de ligação' },
                { id: 'qualification_matrix', label: 'Matriz de Qualificação', icon: <Target size={20} />, helper: 'Critérios do ICP' },
                { id: 'objections_matrix', label: 'Matriz de Objeções', icon: <Shield size={20} />, helper: 'Respostas aprovadas' },
                { id: 'topic_training', label: 'Academy', icon: <BookOpen size={20} />, helper: 'Treinamento' },
                { id: 'knowledge', label: 'Base de Conhecimento', icon: <Database size={20} />, helper: 'Conteúdo interno' },
                { id: 'editor', label: 'Editor de Documentos', icon: <FileText size={20} />, helper: 'Propostas assistidas' },
                { id: 'automations', label: 'Automações', icon: <Cpu size={20} />, helper: 'Rotinas inteligentes' },
                { id: 'usage', label: 'Consumo de IA', icon: <Wallet size={20} />, helper: 'Custos e limites' },
            ],
        },
        {
            title: 'Operar plataforma',
            persona: 'Admin / integrações',
            promise: 'Conectar canais, revisar notificações e ajustar preferências sem sair do fluxo comercial.',
            tools: [
                { id: 'integrations', label: 'Integrações', icon: <Plug size={20} />, helper: 'Conectores' },
                { id: 'bitrix', label: 'Guia Bitrix24', icon: <Layers size={20} />, helper: 'Como configurar' },
                { id: 'notifications', label: 'Notificações', icon: <Bell size={20} />, helper: 'Alertas' },
                { id: 'settings', label: 'Configurações', icon: <SettingsIcon size={20} />, helper: 'Preferências' },
            ],
        },
        {
            title: 'Administração',
            persona: 'Administrador',
            promise: 'Gerir acesso de usuários da organização.',
            adminOnly: true,
            tools: [
                { id: 'team', label: 'Equipe', icon: <UserCog size={20} />, helper: 'Usuários e papéis' },
            ],
        },
    ];

    const visibleJourneys = journeys
        .map(journey => ({
            ...journey,
            tools: journey.executiveOnly && canAccessCommercialIntelligence
                ? journey.tools
                : journey.executiveOnly
                    ? journey.tools.filter(tool => tool.id !== 'commercial_intelligence')
                    : journey.tools,
        }))
        .filter(journey => (!journey.adminOnly || isAdmin) && journey.tools.length > 0);

    const externalTools = [
        { label: 'Portal Comercial Bitrix24', href: '/tools/portal-comercial/index.html', icon: <Download size={20} /> },
    ];
>>>>>>> origin/codex/redesenhar-navegacao-por-jornada

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-40 h-full w-[min(21rem,calc(100vw-2rem))] flex flex-col transition-transform duration-300 bg-surface/95 border-r border-line shadow-[var(--shadow-nav)] backdrop-blur-xl md:static md:w-72 md:translate-x-0 ${
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            aria-label="Navegação principal por jornada comercial"
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
                    <div className="flex items-center justify-between p-2 rounded-[var(--radius-nav-item)] border border-line bg-surface-2 hover:bg-brand/10 transition-all">
                        <div className="flex items-center gap-2">
                            {isAtlas ? <Logo variant="symbol" className="h-6 w-6 shrink-0" /> : <TotalTrackLogo variant="symbol" className="h-6 w-6 shrink-0" />}
                            <div className="flex flex-col">
<<<<<<< HEAD
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-active dark:text-brand-2">Operação Atual</span>
=======
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand">Operação Atual</span>
>>>>>>> origin/codex/redesenhar-navegacao-por-jornada
                                <span className="text-sm font-black text-ink">{isAtlas ? 'AtlasGR' : 'Total Trac'}</span>
                            </div>
                        </div>
                        <div className="w-6 h-6 rounded-md flex items-center justify-center bg-surface shadow-sm text-ink-2">
                            <ChevronRight size={14} className="group-hover:rotate-90 transition-transform" aria-hidden="true" />
                        </div>
                    </div>
                </button>
            </div>

<<<<<<< HEAD
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
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm text-left text-critical hover:bg-critical/10 transition-all cursor-pointer"
                    title="Encerrar sessão e sair da conta"
                >
                    <LogOut size={20} className="shrink-0 opacity-80" />
                    <span>Sair da Conta</span>
                </button>
=======
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4 custom-scrollbar">
                <div className="rounded-[var(--radius-card)] border border-line bg-soft/70 p-3 text-xs text-ink-2">
                    <div className="mb-1 flex items-center gap-2 font-black uppercase tracking-[0.18em] text-brand">
                        <Sparkles size={14} /> Jornada guiada
                    </div>
                    <p className="leading-relaxed">Menu reorganizado por persona para vender, demonstrar e operar com menos cliques.</p>
                </div>

                {visibleJourneys.map(journey => (
                    <section key={journey.title} className="space-y-1.5" aria-labelledby={`nav-${journey.title.replace(/\s+/g, '-').toLowerCase()}`}>
                        <div className="px-3 pb-1">
                            <p id={`nav-${journey.title.replace(/\s+/g, '-').toLowerCase()}`} className="text-[11px] font-black uppercase tracking-widest text-ink">
                                {journey.title}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-brand">{journey.persona}</p>
                            <p className="mt-1 hidden text-[11px] leading-snug text-ink-2 md:block">{journey.promise}</p>
                        </div>
                        {journey.tools.map(tool => {
                            const isActive = activeTab === tool.id;
                            return (
                                <button
                                    key={tool.id}
                                    onClick={() => selectTab(tool.id)}
                                    className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-nav-item)] font-bold text-sm text-left transition-all min-h-11 ${
                                        isActive
                                            ? 'bg-brand-active text-white shadow-[var(--shadow-nav-active)]'
                                            : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                                    }`}
                                    aria-current={isActive ? 'page' : undefined}
                                >
                                    <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>{tool.icon}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate">{tool.label}</span>
                                        {tool.helper && <span className={`block truncate text-[10px] font-semibold ${isActive ? 'text-white/80' : 'text-ink-2/80'}`}>{tool.helper}</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </section>
                ))}

                <section className="space-y-1.5" aria-labelledby="nav-ferramentas-externas">
                    <p id="nav-ferramentas-externas" className="px-3 text-[11px] font-black uppercase tracking-widest text-ink">Ferramentas externas</p>
                    {externalTools.map(tool => (
                        <a key={tool.href} href={tool.href} target="_blank" rel="noopener noreferrer" className="w-full flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-[var(--radius-nav-item)] font-bold text-sm text-left transition-all text-ink-2 hover:bg-surface-2 hover:text-ink">
                            <span className="shrink-0 opacity-70">{tool.icon}</span>
                            <span>{tool.label}</span>
                        </a>
                    ))}
                </section>
>>>>>>> origin/codex/redesenhar-navegacao-por-jornada
            </div>
        </aside>
    );
}
