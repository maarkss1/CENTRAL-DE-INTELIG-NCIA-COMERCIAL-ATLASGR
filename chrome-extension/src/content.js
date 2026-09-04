// Content script do Google Meet — só lê o que já está publicamente visível na página (URL, título)
// e mostra um indicador visual próprio. Não lê participantes/chat/transcrição da página (AGENT_05:
// "não depender de seletores frágeis para obter conteúdo essencial") e não inicia nada sozinho —
// toda ação de captura/consentimento é decidida pelo usuário no side panel.

function getMeetingCode() {
  // meet.google.com/xxx-yyyy-zzz — o código já é o identificador estável da reunião, usado como
  // `externalMeetingId` para o backend não criar duas conversas para a mesma reunião ao reabrir a
  // aba/reconectar (ver CopilotoConversation.externalMeetingId).
  const match = location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return match ? match[1] : null;
}

function getMeetContext() {
  return {
    url: location.href,
    title: document.title,
    meetingCode: getMeetingCode(),
    detectedAt: new Date().toISOString(),
    source: 'google_meet',
  };
}

// Depois que a extensão é recarregada/atualizada (comum em desenvolvimento — `chrome://extensions`
// → recarregar), qualquer aba do Meet que já estava aberta fica com uma cópia ANTIGA deste script,
// cujo `chrome.runtime` foi invalidado — `sendMessage` nesse estado lança SÍNCRONO (antes de
// devolver a Promise), então só `.catch()` no retorno não pega. `contextInvalidated` para de
// tentar de vez (e desliga o observer) assim que confirma isso, em vez de martelar um erro não
// tratado a cada mutação do DOM (o Meet muda o DOM o tempo inteiro) até a aba ser recarregada.
let contextInvalidated = false;

function publishContext() {
  if (contextInvalidated) return;
  try {
    chrome.runtime.sendMessage({ type: 'ATLAS_MEET_CONTEXT', payload: getMeetContext() }).catch(() => {});
  } catch {
    contextInvalidated = true;
    observer.disconnect();
  }
}

// O título/URL do Meet mudam depois que a reunião conecta (ex.: título só aparece após entrar na
// sala) — reobserva o DOM em vez de publicar só uma vez no carregamento da página.
const observer = new MutationObserver(() => publishContext());
observer.observe(document.documentElement, { subtree: true, childList: true });
publishContext();

// ─── Indicador persistente de captura ──────────────────────────────────────
// AGENT_04/PROMPT_EXTENSAO_CHROME exigem indicador visível na própria página enquanto uma sessão
// de captura está ativa — não só um estado escondido no side panel, que o usuário pode fechar sem
// perceber que a sessão continua aberta no backend.
let badgeEl = null;

function ensureBadge() {
  if (badgeEl) return badgeEl;
  badgeEl = document.createElement('div');
  badgeEl.textContent = '● Copiloto Atlas GR — sessão de captura ativa';
  Object.assign(badgeEl.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    background: '#dc2626',
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    padding: '6px 14px',
    borderRadius: '999px',
    boxShadow: '0 4px 14px rgba(0,0,0,.35)',
    pointerEvents: 'none',
  });
  document.documentElement.appendChild(badgeEl);
  return badgeEl;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'ATLAS_CAPTURE_STATE') return;
  if (message.capturing) {
    ensureBadge().style.display = 'block';
  } else if (badgeEl) {
    badgeEl.style.display = 'none';
  }
});

console.log('[Atlas Copiloto] Google Meet detectado');
