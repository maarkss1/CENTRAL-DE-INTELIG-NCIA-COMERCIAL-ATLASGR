import { describe, expect, it } from 'vitest';
import { readProviderError, sanitizeProviderMessage } from '../redaction';

describe('redaction — nenhum segredo de provedor pode vazar em erro/log', () => {
  describe('sanitizeProviderMessage', () => {
    it('redige um Bearer token', () => {
      const message = sanitizeProviderMessage(
        'Falha: Authorization Bearer sk-abc123DEF456ghi789 inválido',
      );
      expect(message).not.toContain('sk-abc123DEF456ghi789');
      expect(message).toContain('Bearer [REDACTED]');
    });

    it('redige uma chave Groq (gsk_...)', () => {
      const message = sanitizeProviderMessage('key gsk_1234567890abcdef1234 rejeitada');
      expect(message).not.toContain('gsk_1234567890abcdef1234');
    });

    it('redige pares api_key=/token=/secret= mesmo sem prefixo Bearer', () => {
      const message = sanitizeProviderMessage('config inválida: api_key=meu-segredo-123');
      expect(message).not.toContain('meu-segredo-123');
      expect(message).toContain('[REDACTED]');
    });

    it('mantém o texto legível quando não há segredo', () => {
      expect(sanitizeProviderMessage('Modelo não encontrado')).toBe('Modelo não encontrado');
    });

    it('nunca lança para entrada vazia/undefined — cai no texto padrão', () => {
      expect(sanitizeProviderMessage(undefined)).toBe('Erro sem detalhes fornecidos pelo provedor');
      expect(sanitizeProviderMessage('')).toBe('Erro sem detalhes fornecidos pelo provedor');
    });

    it('trunca mensagens muito longas em 500 caracteres', () => {
      const long = 'x'.repeat(1000);
      expect(sanitizeProviderMessage(long).length).toBeLessThanOrEqual(500);
    });
  });

  describe('readProviderError', () => {
    it('extrai error.message de um corpo JSON aninhado e sanitiza', () => {
      const response = new Response(
        JSON.stringify({ error: { message: 'Bearer sk-secret123456789012 expirado' } }),
        { status: 401 },
      );
      return readProviderError(response).then((message) => {
        expect(message).not.toContain('sk-secret123456789012');
      });
    });

    it('cai para o corpo bruto sanitizado quando não é JSON válido', async () => {
      const response = new Response('<html>Bad Gateway</html>', { status: 502 });
      await expect(readProviderError(response)).resolves.toContain('Bad Gateway');
    });
  });
});
