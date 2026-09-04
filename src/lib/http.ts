export class HttpTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`A requisição externa excedeu ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
  }
}

/**
 * Lançado por `fetchWithTimeout` quando `allowedHosts` é informado e o host resolvido da URL não
 * está na lista — ver comentário de `allowedHosts` abaixo para o que isso protege.
 */
export class DisallowedHostError extends Error {
  constructor(public readonly host: string) {
    super(`Host não permitido para esta chamada: ${host}`);
    this.name = 'DisallowedHostError';
  }
}

function resolveRequestHost(input: string | URL | Request): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw).hostname.toLowerCase();
}

/**
 * `fetchWithTimeout` é o cliente HTTP genérico para provedores externos de destino FIXO/hardcoded
 * no próprio código (Apollo, Hunter, GitHub, Google, YouTube, BrasilAPI, Nominatim, GDELT etc.) —
 * URL de usuário/tenant (webhook Bitrix24, PABX 3CX) nunca deve passar por aqui; esses usam
 * `safeFetch`/`assertSafeExternalUrl` (src/shared/security/urlGuard.ts), que valida contra IP
 * privado/reservado e faz pinning de DNS, algo que quebraria os provedores auto-hospedáveis
 * legítimos abaixo (Meilisearch/SearXNG/Voicebox rodam em endereço privado/loopback de propósito).
 *
 * `allowedHosts`, quando informado, é o único host (ou lista) para o qual esta chamada pode
 * resolver — a query string de vários desses provedores carrega texto de busca vindo de um
 * request do usuário (nome de empresa, domínio etc.), e sem essa checagem o CodeQL
 * (`js/request-forgery`) não tem como provar que esse texto nunca poderia mover o destino real da
 * chamada, mesmo quando o host de fato é sempre a constante hardcoded no arquivo de origem. Opcional
 * (e ausente por padrão) só para não quebrar chamadas internas/de teste que não têm um host fixo
 * conhecido de antemão.
 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = 10_000,
  allowedHosts?: readonly string[],
): Promise<Response> {
  if (allowedHosts) {
    const host = resolveRequestHost(input);
    if (!allowedHosts.some((allowed) => allowed.toLowerCase() === host)) {
      throw new DisallowedHostError(host);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;

  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (controller.signal.aborted) throw new HttpTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Aplica um timeout a qualquer Promise que não aceite AbortSignal (ex: chamadas de SDKs de
 * terceiros que fazem fetch internamente sem expor essa opção). Diferente de fetchWithTimeout,
 * isto não cancela a operação original — só para de esperar por ela, para o chamador poder tratar
 * como falha em vez de travar indefinidamente.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new HttpTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
