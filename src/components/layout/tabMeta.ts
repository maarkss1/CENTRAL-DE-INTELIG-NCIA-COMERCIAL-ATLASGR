import {
  Home,
  Search,
  LayoutTemplate,
  Users,
  Building2,
  Activity,
  BookOpen,
  Layers,
  FileBarChart,
  Zap,
  MessageSquare,
  Globe,
  Bell,
  BarChart3,
  CalendarDays,
  Cpu,
  Wallet,
  FileText,
  Database,
  PhoneCall,
  Target,
  Shield,
  UserCog,
  Settings as SettingsIcon,
  LineChart,
  Gauge,
  Repeat,
  FileSignature,
  Headset,
  Bot,
  ClipboardCheck,
  Share2,
  GraduationCap,
  PieChart,
  Mic,
} from 'lucide-react';

/**
 * Identificador de cada módulo navegável — fonte única usada pela Sidebar, Topbar e Command
 * Palette.
 *
 * Nota: `enrich` e `prompts` existiram aqui até a Onda 10 sem nenhuma `<Route>` correspondente em
 * `App.tsx`, nem entrada na Sidebar (`Sidebar.tsx`) nem no Command Palette (`MODULE_ORDER` em
 * `CommandPalette.tsx`) — eram destinos "fantasma", alcançáveis só via `navigationBus` (comando de
 * voz/deep link), que caíam silenciosamente no catch-all `/app`. Removidos por não corresponderem
 * a nenhuma tela real hoje: enriquecimento de empresa já vive dentro de `prospect`
 * (`ProspectingHub`), e não há uma tela "Commercial OS"/Prompt Studio real e navegável — só um
 * componente órfão (`PromptStudio.tsx`) sem rota. Ver
 * `.agents/handoffs/onda-8/09-para-02-navigationbus-rotas-ausentes.md`.
 */
export type TabType =
  | 'dashboard'
  | 'companies'
  | 'contacts'
  | 'crm'
  | 'crm360'
  | 'mesa-tratamento'
  | 'activities'
  | 'cadence'
  | 'prospect'
  | 'intelligence'
  | 'market-intelligence'
  | 'propostas'
  | 'chatbook'
  | 'roleplay'
  | 'qualification_matrix'
  | 'objections_matrix'
  | 'topic_training'
  | 'bitrix'
  | 'reports'
  | 'integrations'
  | 'knowledge'
  | 'analytics'
  | 'winloss'
  | 'calendar'
  | 'notifications'
  | 'automations'
  | 'usage'
  | 'editor'
  | 'team'
  | 'settings'
  | 'sdr-diagnostic-joao'
  | 'commercial_intelligence'
  | 'copiloto_ia'
  | 'social-selling'
  | 'treinamento-atlasgr'
  | 'proposta-comercial'
  | 'hub-inteligencia-marketing';

/** Metadados (rótulo + ícone) de cada módulo navegável — fonte única usada pelo topbar e pelo Command Palette. */
export const TAB_META: Record<TabType, { label: string; icon: typeof Home }> = {
  dashboard: { label: 'Painel Central', icon: Home },
  commercial_intelligence: { label: 'Comercial Inteligente', icon: LineChart },
  copiloto_ia: { label: 'Copiloto IA', icon: Mic },
  'sdr-diagnostic-joao': { label: 'Diagnóstico & Plano SDR', icon: ClipboardCheck },
  prospect: { label: 'Prospecção', icon: Search },
  crm: { label: 'Pipeline CRM', icon: LayoutTemplate },
  crm360: { label: 'Cockpit CRM', icon: Gauge },
  'mesa-tratamento': { label: 'Mesa de Tratamento', icon: Headset },
  propostas: { label: 'Propostas', icon: FileSignature },
  contacts: { label: 'Decisores', icon: Users },
  companies: { label: 'Empresas', icon: Building2 },
  activities: { label: 'Agenda', icon: Activity },
  cadence: { label: 'Cadência', icon: Repeat },
  roleplay: { label: 'Roleplay', icon: PhoneCall },
  qualification_matrix: { label: 'Matriz de Qualificação', icon: Target },
  objections_matrix: { label: 'Matriz de Objeções', icon: Shield },
  intelligence: { label: 'Hub de IA', icon: Zap },
  'market-intelligence': { label: 'LDR', icon: Bot },
  topic_training: { label: 'Academy', icon: BookOpen },
  bitrix: { label: '🎓 Guia Prático Bitrix24', icon: Layers },
  reports: { label: 'Relatórios IA', icon: FileBarChart },
  chatbook: { label: 'Chatbook', icon: MessageSquare },
  integrations: { label: '⚙️ Integrações', icon: Globe },
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
  'social-selling': { label: 'Social Selling', icon: Share2 },
  'treinamento-atlasgr': { label: 'Treinamento AtlasGR', icon: GraduationCap },
  'proposta-comercial': { label: 'Proposta Comercial', icon: FileSignature },
  'hub-inteligencia-marketing': { label: 'Hub Inteligência & Mkt', icon: PieChart },
};
