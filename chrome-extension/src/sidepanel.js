import { copilotoApi, getApiBaseUrl, setApiBaseUrl, ApiError } from './api.js';

const statusEl = document.getElementById('status');
const errorBannerEl = document.getElementById('errorBanner');
const meetTitleEl = document.getElementById('meetTitle');
const meetUrlEl = document.getElementById('meetUrl');
const leadIdEl = document.getElementById('leadId');
const linkLeadEl = document.getElementById('linkLead');
const consentCardEl = document.getElementById('consentCard');
const consentEl = document.getElementById('consent');
const registerConsentEl = document.getElementById('registerConsent');
const captureCardEl = document.getElementById('captureCard');
const toggleCaptureEl = document.getElementById('toggleCapture');
const apiBaseUrlEl = document.getElementById('apiBaseUrl');
const saveApiBaseUrlEl = document.getElementById('saveApiBaseUrl');
const apiBaseUrlHintEl = document.getElementById('apiBaseUrlHint');

/** @type {number|null} */
let activeTabId = null;
let meetContext = null;
/** Estado local espelhando `CopilotoConversation` — sempre re-sincronizado a partir da resposta
 * do backend após cada ação, nunca inferido/adivinhado no cliente. */
let conversation = null;

function showError(message) {
  errorBannerEl.textContent = message;
  errorBannerEl.hidden = false;
}

function clearError() {
  errorBannerEl.hidden = true;
  errorBannerEl.textContent = '';
}

async function withErrorHandling(fn) {
  clearError();
  try {
    await fn();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : String(err?.message || err));
  }
}

async function conversationStorageKey() {
  return `conversation:${activeTabId}`;
}

async function loadConversationForTab() {
  if (activeTabId == null) return;
  const key = await conversationStorageKey();
  const stored = await chrome.storage.session.get(key);
  conversation = stored[key] || null;
}

async function saveConversationForTab() {
  if (activeTabId == null) return;
  const key = await conversationStorageKey();
  if (conversation) {
    await chrome.storage.session.set({ [key]: conversation });
  } else {
    await chrome.storage.session.remove(key);
  }
}

function notifyCaptureState(capturing) {
  if (activeTabId == null) return;
  chrome.runtime.sendMessage({ type: 'ATLAS_SET_CAPTURE_STATE', tabId: activeTabId, capturing }).catch(() => {});
}

function render() {
  // Status
  statusEl.className = 'pill';
  if (!meetContext) {
    statusEl.textContent = 'Aguardando';
  } else if (!conversation) {
    statusEl.textContent = 'Meet detectado';
  } else if (conversation.status === 'CAPTURING') {
    statusEl.textContent = 'Capturando';
    statusEl.classList.add('capturing');
  } else {
    statusEl.textContent = conversation.status;
    if (conversation.consentStatus === 'GRANTED') statusEl.classList.add('granted');
  }

  // Meet card
  if (meetContext) {
    meetTitleEl.textContent = meetContext.title || 'Google Meet';
    meetUrlEl.textContent = meetContext.meetingCode
      ? `Código da reunião: ${meetContext.meetingCode}`
      : meetContext.url || '';
  } else {
    meetTitleEl.textContent = 'Nenhuma reunião detectada. Abra uma chamada em meet.google.com.';
    meetUrlEl.textContent = '';
  }

  // CRM/link card
  linkLeadEl.disabled = !meetContext || !!conversation;
  linkLeadEl.textContent = conversation ? 'Reunião já vinculada' : 'Vincular reunião a este Lead';
  leadIdEl.disabled = !!conversation;

  // Consent card
  const hasConversation = !!conversation;
  consentCardEl.hidden = !hasConversation;
  if (hasConversation) {
    const granted = conversation.consentStatus === 'GRANTED';
    consentEl.checked = granted;
    consentEl.disabled = granted;
    registerConsentEl.disabled = granted || !consentEl.checked;
    registerConsentEl.textContent = granted ? 'Consentimento registrado' : 'Registrar consentimento';
  }

  // Capture card
  captureCardEl.hidden = !hasConversation;
  if (hasConversation) {
    const canStart = conversation.status === 'SCHEDULED' && conversation.consentStatus === 'GRANTED';
    const isCapturing = conversation.status === 'CAPTURING';
    toggleCaptureEl.disabled = !(canStart || isCapturing);
    toggleCaptureEl.textContent = isCapturing ? 'Parar sessão de captura' : 'Iniciar sessão de captura';
    toggleCaptureEl.className = isCapturing ? 'danger' : '';
  }
}

async function refreshMeetContext() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const tabId = tab?.id ?? null;

  if (tabId !== activeTabId) {
    activeTabId = tabId;
    await loadConversationForTab();
  }

  if (activeTabId == null || !tab.url?.startsWith('https://meet.google.com/')) {
    meetContext = null;
    render();
    return;
  }

  const key = `meetContext:${activeTabId}`;
  const stored = await chrome.storage.session.get(key);
  meetContext = stored[key] || null;
  render();
}

linkLeadEl.addEventListener('click', () =>
  withErrorHandling(async () => {
    const leadId = leadIdEl.value.trim();
    if (!leadId) throw new Error('Informe o id do Lead antes de vincular.');
    if (!meetContext) throw new Error('Nenhuma reunião do Meet detectada nesta aba.');

    const created = await copilotoApi.createConversation({
      source: 'MEET',
      leadId,
      title: meetContext.title,
      externalMeetingId: meetContext.meetingCode || undefined,
    });
    conversation = {
      id: created.id,
      status: created.status,
      consentStatus: created.consentStatus,
    };
    await saveConversationForTab();
    render();
  }),
);

consentEl.addEventListener('change', () => {
  registerConsentEl.disabled = !consentEl.checked;
});

registerConsentEl.addEventListener('click', () =>
  withErrorHandling(async () => {
    if (!conversation) throw new Error('Vincule a reunião a um Lead antes de registrar consentimento.');
    await copilotoApi.recordConsent(conversation.id, {
      method: 'meet_banner',
      textVersion: 'v1',
      granted: true,
    });
    conversation.consentStatus = 'GRANTED';
    await saveConversationForTab();
    render();
  }),
);

toggleCaptureEl.addEventListener('click', () =>
  withErrorHandling(async () => {
    if (!conversation) return;
    if (conversation.status === 'CAPTURING') {
      const updated = await copilotoApi.stopCapture(conversation.id);
      conversation.status = updated.status;
      notifyCaptureState(false);
    } else {
      const updated = await copilotoApi.startCapture(conversation.id);
      conversation.status = updated.status;
      notifyCaptureState(true);
    }
    await saveConversationForTab();
    render();
  }),
);

saveApiBaseUrlEl.addEventListener('click', () =>
  withErrorHandling(async () => {
    const origin = await setApiBaseUrl(apiBaseUrlEl.value.trim());
    apiBaseUrlHintEl.textContent = `Salvo: ${origin}`;
  }),
);

async function init() {
  apiBaseUrlEl.value = await getApiBaseUrl();
  await refreshMeetContext();
}

init();
setInterval(refreshMeetContext, 1500);
