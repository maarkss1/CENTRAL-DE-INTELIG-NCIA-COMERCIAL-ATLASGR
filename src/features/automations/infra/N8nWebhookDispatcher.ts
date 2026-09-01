import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';

/**
 * Disparo genérico de webhook de saída para o n8n (OS-4, docker-compose.services.yml) — mesmo
 * raciocínio de "capacidade sem gatilho de negócio" do cliente Qdrant em src/lib/qdrant/index.ts:
 * decidir QUAL evento do sistema de automações deve disparar QUAL workflow n8n é decisão de
 * produto ainda não tomada, não escopo desta integração de infraestrutura. Nenhum caller existe
 * hoje — isto fica disponível para quando essa decisão for tomada.
 *
 * Segue o padrão de "nunca lança, sempre degrada" já usado em src/lib/search/index.ts: uma falha
 * ao notificar o n8n não pode derrubar o fluxo de automação que a originou.
 */

const DISPATCH_TIMEOUT_MS = 5_000;

export interface N8nDispatchResult {
  dispatched: boolean;
  reason?: 'disabled' | 'not-configured' | 'request-failed';
}

/**
 * POSTa `payload` como JSON em `${N8N_WEBHOOK_URL}/webhook/${event}` — a convenção padrão de URL
 * de um nó "Webhook" do n8n em modo produção. Não injeta autenticação: um nó Webhook do n8n pode
 * exigir header/basic auth próprios, configuráveis do lado de dentro do workflow — fora do escopo
 * deste helper genérico.
 */
export async function dispatchN8nWebhook(
  event: string,
  payload: Record<string, unknown>,
): Promise<N8nDispatchResult> {
  if (!env.ENABLE_N8N_WEBHOOKS) return { dispatched: false, reason: 'disabled' };
  if (!env.N8N_WEBHOOK_URL) return { dispatched: false, reason: 'not-configured' };

  const url = `${env.N8N_WEBHOOK_URL.replace(/\/+$/, '')}/webhook/${encodeURIComponent(event)}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn(
        { event, status: response.status },
        'n8n respondeu com erro ao receber o webhook de saída.',
      );
      return { dispatched: false, reason: 'request-failed' };
    }
    return { dispatched: true };
  } catch (err) {
    logger.warn({ err, event }, 'Falha ao disparar webhook de saída para o n8n.');
    return { dispatched: false, reason: 'request-failed' };
  }
}
