// Service worker (Manifest V3) — só faz roteamento local entre content script <-> side panel.
// Nunca chama o backend nem guarda credencial: quem fala com a API é sempre o side panel
// (src/api.js), e quem fala com o Bitrix24 é sempre o backend da Central (nunca esta extensão).

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Atlas Copiloto] extensão instalada');
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message?.type === 'ATLAS_MEET_CONTEXT' && tabId != null) {
    chrome.storage.session.set({ [`meetContext:${tabId}`]: message.payload });
    sendResponse({ ok: true });
    return true;
  }

  // Repassado pelo side panel (que não tem `sender.tab`, por isso o tabId vem no payload) para o
  // content script da própria aba do Meet mostrar/esconder o indicador persistente de captura —
  // AGENT_04/AGENT_05 do pacote exigem indicador visível na própria página, não só no side panel
  // (que o usuário pode fechar sem perceber que a captura continua "ativa" no backend).
  if (message?.type === 'ATLAS_SET_CAPTURE_STATE' && message.tabId != null) {
    chrome.tabs
      .sendMessage(message.tabId, { type: 'ATLAS_CAPTURE_STATE', capturing: message.capturing })
      .catch(() => {
        // aba pode ter sido fechada/navegado para outro lugar — sem conteúdo pra avisar, ignora.
      });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
