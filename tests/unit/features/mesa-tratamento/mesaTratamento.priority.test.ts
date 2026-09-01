import { describe, it, expect } from 'vitest';
import { rankLeadsForQueue } from '@/features/mesa-tratamento/mesaTratamento.priority';

/**
 * Piloto 026 — primeira cobertura de teste do módulo (auditoria confirmou zero testes
 * unitários/e2e reais exercitando a fila da Mesa de Tratamento). `rankLeadsForQueue` é a lógica
 * que decide qual lead o SDR vê primeiro — prioridade errada aqui significa o SDR trabalhando o
 * lead errado sem perceber, então o critério (etapa → dias sem toque → temperatura) precisa estar
 * coberto.
 */

type QueueLeadInput = {
  id: string;
  status: string;
  lastInteraction: Date | null;
  temperature: string | null;
};

function lead(overrides: Partial<QueueLeadInput> & { id: string }): QueueLeadInput {
  return {
    status: 'Lead_Recebido',
    lastInteraction: null,
    temperature: null,
    ...overrides,
  };
}

describe('rankLeadsForQueue', () => {
  it('prioriza a etapa mais urgente (Reunião Agendada) antes de etapas mais cedo do funil', () => {
    const ranked = rankLeadsForQueue([
      lead({ id: 'a', status: 'Lead_Recebido' }),
      lead({ id: 'b', status: 'Reuniao_Agendada' }),
      lead({ id: 'c', status: 'Cadencia_Iniciada' }),
      lead({ id: 'd', status: 'Qualificacao_SDR' }),
    ]);
    expect(ranked.map((l) => l.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('dentro da mesma etapa, prioriza quem está há mais dias sem toque', () => {
    const now = Date.now();
    const ranked = rankLeadsForQueue([
      lead({ id: 'recent', status: 'Lead_Recebido', lastInteraction: new Date(now - 1 * 86_400_000) }),
      lead({ id: 'stale', status: 'Lead_Recebido', lastInteraction: new Date(now - 10 * 86_400_000) }),
    ]);
    expect(ranked.map((l) => l.id)).toEqual(['stale', 'recent']);
  });

  it('lead nunca tocado (lastInteraction null) tem prioridade máxima de resgate, mesma etapa', () => {
    const ranked = rankLeadsForQueue([
      lead({ id: 'touched', status: 'Lead_Recebido', lastInteraction: new Date() }),
      lead({ id: 'never-touched', status: 'Lead_Recebido', lastInteraction: null }),
    ]);
    expect(ranked.map((l) => l.id)).toEqual(['never-touched', 'touched']);
  });

  it('empate de etapa e dias sem toque desempata por temperatura (Quente > Morno > Frio)', () => {
    const sameDate = new Date();
    const ranked = rankLeadsForQueue([
      lead({ id: 'frio', status: 'Lead_Recebido', lastInteraction: sameDate, temperature: 'Frio' }),
      lead({ id: 'quente', status: 'Lead_Recebido', lastInteraction: sameDate, temperature: 'Quente' }),
      lead({ id: 'morno', status: 'Lead_Recebido', lastInteraction: sameDate, temperature: 'Morno' }),
    ]);
    expect(ranked.map((l) => l.id)).toEqual(['quente', 'morno', 'frio']);
  });

  it('não muta o array original (retorna uma cópia ordenada)', () => {
    const original = [
      lead({ id: 'a', status: 'Lead_Recebido' }),
      lead({ id: 'b', status: 'Reuniao_Agendada' }),
    ];
    const originalOrder = original.map((l) => l.id);
    rankLeadsForQueue(original);
    expect(original.map((l) => l.id)).toEqual(originalOrder);
  });

  it('etapa desconhecida (nunca deveria chegar aqui, mas por segurança) cai para o fim da fila', () => {
    const ranked = rankLeadsForQueue([
      lead({ id: 'unknown-stage', status: 'Convertido_em_Oportunidade' }),
      lead({ id: 'known-stage', status: 'Lead_Recebido' }),
    ]);
    expect(ranked.map((l) => l.id)).toEqual(['known-stage', 'unknown-stage']);
  });
});
