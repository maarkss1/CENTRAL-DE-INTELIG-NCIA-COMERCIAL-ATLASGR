import { describe, it, expect } from 'vitest';
import { resolveLossReasonLabel, LOSS_REASONS } from '@/features/mesa-tratamento/constants/lossReasons';

/**
 * Regressão de um bug real: a Mesa de Tratamento gravava o ID numérico bruto do Bitrix
 * (`body.lossReasonId`, ex. "21638") direto em `Lead.lossReason`, enquanto a importação de leads
 * do Bitrix sempre grava o TEXTO do motivo. Isso fazia "21638" aparecer como "Principal motivo de
 * perda" na tela de Win/Loss, quebrava `lossTaxonomy.ts` (Comercial Inteligente, sempre
 * classificava como "Outro") e fazia a sincronização de volta ao Bitrix falhar em silêncio
 * (`buildOutboundCustomFields` não reconhece o ID como texto de enum). `resolveLossReasonLabel` é
 * o ponto único de tradução usado na escrita (`mesaTratamento.routes.ts`).
 */
describe('resolveLossReasonLabel', () => {
  it('traduz um ID real do Bitrix para o texto do motivo', () => {
    expect(resolveLossReasonLabel('21638')).toBe('Não é ICP');
  });

  it('traduz corretamente para cada entrada real do catálogo (nenhuma ficou órfã)', () => {
    for (const reason of LOSS_REASONS) {
      expect(resolveLossReasonLabel(reason.id)).toBe(reason.label);
    }
  });

  it('devolve o próprio valor (sem lançar) quando o ID não é reconhecido — nunca perde o dado', () => {
    expect(resolveLossReasonLabel('id-desconhecido-999')).toBe('id-desconhecido-999');
  });

  it('é idempotente: aplicar a tradução sobre um valor já traduzido (texto) não muda nada', () => {
    const label = resolveLossReasonLabel('21638');
    expect(resolveLossReasonLabel(label)).toBe(label);
  });
});
