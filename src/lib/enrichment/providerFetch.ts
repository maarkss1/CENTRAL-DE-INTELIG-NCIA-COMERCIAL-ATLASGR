import { fetchWithTimeout, HttpTimeoutError } from '../http.js';
import { logger } from '../logger.js';

/**
 * `fetch` com retry para chamadas a provedores externos de prospecção/enriquecimento
 * (Apollo, Hunter.io, Google Places, BrasilAPI/Receita Federal etc.).
 *
 * Requisito da Onda 2 (mission do Agente 05): "Rate limit com backoff+jitter, distinguindo 4xx
 * definitivo de 429/5xx transitório." Antes deste módulo, cada service reimplementava (ou não)
 * sua própria lógica de retry — `enrichment/cnpjLookup.ts` retentava só em erro de rede/timeout e
 * em 5xx, tratando 429 (rate limit real) como definitivo; `apollo.service.ts`/`hunter.service.ts`/
 * `places.service.ts` não retentavam nada, então um único 429/5xx transitório derrubava a busca
 * inteira e o vendedor via "Apollo respondeu 429" como se fosse um erro definitivo.
 *
 * Contrato: nunca lança por causa de um status HTTP — devolve a `Response` (ok ou não) para o
 * chamador decidir, exatamente como os call sites já faziam com `fetchWithTimeout`. Só lança
 * quando todas as tentativas se esgotam por erro de rede/timeout (mesmo comportamento que já
 * existia antes, só que agora com backoff).
 */

export interface ProviderRetryOptions {
    /** Tentativas adicionais após a primeira (default: 2 → até 3 chamadas no total). */
    retries?: number;
    /** Timeout por tentativa, em ms (repassado a fetchWithTimeout). */
    timeoutMs?: number;
    /** Base do backoff exponencial, em ms (default: 300). */
    baseDelayMs?: number;
    /** Teto do backoff, em ms (default: 4000) — nunca deixa a espera crescer sem limite. */
    maxDelayMs?: number;
    /** Nome do provider, só para o log de retry (nunca inclui a API key). */
    providerName?: string;
    /** Override para testes — evita esperar de verdade no backoff. */
    sleep?: (ms: number) => Promise<void>;
}

/** Status HTTP que valem retry: 429 (rate limit, sempre transitório) e 5xx (erro do servidor upstream). */
export function isTransientStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status < 600);
}

/** Todo outro 4xx (400, 401, 403, 404, 422...) é definitivo — repetir a mesma chamada não muda o resultado. */
export function isDefinitiveClientError(status: number): boolean {
    return status >= 400 && status < 500 && status !== 429;
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backoff exponencial com "full jitter" (AWS Architecture Blog): delay = random(0, min(maxDelay,
 * base * 2^tentativa)). Evita que múltiplas chamadas concorrentes (ex: enriquecimento em lote)
 * re-tentem todas no mesmo instante e sincronizem uma nova rajada contra o provider já sobrecarregado.
 */
export function computeBackoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const capped = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    return Math.random() * capped;
}

/** Interpreta o header `Retry-After` (segundos ou data HTTP) quando o provider o envia num 429. */
function parseRetryAfterMs(header: string | null): number | null {
    if (!header) return null;
    const asSeconds = Number(header);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) return asSeconds * 1000;
    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) {
        const delta = asDate - Date.now();
        return delta > 0 ? delta : 0;
    }
    return null;
}

/**
 * Faz a chamada HTTP com retry+backoff+jitter, distinguindo falha transitória (429/5xx/rede/timeout)
 * de falha definitiva (4xx que não seja 429 — key inválida, payload inválido, não encontrado etc.).
 */
export async function fetchWithProviderRetry(
    input: string | URL | Request,
    init: RequestInit = {},
    options: ProviderRetryOptions = {}
): Promise<Response> {
    const {
        retries = 2,
        timeoutMs = 10_000,
        baseDelayMs = 300,
        maxDelayMs = 4_000,
        providerName = 'provider',
        sleep = defaultSleep,
    } = options;

    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetchWithTimeout(input, init, timeoutMs);

            if (res.ok || isDefinitiveClientError(res.status) || attempt === retries) {
                return res;
            }

            // res.status aqui é sempre transitório (429/5xx) e ainda restam tentativas.
            const retryAfterMs = res.status === 429 ? parseRetryAfterMs(res.headers.get('retry-after')) : null;
            const delay = retryAfterMs ?? computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
            logger.warn(
                { provider: providerName, status: res.status, attempt: attempt + 1, retries, delayMs: Math.round(delay) },
                `Resposta transitória (${res.status}) de ${providerName} — tentando novamente`
            );
            await sleep(delay);
            continue;
        } catch (error) {
            lastError = error;
            const isTimeout = error instanceof HttpTimeoutError;
            if (attempt === retries) throw error;

            const delay = computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
            logger.warn(
                { provider: providerName, attempt: attempt + 1, retries, delayMs: Math.round(delay), timeout: isTimeout },
                `Falha de rede/timeout ao chamar ${providerName} — tentando novamente`
            );
            await sleep(delay);
        }
    }

    // Inatingível na prática (o loop sempre retorna ou lança antes), mas satisfaz o compilador.
    throw lastError;
}
