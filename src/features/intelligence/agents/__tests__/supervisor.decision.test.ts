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

    it('aceita a ação closer para negociação e fechamento', () => {
        const parsed = supervisorDecisionSchema.safeParse({
            action: 'closer',
            instruction: 'Trate a objeção de preço e defina o próximo compromisso da proposta.',
            reasoning: 'O lead já está em negociação.',
        });

        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data.action).toBe('closer');
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
        const decision = fallbackDecision(['bdr', 'closer', 'crm', 'ops'], false);
        expect(decision.action).toBe('finish');
    });

    it('com leadId, só finaliza depois que os 5 especialistas atuaram', () => {
        const decision = fallbackDecision(['sdr', 'bdr', 'closer', 'crm', 'ops'], true);
        expect(decision.action).toBe('finish');
    });

    it('quando há missão original, usa-a como instrução em vez de um texto genérico', () => {
        const decision = fallbackDecision([], true, 'Qualifique o lead da Transportadora ABC.');
        expect(decision.instruction).toBe('Qualifique o lead da Transportadora ABC.');
    });

    it('sem missão informada, cai no texto genérico', () => {
        const decision = fallbackDecision([], true);
        expect(decision.instruction).toBe('Analise a missão do usuário com os dados disponíveis e produza um resultado objetivo.');
    });
});

describe('enforceLeadGuard', () => {
    it('reescreve a decisão sdr sem leadId para outro especialista pendente', () => {
        const decision = enforceLeadGuard(
            { action: 'sdr', instruction: 'Qualifique o lead.', reasoning: 'Parece um bom próximo passo.' },
            { leadId: '', completed: [], mission: '' },
        );

        expect(decision.action).not.toBe('sdr');
        expect(decision.reasoning).toContain('SDR não pode ser acionado');
    });

    it('reescreve mantendo a missão original como instrução do especialista redirecionado', () => {
        const decision = enforceLeadGuard(
            { action: 'sdr', instruction: 'Qualifique o lead.', reasoning: 'Parece um bom próximo passo.' },
            { leadId: '', completed: [], mission: 'Avalie o fit da Transportadora ABC para outbound.' },
        );

        expect(decision.action).toBe('bdr');
        expect(decision.instruction).toBe('Avalie o fit da Transportadora ABC para outbound.');
    });

    it('finaliza a missão se sdr for a única opção restante e não houver leadId', () => {
        const decision = enforceLeadGuard(
            { action: 'sdr', instruction: '', reasoning: '' },
            { leadId: '', completed: ['bdr', 'closer', 'crm', 'ops'], mission: '' },
        );

        expect(decision.action).toBe('finish');
        expect(decision.reasoning).toContain('SDR não pode ser acionado');
    });

    it('não mexe na decisão sdr quando há leadId', () => {
        const decision = enforceLeadGuard(
            { action: 'sdr', instruction: 'Qualifique o lead.', reasoning: 'Missão pede qualificação.' },
            { leadId: 'lead-123', completed: [], mission: '' },
        );

        expect(decision).toEqual({ action: 'sdr', instruction: 'Qualifique o lead.', reasoning: 'Missão pede qualificação.' });
    });

    it('não mexe em decisões que não são sdr, mesmo sem leadId', () => {
        const original = { action: 'bdr' as const, instruction: 'Avalie o fit outbound.', reasoning: 'Faz sentido.' };
        const decision = enforceLeadGuard(original, { leadId: '', completed: [], mission: '' });

        expect(decision).toEqual(original);
    });
});
