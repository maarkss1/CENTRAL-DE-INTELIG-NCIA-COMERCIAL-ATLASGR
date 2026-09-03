import { describe, it, expect } from 'vitest';
import { computeWhatsAppResponseTimeStats } from '../whatsappResponseTime';

const at = (isoOffset: string) => new Date(`2026-09-02T10:00:00.000Z`.replace('10:00:00', isoOffset));

describe('computeWhatsAppResponseTimeStats', () => {
  it('sem mensagem nenhuma, tudo fica null/zero', () => {
    const result = computeWhatsAppResponseTimeStats([]);
    expect(result).toEqual({
      firstResponseMs: null,
      averageResponseMs: null,
      medianResponseMs: null,
      sampleCount: 0,
      hasPendingResponse: false,
      pendingSinceMs: null,
    });
  });

  it('calcula o tempo de resposta de um único ciclo inbound->outbound', () => {
    const result = computeWhatsAppResponseTimeStats([
      { direction: 'inbound', receivedAt: at('10:00:00') },
      { direction: 'outbound', receivedAt: at('10:05:00') },
    ]);
    expect(result.firstResponseMs).toBe(5 * 60 * 1000);
    expect(result.sampleCount).toBe(1);
    expect(result.hasPendingResponse).toBe(false);
  });

  it('uma rajada de mensagens do lead conta como UM único ciclo, medido da primeira', () => {
    const result = computeWhatsAppResponseTimeStats([
      { direction: 'inbound', receivedAt: at('10:00:00') },
      { direction: 'inbound', receivedAt: at('10:01:00') },
      { direction: 'inbound', receivedAt: at('10:02:00') },
      { direction: 'outbound', receivedAt: at('10:10:00') },
    ]);
    expect(result.sampleCount).toBe(1);
    expect(result.firstResponseMs).toBe(10 * 60 * 1000); // da 10:00, não da 10:02
  });

  it('mensagem outbound proativa (sem inbound pendente) não entra no cálculo', () => {
    const result = computeWhatsAppResponseTimeStats([
      { direction: 'outbound', receivedAt: at('10:00:00') }, // ex.: cadência
      { direction: 'inbound', receivedAt: at('10:05:00') },
      { direction: 'outbound', receivedAt: at('10:07:00') },
    ]);
    expect(result.sampleCount).toBe(1);
    expect(result.firstResponseMs).toBe(2 * 60 * 1000);
  });

  it('sinaliza pendência quando a última mensagem é do lead, sem resposta ainda', () => {
    const now = at('10:15:00');
    const result = computeWhatsAppResponseTimeStats(
      [
        { direction: 'inbound', receivedAt: at('10:00:00') },
        { direction: 'outbound', receivedAt: at('10:05:00') },
        { direction: 'inbound', receivedAt: at('10:10:00') },
      ],
      now,
    );
    expect(result.hasPendingResponse).toBe(true);
    expect(result.pendingSinceMs).toBe(5 * 60 * 1000);
    expect(result.sampleCount).toBe(1); // só o primeiro ciclo, já respondido, conta na média
  });

  it('calcula média e mediana corretamente com múltiplos ciclos', () => {
    const result = computeWhatsAppResponseTimeStats([
      { direction: 'inbound', receivedAt: at('10:00:00') },
      { direction: 'outbound', receivedAt: at('10:02:00') }, // gap 2min
      { direction: 'inbound', receivedAt: at('10:10:00') },
      { direction: 'outbound', receivedAt: at('10:14:00') }, // gap 4min
      { direction: 'inbound', receivedAt: at('10:20:00') },
      { direction: 'outbound', receivedAt: at('10:26:00') }, // gap 6min
    ]);
    expect(result.sampleCount).toBe(3);
    expect(result.averageResponseMs).toBe(4 * 60 * 1000);
    expect(result.medianResponseMs).toBe(4 * 60 * 1000);
  });

  it('funciona independente da ordem de entrada (ordena por timestamp internamente)', () => {
    const result = computeWhatsAppResponseTimeStats([
      { direction: 'outbound', receivedAt: at('10:05:00') },
      { direction: 'inbound', receivedAt: at('10:00:00') },
    ]);
    expect(result.firstResponseMs).toBe(5 * 60 * 1000);
  });
});
