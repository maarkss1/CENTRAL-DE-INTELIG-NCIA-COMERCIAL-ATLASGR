import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificação de assinatura do Chatwoot — lógica pura, sem env/rede, mesmo raciocínio de
 * separação de birthVoice.helpers.ts (a verificação é a parte crítica de segurança e precisa ser
 * testável isoladamente).
 *
 * Esquema documentado pelo Chatwoot: cada entrega carrega os headers `X-Chatwoot-Signature`
 * (`sha256=` + HMAC-SHA256 hex) e `X-Chatwoot-Timestamp` (epoch em segundos), e a assinatura é
 * calculada sobre `"{timestamp}.{corpo cru}"` — não só o corpo, diferente do esquema usado pelo
 * Birth Voices Hub/3CX neste projeto.
 */

const SIGNATURE_PREFIX = 'sha256=';

/** Janela de tolerância para o timestamp assinado — mesma ordem de grandeza usada em outros
 * lugares deste projeto para "recente o bastante para confiar" (ver DEFAULT_MAX_SKEW abaixo). */
const DEFAULT_MAX_SKEW_SECONDS = 5 * 60;

export interface ChatwootSignatureInput {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  secret: string;
  /** Injetável só para teste determinístico — em produção é sempre `Date.now()`. */
  nowMs?: number;
  maxSkewSeconds?: number;
}

/**
 * Confere a assinatura HMAC do Chatwoot sobre `"{timestamp}.{corpo cru}"` e rejeita timestamps
 * fora da janela de tolerância — diferente dos outros webhooks deste projeto (Birth Voices/3CX),
 * o Chatwoot realmente envia um timestamp assinado, então dá para checar frescor aqui em vez de
 * confiar só no replay guard genérico (ver webhookReplayGuard.ts).
 */
export function isValidChatwootSignature({
  rawBody,
  signatureHeader,
  timestampHeader,
  secret,
  nowMs = Date.now(),
  maxSkewSeconds = DEFAULT_MAX_SKEW_SECONDS,
}: ChatwootSignatureInput): boolean {
  if (!signatureHeader || !timestampHeader) return false;
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  const skewSeconds = Math.abs(nowMs / 1000 - timestamp);
  if (skewSeconds > maxSkewSeconds) return false;

  const signedPayload = `${timestampHeader}.${rawBody.toString('utf8')}`;
  const expectedHex = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const expected = Buffer.from(SIGNATURE_PREFIX + expectedHex, 'utf8');
  const received = Buffer.from(signatureHeader, 'utf8');

  // timingSafeEqual lança quando os tamanhos diferem, então o comprimento é comparado antes.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Subconjunto do payload de evento do Chatwoot que este webhook de fato usa hoje (só log). */
export interface ChatwootWebhookEvent {
  event?: string;
  conversation?: { id?: number; inbox_id?: number } | null;
  account?: { id?: number } | null;
}
