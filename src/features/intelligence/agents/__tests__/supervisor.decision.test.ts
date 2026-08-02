import { describe, expect, it } from 'vitest';
import { supervisorDecisionSchema, fallbackDecision, enforceLeadGuard } from '../supervisor.agent';

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

describe('fallbackDecision', () => {
    it('com leadId disponível, oferece sdr primeiro', () => {
        const decision = fallbackDecision([], true);
        expect(decision.action).toBe('sdr');
    });

    it('sem leadId, nunca oferece sdr como contingência', () => {
        const decision = fallbackDecision([], false);
        expect(decision.action).not.toBe('sdr');
        expect(decision.action).toBe('bdr');
    });

    it('sem leadId, pula direto para finish quando os demais especialistas já atuaram', () => {
        const decision = fallbackDecision(['bdr', 'crm', 'ops'], false);
        expect(decision.action).toBe('finish');
    });

    it('com leadId, só finaliza depois que os 4 especialistas atuaram', () => {
        const decision = fallbackDecision(['sdr', 'bdr', 'crm', 'ops'], true);
        expect(decision.action).toBe('finish');
    });
});

describe('enforceLeadGuard', () => {
    it('reescreve a decisão sdr sem leadId para outro especialista pendente', () => {
        const decision = enforceLeadGuard(
            { action: 'sdr', instruction: 'Qualifique o lead.', reasoning: 'Parece um bom próximo passo.' },
            { leadId: '', completed: [] },
        );

        expect(decision.action).not.toBe('sdr');
        expect(decision.reasoning).toContain('SDR não pode ser acionado');
    });

    it('finaliza a missão se sdr for a única opção restante e não houver leadId', () => {
        const decision = enforceLeadGuard(
            { action: 'sdr', instruction: '', reasoning: '' },
            { leadId: '', completed: ['bdr', 'crm', 'ops'] },
        );

        expect(decision.action).toBe('finish');
        expect(decision.reasoning).toContain('SDR não pode ser acionado');
    });

    it('não mexe na decisão sdr quando há leadId', () => {
        const decision = enforceLeadGuard(
            { action: 'sdr', instruction: 'Qualifique o lead.', reasoning: 'Missão pede qualificação.' },
            { leadId: 'lead-123', completed: [] },
        );

        expect(decision).toEqual({ action: 'sdr', instruction: 'Qualifique o lead.', reasoning: 'Missão pede qualificação.' });
    });

    it('não mexe em decisões que não são sdr, mesmo sem leadId', () => {
        const original = { action: 'bdr' as const, instruction: 'Avalie o fit outbound.', reasoning: 'Faz sentido.' };
        const decision = enforceLeadGuard(original, { leadId: '', completed: [] });

        expect(decision).toEqual(original);
    });
});
