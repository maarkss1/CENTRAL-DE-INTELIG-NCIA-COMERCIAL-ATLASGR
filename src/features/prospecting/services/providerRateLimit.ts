// Gap de auditoria (05 — Prospecção): antes deste módulo só existia rate limit genérico de rota
// HTTP (`/api`, ver src/bootstrap/rateLimiters.ts) — nenhum limite dedicado por PROVIDER externo
// de prospecção. `fetchWithProviderRetry` (src/lib/enrichment/providerFetch.ts) já retenta 429/5xx
// com backoff+jitter, mas isso é REATIVO (só age depois que o provider já respondeu 429). Este
// módulo é PROATIVO: barra a chamada antes de sair, para não gastar uma tentativa/latência inteira
// só para descobrir que o provider já está no teto — e para não surpreender o provider com uma
// rajada que ele mesmo penaliza (alguns providers de fato reduzem cota temporariamente após rajadas
// repetidas de 429).
//
// Token bucket em memória, por processo, chaveado por provider ('apollo' | 'hunter'). Escolhido em
// vez de sliding window log por ser O(1) por checagem (sem precisar podar uma lista de timestamps)
// e por já ser o algoritmo mais comum para "N requisições por minuto" — o que a Apollo/Hunter
// documentam. Não é distribuído (cada processo Node tem seu próprio bucket) — aceitável aqui porque
// o teto real é definido pelo PLANO contratado do provider (por API key, não por processo), então
// múltiplos processos web sem coordenação ainda reduzem o risco de estourar o teto do provider
// comparado a nenhum limite; um limite 100% preciso exigiria um contador compartilhado (Redis,
// como o cache em providerCache.ts), o que pode ser considerado depois se o volume real justificar.

export type ProspectingRateLimitedProvider = 'apollo' | 'hunter';

interface TokenBucket {
    tokens: number;
    lastRefillMs: number;
}

const buckets = new Map<ProspectingRateLimitedProvider, TokenBucket>();

/**
 * Defaults conservadores, usados só quando a env var específica do provider não está setada (ou
 * está inválida). Nenhum dos dois providers publica um teto único universal por minuto (varia por
 * plano/endpoint) — estes números ficam abaixo do que planos básicos costumam suportar, para nunca
 * ser o motivo de um 429 real; ajuste via APOLLO_RATE_LIMIT_PER_MINUTE / HUNTER_RATE_LIMIT_PER_MINUTE
 * para o teto real contratado do tenant.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE: Record<ProspectingRateLimitedProvider, number> = {
    // Apollo: planos pagos básicos costumam suportar ~50-60 req/min por endpoint na prática
    // (não há um número único documentado publicamente para todos os planos/endpoints).
    apollo: 50,
    // Hunter.io: o teto real do plano é por cota MENSAL, não por minuto — este número é só uma
    // proteção contra rajada local, bem abaixo de qualquer teto de burst documentado.
    hunter: 30,
};

function envVarNameFor(provider: ProspectingRateLimitedProvider): string {
    return provider === 'apollo' ? 'APOLLO_RATE_LIMIT_PER_MINUTE' : 'HUNTER_RATE_LIMIT_PER_MINUTE';
}

/** Lê o limite configurado (env) para o provider, com fallback ao default documentado acima. */
export function getRateLimitPerMinute(
    provider: ProspectingRateLimitedProvider,
    environment: NodeJS.ProcessEnv = process.env
): number {
    const raw = environment[envVarNameFor(provider)];
    const parsed = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return DEFAULT_RATE_LIMIT_PER_MINUTE[provider];
}

export interface TokenBucketResult {
    allowed: boolean;
    /** Só preenchido quando `allowed` é false — quanto falta (ms) até haver um token disponível. */
    retryAfterMs: number;
}

/**
 * Núcleo puro e testável do token bucket: recebe `now` explicitamente (mesmo padrão de
 * `computeBackoffDelayMs`/`isEnrichmentFresh` já usados neste domínio) em vez de ler `Date.now()`
 * direto, para os testes não dependerem de fake timers reais.
 *
 * `limitPerMinute <= 0` ou não finito desativa o limite (sempre permite) — proteção contra uma env
 * var mal configurada derrubar 100% das chamadas a um provider.
 */
export function tryConsumeToken(
    bucket: TokenBucket | undefined,
    limitPerMinute: number,
    now: number
): { bucket: TokenBucket; result: TokenBucketResult } {
    if (!Number.isFinite(limitPerMinute) || limitPerMinute <= 0) {
        return { bucket: bucket ?? { tokens: 0, lastRefillMs: now }, result: { allowed: true, retryAfterMs: 0 } };
    }

    const capacity = limitPerMinute;
    const refillPerMs = limitPerMinute / 60_000;

    const current: TokenBucket = bucket ?? { tokens: capacity, lastRefillMs: now };
    const elapsedMs = Math.max(0, now - current.lastRefillMs);
    current.tokens = Math.min(capacity, current.tokens + elapsedMs * refillPerMs);
    current.lastRefillMs = now;

    if (current.tokens >= 1) {
        current.tokens -= 1;
        return { bucket: current, result: { allowed: true, retryAfterMs: 0 } };
    }

    const missingTokens = 1 - current.tokens;
    const retryAfterMs = Math.ceil(missingTokens / refillPerMs);
    return { bucket: current, result: { allowed: false, retryAfterMs } };
}

export interface ProviderRateLimitCheck {
    allowed: boolean;
    retryAfterMs: number;
    /** Mensagem pronta para devolver como `error` no mesmo formato que os services de
     * Apollo/Hunter já usam para qualquer outra falha de provider — nunca lança/derruba o
     * chamador, só sinaliza "não chame agora". */
    message?: string;
}

/**
 * Verifica (e consome, se permitido) uma vaga no bucket do `provider` antes de qualquer chamada de
 * rede real. Chame no início de toda função que dispara uma requisição faturável a Apollo/Hunter,
 * antes de `fetchWithProviderRetry` — nunca depois.
 */
export function checkProviderRateLimit(
    provider: ProspectingRateLimitedProvider,
    now: number = Date.now(),
    environment: NodeJS.ProcessEnv = process.env
): ProviderRateLimitCheck {
    const limitPerMinute = getRateLimitPerMinute(provider, environment);
    const existing = buckets.get(provider);
    const { bucket, result } = tryConsumeToken(existing, limitPerMinute, now);
    buckets.set(provider, bucket);

    if (result.allowed) return { allowed: true, retryAfterMs: 0 };

    const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    return {
        allowed: false,
        retryAfterMs: result.retryAfterMs,
        message: `Rate limit interno do provider ${provider} excedido (${limitPerMinute}/min) — tente novamente em ~${seconds}s.`,
    };
}

/** Só para testes: limpa todos os buckets em memória (evita vazamento de estado entre casos). */
export function resetProviderRateLimitersForTests(): void {
    buckets.clear();
}
