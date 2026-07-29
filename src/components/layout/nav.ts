import type { ComponentType } from 'react';
import {
  IconHome,
  IconPipeline,
  IconBuilding,
  IconContacts,
  IconActivity,
  IconRadar,
  IconSparkle,
  IconBrain,
  IconBot, IconChat, IconClipboard, IconUserPlus, IconLandmark, IconWrench, IconDollar, IconCalendar, IconSliders, IconFlame, IconDatabase, IconCpu,
  type AtlasIconProps,
} from '../icons';

export type TabType = 'dashboard' | 'companies' | 'contacts' | 'crm' | 'activities' | 'prospect' | 'enrich' | 'intelligence' | 'prompts' | 'roleplay' | 'chatbot' | 'document-editor' | 'analytics' | 'automations' | 'team' | 'reports' | 'integrations' | 'billing' | 'calendar' | 'settings' | 'notifications' | 'knowledge';

export interface NavItem {
  tab: TabType;
  label: string;
  icon: ComponentType<AtlasIconProps>;
}

export const NAV_ITEMS: NavItem[] = [
  { tab: 'dashboard', label: 'Painel', icon: IconHome },
  { tab: 'crm', label: 'Pipeline', icon: IconPipeline },
  { tab: 'companies', label: 'Empresas', icon: IconBuilding },
  { tab: 'contacts', label: 'Contatos', icon: IconContacts },
  { tab: 'prospect', label: 'Prospectar', icon: IconRadar },
  { tab: 'enrich', label: 'Enriquecer', icon: IconSparkle },
  { tab: 'intelligence', label: 'Inteligência', icon: IconBrain },
  { tab: 'prompts', label: 'Commercial OS', icon: IconSliders },
  { tab: 'activities', label: 'Atividades', icon: IconActivity },

  { tab: 'roleplay', label: 'Roleplay', icon: IconBot },
  { tab: 'chatbot', label: 'Chatbot', icon: IconChat },
  { tab: 'document-editor', label: 'Documentos', icon: IconClipboard },
  { tab: 'analytics', label: 'Analytics', icon: IconActivity },
  { tab: 'automations', label: 'Automações', icon: IconCpu },
  { tab: 'team', label: 'Equipe', icon: IconUserPlus },
  { tab: 'reports', label: 'Relatórios', icon: IconLandmark },
  { tab: 'integrations', label: 'Integrações', icon: IconWrench },
  { tab: 'billing', label: 'Faturamento', icon: IconDollar },
  { tab: 'calendar', label: 'Calendário', icon: IconCalendar },
  { tab: 'settings', label: 'Configurações', icon: IconSliders },
  { tab: 'knowledge', label: 'Academy & Fun', icon: IconFlame },

];
