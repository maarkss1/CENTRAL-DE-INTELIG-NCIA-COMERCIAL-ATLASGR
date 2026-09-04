// Cliente HTTP do Copiloto — fala SÓ com o backend da Central Atlas GR (/api/copiloto-ia/*).
// Nunca guarda webhook/token do Bitrix aqui (ver AGENTS.md do pacote): a extensão é cliente fino,
// autenticação é a sessão do navegador (cookie do Better Auth, `credentials: 'include'`) — o
// usuário precisa estar logado na Central Atlas GR na mesma janela/perfil do Chrome. Sem isso não
// existe nenhum outro segredo/token armazenado pela extensão.

const DEFAULT_API_BASE_URL = 'http://localhost:3005';
const STORAGE_KEY = 'atlasApiBaseUrl';

export async function getApiBaseUrl() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || DEFAULT_API_BASE_URL;
}

/**
 * Salva a URL base e solicita a permissão de host correspondente (Manifest V3 —
 * `optional_host_permissions`) na hora, nunca de antemão para um domínio desconhecido. Sem essa
 * permissão concedida, o `fetch` para um domínio de produção fora de `host_permissions` do
 * manifest seria bloqueado.
 */
export async function setApiBaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  const origin = `${url.origin}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error(
      `Permissão de acesso a ${url.origin} negada — não é possível chamar o backend sem ela.`,
    );
  }
  await chrome.storage.sync.set({ [STORAGE_KEY]: url.origin });
  return url.origin;
}

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const baseUrl = await getApiBaseUrl();
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new ApiError(
      `Não foi possível contatar ${baseUrl} — confira a URL do backend e se a Central Atlas GR está acessível.`,
      0,
    );
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // resposta sem corpo JSON (ex.: 204) — segue com body = null
  }

  if (res.status === 401) {
    throw new ApiError(
      'Sessão expirada ou ausente — abra a Central Atlas GR numa aba e faça login antes de usar o Copiloto.',
      401,
      body?.code,
    );
  }
  if (!res.ok) {
    throw new ApiError(body?.error || `Erro ${res.status} ao chamar ${path}.`, res.status, body?.code);
  }
  return body?.data;
}

export const copilotoApi = {
  lookupLead: (query) =>
    request(`/api/copiloto-ia/leads/lookup?q=${encodeURIComponent(query)}`),
  searchLeads: (query) =>
    request(`/api/copiloto-ia/leads/search?q=${encodeURIComponent(query)}`),
  createConversation: (payload) =>
    request('/api/copiloto-ia/conversations', { method: 'POST', body: JSON.stringify(payload) }),
  getConversation: (id) => request(`/api/copiloto-ia/conversations/${id}`),
  recordConsent: (id, payload) =>
    request(`/api/copiloto-ia/conversations/${id}/consent`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  startCapture: (id) => request(`/api/copiloto-ia/conversations/${id}/start`, { method: 'POST' }),
  stopCapture: (id) => request(`/api/copiloto-ia/conversations/${id}/stop`, { method: 'POST' }),
  cancelConversation: (id) => request(`/api/copiloto-ia/conversations/${id}/cancel`, { method: 'POST' }),
  requestAudioUploadUrl: (id, mimeType) =>
    request(`/api/copiloto-ia/conversations/${id}/audio/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ mimeType }),
    }),
  completeAudioUpload: (id, payload) =>
    request(`/api/copiloto-ia/conversations/${id}/audio/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export { ApiError };
