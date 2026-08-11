import { describe, it, expect } from 'vitest';
import { classifyLossReason } from '../application/lossTaxonomy';

describe('lossTaxonomy.classifyLossReason', () => {
    it('classifica null/vazio como "Não informado" — nunca "Outro" (ausência de dado ≠ dado não classificável)', () => {
        expect(classifyLossReason(null)).toBe('Não informado');
        expect(classifyLossReason(undefined)).toBe('Não informado');
        expect(classifyLossReason('')).toBe('Não informado');
        expect(classifyLossReason('   ')).toBe('Não informado');
    });

    it('classifica por palavra-chave (case-insensitive, com/sem acento)', () => {
        expect(classifyLossReason('Preço muito alto')).toBe('Preço');
        expect(classifyLossReason('fechou com a concorrência')).toBe('Concorrência');
        expect(classifyLossReason('CONCORRENCIA MAIS BARATA')).toBe('Concorrência');
        expect(classifyLossReason('cliente sem orçamento este ano')).toBe('Sem orçamento');
        expect(classifyLossReason('não é o momento certo')).toBe('Timing');
        expect(classifyLossReason('projeto cancelado internamente')).toBe('Projeto cancelado');
    });

    it('classifica texto preenchido sem casamento como "Outro" (dado real, só não classificável)', () => {
        expect(classifyLossReason('motivo bem específico e incomum xyz123')).toBe('Outro');
    });
});
