import { describe, it, expect } from 'vitest';
import { isGenuineLeadReply, handleEmailReply, buildEmailTranscript, type IntentClassifierPort, type InboundEmailReply } from '../domain/replyTracking';

const BASE: InboundEmailReply = {
    organizationId: 'org-1',
    leadId: 'lead-1',
    providerMessageId: 'msg-1',
    inReplyTo: 'outbound-msg-1',
    fromEmail: 'lead@empresa.com',
    subject: 'Re: Proposta AtlasGR',
    body: 'Legal, podemos marcar uma call na quinta?',
    receivedAt: new Date('2026-08-03T14:00:00Z'),
};

describe('isGenuineLeadReply', () => {
    it('aceita resposta real com corpo não vazio', () => {
        expect(isGenuineLeadReply(BASE)).toBe(true);
    });

    it('rejeita corpo vazio', () => {
        expect(isGenuineLeadReply({ ...BASE, body: '   ' })).toBe(false);
    });

    it('rejeita cabeçalho Auto-Submitted (RFC 3834)', () => {
        expect(isGenuineLeadReply({ ...BASE, autoSubmittedHeader: 'auto-replied' })).toBe(false);
    });

    it('aceita Auto-Submitted: no explicitamente (o valor padrão de mensagens humanas quando o cabeçalho existe)', () => {
        expect(isGenuineLeadReply({ ...BASE, autoSubmittedHeader: 'no' })).toBe(true);
    });

    it.each([
        'Out of Office: Fora do escritório',
        'Automatic reply: Re: Proposta AtlasGR',
        'Resposta automática',
        'Undeliverable: Re: Proposta AtlasGR',
        'Mail Delivery Subsystem',
    ])('rejeita assunto de auto-resposta/bounce: %s', (subject) => {
        expect(isGenuineLeadReply({ ...BASE, subject })).toBe(false);
    });

    it('não confunde assunto real que só contém a palavra "auto" no meio da frase', () => {
        expect(isGenuineLeadReply({ ...BASE, subject: 'Re: frota automotiva' })).toBe(true);
    });
});

describe('buildEmailTranscript', () => {
    it('rotula inbound como Cliente e outbound como Atlas, ignorando mensagens vazias', () => {
        const transcript = buildEmailTranscript([
            { direction: 'outbound', body: 'Olá, tudo bem?' },
            { direction: 'inbound', body: '  ' },
            { direction: 'inbound', body: 'Tudo sim, pode mandar a proposta.' },
        ]);
        expect(transcript).toBe('Atlas: Olá, tudo bem?\nCliente: Tudo sim, pode mandar a proposta.');
    });
});

function classifierReturning(result: Partial<Awaited<ReturnType<IntentClassifierPort['classify']>>>): IntentClassifierPort {
    return {
        async classify() {
            return {
                intent: null,
                urgency: null,
                objections: [],
                budgetMentioned: false,
                nextStep: null,
                summary: null,
                confidence: null,
                raw: {},
                ...result,
            };
        },
    };
}

describe('handleEmailReply', () => {
    it('resposta genuína sempre encerra a cadência e produz um signalDraft no formato de ConversationSignal', async () => {
        const classifier = classifierReturning({ intent: 'alta_intencao_compra', confidence: 0.9 });
        const result = await handleEmailReply(BASE, [], classifier);

        expect(result.shouldStopCadence).toBe(true);
        expect(result.signalDraft).not.toBeNull();
        expect(result.signalDraft?.channel).toBe('email');
        expect(result.signalDraft?.intent).toBe('alta_intencao_compra');
        expect(result.signalDraft?.leadId).toBe('lead-1');
    });

    it('mesmo resposta "sem interesse" encerra a cadência — é resposta humana real, não critério de continuidade', async () => {
        const classifier = classifierReturning({ intent: 'sem_interesse' });
        const result = await handleEmailReply(BASE, [], classifier);
        expect(result.shouldStopCadence).toBe(true);
    });

    it('auto-reply/bounce NÃO encerra a cadência e não gera sinal', async () => {
        const classifier = classifierReturning({});
        const autoReply: InboundEmailReply = { ...BASE, subject: 'Out of Office: Fora até dia 20' };
        const result = await handleEmailReply(autoReply, [], classifier);

        expect(result.shouldStopCadence).toBe(false);
        expect(result.signalDraft).toBeNull();
    });
});
