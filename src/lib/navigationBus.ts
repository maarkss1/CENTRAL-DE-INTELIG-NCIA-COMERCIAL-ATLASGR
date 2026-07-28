// Barramento de eventos minimalista para pedidos de navegação entre ferramentas — mesmo padrão
// de toast.ts. Existe porque o VoiceCommandWidget (montado em MainLayout, irmão da tela ativa,
// não descendente dela) navegava via react-router para rotas como "/app/crm" que nunca estiveram
// de fato conectadas: a navegação real de ferramentas vive inteiramente no estado local
// (`step`/`activeTool`) de SinglePageDashboard. O resultado prático era um comando de voz "abrir
// CRM" que só trocava a URL da barra de endereço e não mudava nada na tela.

export type NavigableTool = 'prospect' | 'crm' | 'intelligence' | 'companies' | 'contacts' | 'activities';

type Listener = (tool: NavigableTool) => void;

const listeners = new Set<Listener>();

export const navigationBus = {
    requestTool(tool: NavigableTool) {
        listeners.forEach((l) => l(tool));
    },
    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};
