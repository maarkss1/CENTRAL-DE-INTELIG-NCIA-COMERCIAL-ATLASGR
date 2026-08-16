import type { TabType } from '../components/layout/tabMeta';

// Contrato de navegação entre ferramentas que disparam navegação fora do fluxo normal de clique
// (hoje: comando de voz — ver VoiceCommandWidget.tsx). Existe porque esse widget é montado em
// MainLayout, irmão da tela ativa (não descendente dela), então não tem acesso direto a nenhum
// estado de navegação local.
//
// Bloqueador #7 do AGENTS.md ("Comando de voz que afirma navegar sem realizar navegação"): a
// versão anterior deste arquivo despachava eventos para um Set de listeners que NUNCA tinha
// nenhum inscrito de verdade (nada no app chamava `subscribe`) — todo comando de voz reportava
// sucesso incondicionalmente, sem que nenhuma navegação real acontecesse. `TabType`
// (components/layout/tabMeta.ts) já é a fonte única de "destination id canônico" usada por
// Sidebar/Topbar/Command Palette — reaproveitada aqui em vez de duplicar uma lista à parte
// (`NavigableTool` antigo só cobria 6 dos 26 destinos reais). A navegação real do app é 100%
// react-router (ver App.tsx) — este módulo não é um componente React, então não pode chamar
// `useNavigate()` diretamente; em vez disso, `registerNavigator` recebe a função real de
// navegação de um único ponto de montagem dentro do Router (ver useNavigationBusBridge.ts,
// chamado por MainLayout).

type Navigator = (tab: TabType) => void;

let activeNavigator: Navigator | null = null;

export const navigationBus = {
    /**
     * Registra a função de navegação real, chamada uma única vez perto da raiz do router
     * (useNavigationBusBridge). Chamar com `null` no cleanup do efeito evita navegar depois que
     * o layout desmontou.
     */
    registerNavigator(fn: Navigator | null) {
        activeNavigator = fn;
    },

    /**
     * Pede navegação real para `tab`. Só retorna `true` quando a navegação foi de fato disparada
     * — nunca reporta sucesso sem confirmar. `false` cobre os dois jeitos de falhar: destino
     * desconhecido, ou nenhum navegador ainda registrado (app ainda não montou o Router).
     */
    requestNavigation(tab: string): boolean {
        if (!isKnownTab(tab) || !activeNavigator) return false;
        activeNavigator(tab);
        return true;
    },
};

function isKnownTab(tab: string): tab is TabType {
    return Object.prototype.hasOwnProperty.call(TAB_ROUTE_SET, tab);
}

// Conjunto derivado de TabType só para a checagem de posse acima ser O(1) sem importar TAB_META
// inteiro (que carrega ícones) neste módulo — mantido em sincronia manualmente com o union type,
// já que TypeScript não expõe os literais de um type alias em runtime.
const TAB_ROUTE_SET: Record<TabType, true> = {
    dashboard: true, companies: true, contacts: true, crm: true, activities: true, prospect: true,
    enrich: true, intelligence: true, 'market-intelligence': true, prompts: true, chatbook: true, roleplay: true,
    qualification_matrix: true, objections_matrix: true, topic_training: true, bitrix: true,
    reports: true, integrations: true, knowledge: true, analytics: true, winloss: true, calendar: true,
    notifications: true, automations: true, usage: true, editor: true, team: true, settings: true,
    commercial_intelligence: true, crm360: true, propostas: true, 'mesa-tratamento': true,
};
