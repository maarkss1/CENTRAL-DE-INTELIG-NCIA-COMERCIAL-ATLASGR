import { createHash } from 'node:crypto';
import { cacheConnection, redisConfigured } from '../../lib/queue/redis.js';
import { logger } from '../../lib/logger.js';

/**
 * Dedupe de disparo de automação (Onda 7 — gap de idempotência).
 *
 * Problema real: o mesmo evento de gatilho pode chegar ao motor mais de uma vez — replay de evento,
 * corrida entre dois workers processando a mesma automação periódica quase ao mesmo tempo, ou um
 * `.catch` de disparo assíncrono (`fireAutomations` em `LeadController.ts`) sendo acionado por um
 * retry de camada mais alta. Sem proteção, a mesma ação de automação roda duas vezes para o mesmo
 * evento (segunda notificação, segunda atividade criada, segunda ligação de SDR de voz).
 *
 * Estratégia: `SET key value NX EX ttl` no Redis já usado por filas/cache (`cacheConnection` de
 * `src/lib/queue/redis.ts`) — mesmo primitivo de `distributedLock.ts`, mas semântica diferente: aqui
 * não há "release" (a marca deve sobreviver ao processo inteiro pela janela de TTL, não só durante a
 * execução), então isto NÃO é uma variante de `acquireDistributedLock` — é "já vi esse evento?", não
 * "estou processando agora?".
 *
 * Chave: hash determinístico de `automationId + organizationId + entity + entityId + trigger +
 * event.data` (`buildTriggerIdempotencyKey`), não um timestamp truncado. Um bucket de tempo teria
 * bordas arbitrárias (dois disparos genuinamente distintos, um a cada lado do limite do bucket, não
 * seriam deduplicados; um replay genuíno bem no limite do bucket poderia escapar). Hashear o
 * conteúdo do evento resolve isso com precisão: dois disparos com o mesmo `data` são, por definição,
 * o mesmo evento de negócio (mesmo `status`/`owner`/etc. capturados no mesmo instante), e dois
 * disparos legítimos e distintos (ex.: lead mudou de status duas vezes em minutos) sempre carregam
 * `data` diferente (o novo `status`), então nunca colidem.
 *
 * Curto prazo de propósito (TTL, não coluna nova em `Automation`/`AuditLog`): cobre o caso real de
 * replay/corrida (segundos a poucos minutos) sem precisar de schema novo — ver handoff em
 * `.agents/handoffs/onda-40/07-para-01-idempotencia-automacao.md` para o caso em que uma trilha
 * permanente vier a ser necessária.
 *
 * Fail-open quando o Redis está indisponível ou não configurado: negar a execução de uma automação
 * legítima porque o Redis caiu é pior do que, raramente, deixá-la rodar duas vezes — que já era o
 * comportamento antes desta mudança. `distributedLock.ts` é fail-closed porque protege uma ação que
 * não pode rodar concorrentemente (ex.: scanner) contra corrupção; aqui o pior caso de uma falha de
 * dedupe é apenas voltar ao comportamento pré-existente.
 */

const KEY_PREFIX = 'automation:trigger:';

/** Janela de deduplicação: cobre replay/corrida real sem reter estado indefinidamente. */
export const TRIGGER_IDEMPOTENCY_TTL_SECONDS = 30 * 60;

export type TriggerClaimResult = 'claimed' | 'duplicate' | 'unavailable';

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

export interface TriggerIdentity {
  automationId: string;
  organizationId: string;
  entity: string;
  entityId: string;
  trigger: string;
  data: Record<string, unknown>;
}

/** Hash determinístico da identidade do disparo — ver justificativa acima. */
export function buildTriggerIdempotencyKey(identity: TriggerIdentity): string {
  return createHash('sha256').update(stableStringify(identity)).digest('hex');
}

/**
 * Reivindica o direito de executar este disparo uma única vez dentro da janela de TTL.
 * - `claimed`: primeira vez que este disparo é visto — pode executar a ação normalmente.
 * - `duplicate`: já reivindicado antes dentro da janela — pular a ação (evento repetido).
 * - `unavailable`: Redis indisponível/não configurado — segue executando (fail-open, ver acima).
 */
export async function claimAutomationTrigger(
  key: string,
  ttlSeconds: number = TRIGGER_IDEMPOTENCY_TTL_SECONDS,
): Promise<TriggerClaimResult> {
  if (!redisConfigured) return 'unavailable';
  try {
    const result = await cacheConnection.set(`${KEY_PREFIX}${key}`, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? 'claimed' : 'duplicate';
  } catch (err) {
    logger.warn(
      { err, key },
      'Redis indisponível para dedupe de disparo de automação; executando sem proteção de idempotência.',
    );
    return 'unavailable';
  }
}
