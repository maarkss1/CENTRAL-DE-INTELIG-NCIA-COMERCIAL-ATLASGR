import { describe, expect, it } from 'vitest';
import { supervisorDecisionSchema } from '../supervisor.agent';

describe('supervisorDecisionSchema', () => {
    it('aceita uma decisão bem formada', () => {
        const parsed = supervisorDecisionSchema.safeParse({
            action: 'sdr',
            instruction: 'Qualifique o lead X.',
            reasoning: 'Ainda não foi acionado.',
        });

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data).toEqual({
                action: 'sdr',
                instruction: 'Qualifique o lead X.',
                reasoning: 'Ainda não foi acionado.',
            });
        }
    });

    it('preenche instruction/reasoning ausentes com string vazia', () => {
        const parsed = supervisorDecisionSchema.safeParse({ action: 'finish' });

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data).toEqual({ action: 'finish', instruction: '', reasoning: '' });
        }
    });

    it('aceita a ação ops (agente de operações)', () => {
        const parsed = supervisorDecisionSchema.safeParse({
            action: 'ops',
            instruction: 'Agende um follow-up para o lead X amanhã às 10h.',
            reasoning: 'A missão pede uma ação concreta, não apenas análise.',
        });

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.action).toBe('ops');
        }
    });

    it('rejeita uma ação fora do enum esperado', () => {
        const parsed = supervisorDecisionSchema.safeParse({ action: 'chutar-para-fora' });
        expect(parsed.success).toBe(false);
    });

    it('rejeita entradas que não são objetos (ex.: JSON não encontrado na resposta)', () => {
        expect(supervisorDecisionSchema.safeParse(null).success).toBe(false);
        expect(supervisorDecisionSchema.safeParse(undefined).success).toBe(false);
        expect(supervisorDecisionSchema.safeParse('texto solto').success).toBe(false);
    });
});
