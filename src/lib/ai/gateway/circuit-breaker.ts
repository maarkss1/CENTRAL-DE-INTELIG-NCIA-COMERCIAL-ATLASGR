/**
 * Circuit breaker por provedor de IA. Isolado de `retry.ts` de propósito: retry decide "essa
 * falha vale a pena tentar de novo, agora, dentro da mesma chamada"; este módulo decide "esse
 * provedor já falhou demais nos últimos segundos, nem tente mandar tráfego pra ele" — memória
 * entre chamadas, não dentro de uma chamada.
 */
import { logger } from '../../logger.js';
import { cacheConnection } from '../../queue/redis.js';
import { MAX_ATTEMPTS_PER_LEG, RETRY_BASE_DELAY_MS, withRetry } from './retry.js';

// Circuit breaker leve: depois de falhas consecutivas, um provedor fica "aberto" (pulado sem nova
// tentativa de rede) por um período de resfriamento, evitando pagar o timeout inteiro em cada
// chamada enquanto ele está sabidamente indisponível.
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

// ARCH-005: estado do circuit breaker em Redis (cacheConnection — conexão fail-fast, sem fila
// offline) em vez de só Map() local. Antes, cada instância só aprendia da própria experiência: com
// N instâncias atrás do load balancer, cada uma precisava acumular CIRCUIT_FAILURE_THRESHOLD falhas
// por conta própria antes de abrir o circuito, então o provedor recebia até N vezes mais tentativas
// inúteis do que o desenhado. Se o Redis em si estiver indisponível, cai pro Map() local em vez de
// desistir de proteger o provedor inteiramente — um circuit breaker que nunca abre durante uma
// indisponibilidade de Redis (justo quando a infra está com problema) não protegeria nada.
const CIRCUIT_KEY_PREFIX = 'ai-gateway:circuit';
const CIRCUIT_FAILURES_TTL_SECONDS = Math.ceil((CIRCUIT_COOLDOWN_MS / 1000) * 4);

interface LocalCircuitState {
  failures: number;
  openUntil: number;
}
const localCircuitFallback = new Map<string, LocalCircuitState>();

/** Só para testes: limpa o estado do circuit breaker (Redis e o fallback local) entre casos. */
export async function __resetCircuitBreakerForTests(): Promise<void> {
  localCircuitFallback.clear();
  try {
    const keys = await cacheConnection.keys(`${CIRCUIT_KEY_PREFIX}:*`);
    if (keys.length > 0) await cacheConnection.del(...keys);
  } catch {
    // Redis indisponível — só o fallback local importava mesmo, e já foi limpo acima.
  }
}

export async function isCircuitOpen(provider: string): Promise<boolean> {
  try {
    const open = await cacheConnection.exists(`${CIRCUIT_KEY_PREFIX}:${provider}:open`);
    return open === 1;
  } catch (err) {
    logger.warn(
      { err, provider },
      'Circuit breaker: Redis indisponível, usando estado local desta instância',
    );
    const state = localCircuitFallback.get(provider);
    return !!state && Date.now() < state.openUntil;
  }
}

export async function recordCircuitSuccess(provider: string): Promise<void> {
  localCircuitFallback.delete(provider);
  try {
    await cacheConnection.del(
      `${CIRCUIT_KEY_PREFIX}:${provider}:failures`,
      `${CIRCUIT_KEY_PREFIX}:${provider}:open`,
    );
  } catch (err) {
    logger.warn(
      { err, provider },
      'Circuit breaker: falha ao limpar estado no Redis (fallback local já limpo)',
    );
  }
}

export async function recordCircuitFailure(provider: string): Promise<void> {
  try {
    const failures = await cacheConnection.incr(`${CIRCUIT_KEY_PREFIX}:${provider}:failures`);
    await cacheConnection.expire(
      `${CIRCUIT_KEY_PREFIX}:${provider}:failures`,
      CIRCUIT_FAILURES_TTL_SECONDS,
    );
    if (failures >= CIRCUIT_FAILURE_THRESHOLD) {
      await cacheConnection.set(
        `${CIRCUIT_KEY_PREFIX}:${provider}:open`,
        '1',
        'PX',
        CIRCUIT_COOLDOWN_MS,
      );
    }
  } catch (err) {
    logger.warn(
      { err, provider },
      'Circuit breaker: Redis indisponível, contando falha só localmente',
    );
    const state = localCircuitFallback.get(provider) ?? { failures: 0, openUntil: 0 };
    state.failures += 1;
    if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) {
      state.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    }
    localCircuitFallback.set(provider, state);
  }
}

/**
 * Combina o circuit breaker com `withRetry`: se o provedor já acumulou falhas consecutivas
 * recentes, nem tenta de novo (evita pagar o timeout inteiro em cada chamada enquanto ele está
 * sabidamente fora do ar) — só volta a tentar depois do resfriamento. Ponto único que todo
 * adapter de provedor (`providers/*.provider.ts`) usa para chamar a rede — nenhum deles implementa
 * retry/circuit breaker por conta própria.
 */
export async function callProvider<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  if (await isCircuitOpen(provider)) {
    throw new Error(
      `Provedor "${provider}" temporariamente desativado após falhas recentes (nova tentativa em breve).`,
    );
  }
  try {
    const result = await withRetry(fn, MAX_ATTEMPTS_PER_LEG - 1, RETRY_BASE_DELAY_MS);
    await recordCircuitSuccess(provider);
    return result;
  } catch (error) {
    await recordCircuitFailure(provider);
    throw error;
  }
}
