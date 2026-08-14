import {
    Home, Search, LayoutTemplate, Users, Building2, Activity, BookOpen,
    Layers, FileBarChart, Zap, Sparkles, MessageSquare, Wand2, Globe, Bell,
    BarChart3, CalendarDays, Cpu, Wallet, FileText, Database, PhoneCall, Target, Shield, UserCog, Settings as SettingsIcon,
    LineChart, Gauge,
} from 'lucide-react';

/** Identificador de cada módulo navegável — fonte única usada pela Sidebar, Topbar e Command Palette. */
export type TabType = 'dashboard' | 'companies' | 'contacts' | 'crm' | 'crm360' | 'activities' | 'prospect' | 'enrich' | 'intelligence' | 'market-intelligence' | 'prompts' | 'chatbook' | 'roleplay' | 'qualification_matrix' | 'objections_matrix' | 'topic_training' | 'bitrix' | 'reports' | 'integrations' | 'knowledge' | 'analytics' | 'winloss' | 'calendar' | 'notifications' | 'automations' | 'usage' | 'editor' | 'team' | 'settings' | 'commercial_intelligence';

/** Metadados (rótulo + ícone) de cada módulo navegável — fonte única usada pelo topbar e pelo Command Palette. */
export const TAB_META: Record<TabType, { label: string; icon: typeof Home }> = {
    dashboard: { label: 'Painel Central', icon: Home },
    commercial_intelligence: { label: 'Comercial Inteligente', icon: LineChart },
    prospect: { label: 'Prospecção', icon: Search },
    crm: { label: 'Pipeline CRM', icon: LayoutTemplate },
    crm360: { label: 'Cockpit CRM', icon: Gauge },
    contacts: { label: 'Decisores', icon: Users },
    companies: { label: 'Empresas', icon: Building2 },
    activities: { label: 'Agenda', icon: Activity },
    roleplay: { label: 'Roleplay', icon: PhoneCall },
    qualification_matrix: { label: 'Matriz de Qualificação', icon: Target },
    objections_matrix: { label: 'Matriz de Objeções', icon: Shield },
    intelligence: { label: 'Hub de IA', icon: Zap },
    'market-intelligence': { label: 'Market Intelligence', icon: LineChart },
    topic_training: { label: 'Academy', icon: BookOpen },
    bitrix: { label: 'Guia Bitrix24', icon: Layers },
    reports: { label: 'Relatórios IA', icon: FileBarChart },
    enrich: { label: 'Enriquecer', icon: Sparkles },
    chatbook: { label: 'Chatbook', icon: MessageSquare },
    prompts: { label: 'Commercial OS', icon: Wand2 },
    integrations: { label: 'Integrações', icon: Globe },
    knowledge: { label: 'Base de Conhecimento', icon: Database },
    analytics: { label: 'Analytics', icon: BarChart3 },
    winloss: { label: 'Win/Loss', icon: Target },
    calendar: { label: 'Calendário', icon: CalendarDays },
    notifications: { label: 'Notificações', icon: Bell },
    automations: { label: 'Automações', icon: Cpu },
    usage: { label: 'Consumo de IA', icon: Wallet },
    editor: { label: 'Editor de Documentos', icon: FileText },
    team: { label: 'Equipe', icon: UserCog },
    settings: { label: 'Configurações', icon: SettingsIcon },
};
