import type { TabType } from '../components/layout/tabMeta';

// Contrato de navegação entre ferramentas que disparam navegação fora do fluxo normal de clique
// (hoje: comando de voz — ver VoiceCommandWidget.tsx). Existe porque esse widget é montado em
// MainLayout, irmão da tela ativa (não descendente dela), então não tem acesso direto a nenhum
// estado de navegação local.
type Navigator = (tab: TabType) => void;

let activeNavigator: Navigator | null = null;

export const navigationBus = {
    registerNavigator(fn: Navigator | null) {
        activeNavigator = fn;
    },

    requestNavigation(tab: string): boolean {
        if (!isKnownTab(tab) || !activeNavigator) return false;
        activeNavigator(tab);
        return true;
    },
};

function isKnownTab(tab: string): tab is TabType {
    return Object.prototype.hasOwnProperty.call(TAB_ROUTE_SET, tab);
}

const TAB_ROUTE_SET: Record<TabType, true> = {
    dashboard: true, companies: true, contacts: true, crm: true, activities: true, prospect: true,
    enrich: true, intelligence: true, prompts: true, chatbook: true, roleplay: true,
    qualification_matrix: true, objections_matrix: true, topic_training: true, bitrix: true,
    reports: true, integrations: true, knowledge: true, analytics: true, winloss: true, calendar: true,
    notifications: true, automations: true, usage: true, editor: true, team: true, settings: true,
    commercial_intelligence: true, market_intelligence: true,
};
