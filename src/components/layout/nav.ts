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
  type AtlasIconProps,
} from '../icons';

export type TabType = 'dashboard' | 'companies' | 'contacts' | 'crm' | 'activities' | 'prospect' | 'enrich' | 'intelligence';

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
  { tab: 'activities', label: 'Atividades', icon: IconActivity },
];
