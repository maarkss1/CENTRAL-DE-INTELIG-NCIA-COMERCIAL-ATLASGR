import { createHash } from 'node:crypto';
import { cacheConnection, redisConfigured } from '../../lib/queue/redis.js';
import { logger } from '../../lib/logger.js';

/**
 * Dedupe de entrega de webhook (THREAT_MODEL.md, seção 3 — Replay Attack, gap "não mitigado").
 *
 * O HMAC (birth-voice/3cx) e a comparação de segredo em tempo constante (voice-result/bitrix) já
 * impedem *forjar* uma entrega — provam quem enviou. Nenhum dos dois impede que uma entrega
 * legítima, capturada em trânsito ou nos logs de um proxy, seja reenviada depois por um atacante:
 * a assinatura/segredo continuam válidos porque o corpo não mudou.
 *
 * Este guard fecha essa lacuna sem exigir um header de timestamp/nonce que os provedores (Birth
 * Voices Hub, 3CX, Bland AI, Bitrix24) não enviam hoje — nenhum deles documenta um desses no
 * payload, então um "rejeitar fora da janela" real dependeria de inventar um contrato que essas
 * integrações não seguem. Em vez disso, o fingerprint É o nonce: um hash determinístico do que
 * prova a entrega (assinatura HMAC já calculada, ou segredo+corpo) mais o identificador do evento
 * já extraído por cada handler. Duas entregas com o mesmo fingerprint só existem quando (a) é a
 * mesma entrega reenviada pelo provedor após uma falha nossa (5xx) — caso em que os handlers já
 * têm sua própria idempotência de negócio (marcador em Activity/Note) e reprocessar é seguro; ou
 * (b) é uma entrega capturada e reenviada por terceiro — caso em que este guard barra antes de
 * qualquer efeito colateral (WhatsApp automático, escrita no CRM).
 *
 * TTL de 30 minutos (mesma ordem de grandeza de `claimAutomationTrigger`, já validada neste
 * projeto): cobre o intervalo real de retry dos provedores sem reter estado indefinidamente. Uma
 * entrega capturada e reenviada depois da janela não é bloqueada por este guard — nesse ponto o
 * risco residual documentado em THREAT_MODEL.md continua existindo; fechar isso por completo
 * exigiria um contrato de timestamp que nenhum provedor aqui oferece.
 *
 * Fail-open quando o Redis está indisponível/não configurado: negar uma entrega legítima de
 * webhook (perder resultado de ligação, atualização de lead) é pior do que, raramente, deixar
 * passar uma entrega já processada — mesmo raciocínio de `automation-idempotency.service.ts`.
 */

const KEY_PREFIX = 'webhook:replay:';
export const WEBHOOK_REPLAY_TTL_SECONDS = 30 * 60;

export type WebhookReplayCheck = 'fresh' | 'replay' | 'unavailable';

/** Fingerprint determinístico — ver justificativa acima sobre por que isto faz o papel do nonce. */
export function webhookDeliveryFingerprint(...parts: Array<string | null | undefined>): string {
  return createHash('sha256')
    .update(parts.filter((part): part is string => Boolean(part)).join(':'))
    .digest('hex');
}

/**
 * Reivindica esta entrega uma única vez dentro da janela de TTL.
 * - `fresh`: primeira vez que este fingerprint é visto — segue para o processamento normal.
 * - `replay`: já visto antes na janela — o chamador deve responder 200 sem reprocessar (mesma
 *   resposta que o provedor recebeu da entrega original, evitando reentrega infinita).
 * - `unavailable`: Redis indisponível/não configurado — segue processando (fail-open).
 */
export async function claimWebhookDelivery(
  namespace: string,
  fingerprint: string,
  ttlSeconds: number = WEBHOOK_REPLAY_TTL_SECONDS,
): Promise<WebhookReplayCheck> {
  if (!redisConfigured) return 'unavailable';
  try {
    const result = await cacheConnection.set(
      `${KEY_PREFIX}${namespace}:${fingerprint}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK' ? 'fresh' : 'replay';
  } catch (err) {
    logger.warn(
      { err, namespace },
      'Redis indisponível para dedupe de entrega de webhook; processando sem proteção de replay.',
    );
    return 'unavailable';
  }
}
