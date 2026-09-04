// Service worker (Manifest V3) — roteia mensagens entre content script/side panel/documento
// offscreen, e é quem tem permissão pra abrir/fechar o documento offscreen e pedir o streamId de
// captura de aba (`chrome.tabCapture`). Nunca chama o backend nem guarda credencial: quem fala com
// a API (inclusive o upload do áudio) é sempre `src/api.js`, rodando no side panel ou no documento
// offscreen — e quem fala com o Bitrix24 é sempre o backend da Central, nunca esta extensão.

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen.html';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Atlas Copiloto] extensão instalada');
  injectContentScriptIntoOpenMeetTabs();
});

// `content_scripts` do manifest só roda em abas do Meet que CARREGAM depois da extensão ser
// instalada/recarregada — uma aba do Meet já aberta antes disso nunca recebe o content.js
// (comportamento padrão do Chrome, não bug de permissão) e o side panel fica preso em "Nenhuma
// reunião detectada" até o usuário dar F5 manualmente. Isso mordia toda instalação/reload durante
// desenvolvimento — injeta programaticamente nas abas do Meet já abertas para não depender disso.
async function injectContentScriptIntoOpenMeetTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content.js'] });
    } catch (err) {
      // Aba pode estar numa página interna do Chrome sem permissão de injeção, ou ter fechado
      // entre o query e a injeção — não é um erro que o usuário precise ver.
      console.warn('[Atlas Copiloto] falha ao injetar em aba já aberta', tab.id, err);
    }
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification:
      'Gravar o áudio da aba do Google Meet durante uma sessão de captura iniciada explicitamente pelo usuário, com consentimento já registrado no backend.',
  });
}

async function startRecording(tabId, conversationId) {
  await ensureOffscreenDocument();
  // `targetTabId` pede o áudio da aba do MEET (não da aba onde o side panel está focado) — o
  // side panel roda numa "aba" própria do Chrome, capturar sem especificar o alvo gravaria o
  // painel, não a reunião.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  return chrome.runtime.sendMessage({
    type: 'OFFSCREEN_START_RECORDING',
    streamId,
    conversationId,
  });
}

async function stopRecording() {
  const result = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP_RECORDING' });
  // Fecha o documento offscreen sempre, sucesso ou falha — nunca deixa um processo de gravação
  // fantasma vivo depois que o usuário pediu pra parar.
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
  return result;
}

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

  if (message?.type === 'ATLAS_START_RECORDING') {
    startRecording(message.tabId, message.conversationId)
      .then((result) => sendResponse(result || { ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (message?.type === 'ATLAS_STOP_RECORDING') {
    stopRecording()
      .then((result) => sendResponse(result || { ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});
