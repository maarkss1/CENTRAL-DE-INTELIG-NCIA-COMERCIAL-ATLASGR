import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { isValidChatwootSignature } from '../chatwoot.helpers';

const SECRET = 'segredo-compartilhado';
const NOW_MS = 1_700_000_000_000;

function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

describe('isValidChatwootSignature', () => {
  it('aceita assinatura e timestamp corretos', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'conversation_created' }), 'utf8');
    const timestampHeader = String(Math.floor(NOW_MS / 1000));
    const signatureHeader = sign(rawBody.toString('utf8'), timestampHeader);
    expect(
      isValidChatwootSignature({ rawBody, signatureHeader, timestampHeader, secret: SECRET, nowMs: NOW_MS }),
    ).toBe(true);
  });

  it('rejeita quando falta o prefixo sha256=', () => {
    const rawBody = Buffer.from('{}', 'utf8');
    const timestampHeader = String(Math.floor(NOW_MS / 1000));
    const raw = createHmac('sha256', SECRET).update(`${timestampHeader}.{}`).digest('hex');
    expect(
      isValidChatwootSignature({
        rawBody,
        signatureHeader: raw,
        timestampHeader,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it('rejeita quando o corpo foi adulterado depois de assinado', () => {
    const timestampHeader = String(Math.floor(NOW_MS / 1000));
    const signatureHeader = sign('{"event":"a"}', timestampHeader);
    const tampered = Buffer.from('{"event":"b"}', 'utf8');
    expect(
      isValidChatwootSignature({
        rawBody: tampered,
        signatureHeader,
        timestampHeader,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it('rejeita assinatura gerada com outro segredo', () => {
    const rawBody = Buffer.from('{}', 'utf8');
    const timestampHeader = String(Math.floor(NOW_MS / 1000));
    const signatureHeader = sign('{}', timestampHeader, 'outro-segredo');
    expect(
      isValidChatwootSignature({ rawBody, signatureHeader, timestampHeader, secret: SECRET, nowMs: NOW_MS }),
    ).toBe(false);
  });

  it('rejeita timestamp fora da janela de tolerância (replay tardio)', () => {
    const rawBody = Buffer.from('{}', 'utf8');
    const staleTimestamp = String(Math.floor(NOW_MS / 1000) - 60 * 60); // 1h atrás
    const signatureHeader = sign('{}', staleTimestamp);
    expect(
      isValidChatwootSignature({
        rawBody,
        signatureHeader,
        timestampHeader: staleTimestamp,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it('rejeita quando faltam os headers de assinatura ou timestamp', () => {
    const rawBody = Buffer.from('{}', 'utf8');
    expect(
      isValidChatwootSignature({
        rawBody,
        signatureHeader: undefined,
        timestampHeader: '123',
        secret: SECRET,
      }),
    ).toBe(false);
    expect(
      isValidChatwootSignature({
        rawBody,
        signatureHeader: 'sha256=abc',
        timestampHeader: undefined,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('rejeita timestamp não numérico', () => {
    const rawBody = Buffer.from('{}', 'utf8');
    expect(
      isValidChatwootSignature({
        rawBody,
        signatureHeader: 'sha256=abc',
        timestampHeader: 'not-a-number',
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });
});
