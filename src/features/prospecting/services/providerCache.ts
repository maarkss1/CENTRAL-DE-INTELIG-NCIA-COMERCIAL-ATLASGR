// Gap de auditoria (05 — Prospecção): `enrichment.service.ts` já tem um cache de 24h em nível de
// Company inteira (`isEnrichmentFresh`/`ENRICHMENT_CACHE_TTL_HOURS`), mas nenhuma chamada
// INDIVIDUAL de decisor/pessoa (Apollo People Match/Search, Hunter Email Finder/Domain Search)
// tinha cache algum — duas buscas pelo mesmo domínio/pessoa no mesmo dia (ex: vendedor reabre a
// tela "Buscar Decisores" para o mesmo domínio, ou dois módulos diferentes pedem o mesmo lookup)
// batiam o provider pago duas vezes.
//
// Redis (`cacheConnection`, já exportado por src/lib/queue/redis.ts) é a opção preferida — sobrevive
// a restart do processo e é compartilhado entre todos os processos web, então o ganho de cache não
// depende de a segunda chamada cair no mesmo processo Node que atendeu a primeira. Quando Redis não
// está configurado (dev local sem REDIS_URL, ou instância caída), cai para uma LRU simples em
// memória por processo — pior (não compartilhada, não sobrevive a restart), mas ainda elimina o
// caso mais comum (mesmo processo, poucos minutos de intervalo) sem exigir Redis como dependência
// obrigatória para este ganho.
import { cacheConnection, redisConfigured } from '../../../lib/queue/redis.js';
import { logger } from '../../../lib/logger.js';

const CACHE_KEY_PREFIX = 'prospecting:provider-cache:v1:';

// TTL default: 1h. Escolhido (não os 24h já usados para Company inteira) porque este cache é POR
// CHAMADA INDIVIDUAL (um decisor, um domínio, uma combinação de critérios) — o ganho real que
// motiva este cache é a rajada de chamadas repetidas em MINUTOS (reabrir a mesma tela, dois módulos
// pedindo o mesmo lookup na mesma sessão de trabalho), não evitar reprocessar o mesmo dado dia
// inteiro. Um TTL de 24h aqui arriscaria servir um contato desatualizado (pessoa trocou de cargo/
// empresa) por bem mais tempo do que o cenário que motiva o cache. Configurável via
// PROSPECTING_PROVIDER_CACHE_TTL_SECONDS quando esse trade-off precisar mudar.
export const DEFAULT_PROVIDER_CACHE_TTL_SECONDS = 60 * 60; // 1h

function getConfiguredTtlSeconds(environment: NodeJS.ProcessEnv = process.env): number {
    const raw = environment.PROSPECTING_PROVIDER_CACHE_TTL_SECONDS;
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROVIDER_CACHE_TTL_SECONDS;
}

/**
 * Normaliza (provider, operação, parâmetros) numa chave estável e determinística: ordena as chaves
 * do objeto e faz trim/lowercase de valores string, então `{domain:"Foo.com "}` e
 * `{domain:"foo.com"}` (mesma busca real, escrita diferente) colidem na mesma entrada de cache.
 */
export function buildProviderCacheKey(
    provider: string,
    operation: string,
    params: Record<string, unknown>
): string {
    const normalized = Object.keys(params)
        .sort()
        .map((key) => {
            const value = params[key];
            const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : value;
            return `${key}=${JSON.stringify(normalizedValue ?? null)}`;
        })
        .join('&');
    return `${CACHE_KEY_PREFIX}${provider}:${operation}:${normalized}`;
}

// Fallback em memória — bounded (nunca cresce sem limite num processo de vida longa) e com
// eviction simples de "mais antigo inserido/lido" (ordem de iteração do Map, que o Map do JS
// preserva por inserção): não é uma LRU estrita por acesso, mas reordenar a chave a cada leitura
// (delete+set) já aproxima bastante o comportamento real de LRU sem precisar de uma lib nova.
const MEMORY_CACHE_MAX_ENTRIES = 500;
interface MemoryCacheEntry {
    value: unknown;
    expiresAtMs: number;
}
const memoryCache = new Map<string, MemoryCacheEntry>();

function memoryCacheGet<T>(key: string, now: number): T | undefined {
    const entry = memoryCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= now) {
        memoryCache.delete(key);
        return undefined;
    }
    // Move para o fim da ordem de iteração (aproxima LRU-por-acesso).
    memoryCache.delete(key);
    memoryCache.set(key, entry);
    return entry.value as T;
}

function memoryCacheSet<T>(key: string, value: T, ttlMs: number, now: number): void {
    if (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES && !memoryCache.has(key)) {
        const oldestKey = memoryCache.keys().next().value;
        if (oldestKey !== undefined) memoryCache.delete(oldestKey);
    }
    memoryCache.set(key, { value, expiresAtMs: now + ttlMs });
}

/** Só para testes: limpa o fallback em memória (evita vazamento de estado entre casos). */
export function resetProviderCacheForTests(): void {
    memoryCache.clear();
}

export interface ProviderCacheOptions {
    /** TTL em segundos. Default: DEFAULT_PROVIDER_CACHE_TTL_SECONDS (via env quando não informado). */
    ttlSeconds?: number;
}

export async function getCachedProviderResult<T>(key: string): Promise<T | undefined> {
    if (redisConfigured) {
        try {
            const raw = await cacheConnection.get(key);
            if (raw == null) return undefined;
            return JSON.parse(raw) as T;
        } catch (error) {
            // Redis flakiness nunca deve derrubar a chamada real ao provider — trata como cache
            // miss (mesma postura de outros usos de cacheConnection neste repo).
            logger.warn({ err: error, key }, 'providerCache: falha ao ler do Redis — tratando como cache miss');
            return undefined;
        }
    }
    return memoryCacheGet<T>(key, Date.now());
}

export async function setCachedProviderResult<T>(
    key: string,
    value: T,
    options: ProviderCacheOptions = {}
): Promise<void> {
    const ttlSeconds = options.ttlSeconds ?? getConfiguredTtlSeconds();
    if (redisConfigured) {
        try {
            await cacheConnection.set(key, JSON.stringify(value), 'EX', ttlSeconds);
            return;
        } catch (error) {
            logger.warn(
                { err: error, key },
                'providerCache: falha ao gravar no Redis — usando fallback em memória só para esta entrada'
            );
        }
    }
    memoryCacheSet(key, value, ttlSeconds * 1000, Date.now());
}

/**
 * Executa `fetcher` só quando não há resultado em cache válido para `key`; grava o resultado (a
 * menos que `shouldCache` devolva false — usado para não cachear respostas de erro/vazias, que
 * devem poder ser retentadas na próxima chamada) e devolve o valor (do cache ou recém-buscado).
 */
export async function withProviderCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: ProviderCacheOptions & { shouldCache?: (value: T) => boolean } = {}
): Promise<T> {
    const cached = await getCachedProviderResult<T>(key);
    if (cached !== undefined) return cached;

    const value = await fetcher();
    const shouldCache = options.shouldCache ?? (() => true);
    if (shouldCache(value)) {
        await setCachedProviderResult(key, value, options);
    }
    return value;
}
