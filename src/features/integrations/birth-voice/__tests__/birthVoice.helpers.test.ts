import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
    isValidSignature,
    callMarker,
    buildObservations,
    pickCallablePhone,
    detectOptOut,
} from '../birthVoice.helpers';

const SECRET = 'segredo-compartilhado';

function sign(body: string, secret = SECRET): string {
    return createHmac('sha256', secret).update(body).digest('hex');
}

describe('isValidSignature', () => {
    it('aceita a assinatura correta', () => {
        const body = Buffer.from(JSON.stringify({ type: 'agent.call.ended' }), 'utf8');
        expect(isValidSignature(body, sign(body.toString('utf8')), SECRET)).toBe(true);
    });

    it('rejeita quando o corpo foi adulterado depois de assinado', () => {
        const original = '{"type":"agent.call.ended","data":{"durationSeconds":10}}';
        const tampered = Buffer.from('{"type":"agent.call.ended","data":{"durationSeconds":99}}', 'utf8');
        expect(isValidSignature(tampered, sign(original), SECRET)).toBe(false);
    });

    it('rejeita assinatura gerada com outro segredo', () => {
        const body = Buffer.from('{"a":1}', 'utf8');
        expect(isValidSignature(body, sign(body.toString('utf8'), 'outro-segredo'), SECRET)).toBe(false);
    });

    it('rejeita quando o header não veio', () => {
        expect(isValidSignature(Buffer.from('{}', 'utf8'), undefined, SECRET)).toBe(false);
    });

    // timingSafeEqual lança se os buffers têm tamanhos diferentes; sem o guarda de comprimento
    // isso viraria um 500 em vez de um 401.
    it('rejeita sem lançar quando a assinatura tem comprimento diferente', () => {
        expect(() => isValidSignature(Buffer.from('{}', 'utf8'), 'curta', SECRET)).not.toThrow();
        expect(isValidSignature(Buffer.from('{}', 'utf8'), 'curta', SECRET)).toBe(false);
    });

    // A armadilha clássica: reserializar o corpo antes de conferir. O conteúdo é o mesmo, a string
    // não é — e a assinatura legítima passa a não conferir. Por isso o handler usa express.raw()
    // e é montado antes do express.json() global.
    it('não confere se o corpo for reserializado, perdendo a formatação original', () => {
        const received = '{"type": "agent.call.ended", "data": {}}';
        const reserialized = Buffer.from(JSON.stringify(JSON.parse(received)), 'utf8');

        expect(reserialized.toString('utf8')).not.toBe(received);
        expect(isValidSignature(reserialized, sign(received), SECRET)).toBe(false);
        // E confere quando os bytes originais são preservados.
        expect(isValidSignature(Buffer.from(received, 'utf8'), sign(received), SECRET)).toBe(true);
    });

    // Chaves que parecem inteiros são reordenadas pelo próprio motor de JS, independente da ordem
    // em que chegaram — outro jeito de a reserialização quebrar a assinatura.
    it('não confere quando chaves numéricas são reordenadas na reserialização', () => {
        const received = '{"2":"b","1":"a"}';
        const reserialized = Buffer.from(JSON.stringify(JSON.parse(received)), 'utf8');

        expect(reserialized.toString('utf8')).toBe('{"1":"a","2":"b"}');
        expect(isValidSignature(reserialized, sign(received), SECRET)).toBe(false);
    });
});

describe('buildObservations', () => {
    it('resume o resultado e inclui a transcrição', () => {
        const text = buildObservations({
            callSid: 'CA123',
            outcome: 'Concluído',
            durationSeconds: 62,
            agentName: 'Lea',
            transcript: [
                { role: 'assistant', content: 'Bom dia, falo da Atlas.' },
                { role: 'user', content: 'Pode falar.' },
            ],
        });

        expect(text).toContain('Lea');
        expect(text).toContain('Concluído');
        expect(text).toContain('62s');
        expect(text).toContain('IA: Bom dia, falo da Atlas.');
        expect(text).toContain('Lead: Pode falar.');
        expect(text).toContain(callMarker('CA123'));
    });

    it('registra uma ligação não atendida, que não tem transcrição', () => {
        const text = buildObservations({ callSid: 'CA9', outcome: 'Não atendida', durationSeconds: 0, transcript: [] });

        expect(text).toContain('Não atendida');
        expect(text).toContain('0s');
        expect(text).toContain(callMarker('CA9'));
    });
});

describe('detectOptOut', () => {
    it('não vê opt-out numa ligação comum', () => {
        const result = detectOptOut({
            transcript: [
                { role: 'assistant', content: 'Bom dia, falo da Atlas sobre rastreamento de frota.' },
                { role: 'user', content: 'Interessante, me manda por e-mail.' },
            ],
        });

        expect(result.optOut).toBe(false);
        expect(result.source).toBeNull();
    });

    it('detecta o pedido do lead e guarda a fala como evidência', () => {
        const result = detectOptOut({
            transcript: [
                { role: 'assistant', content: 'Posso falar rapidinho sobre a frota de vocês?' },
                { role: 'user', content: 'Não me ligue mais, por favor.' },
            ],
        });

        expect(result.optOut).toBe(true);
        expect(result.source).toBe('transcript');
        expect(result.evidence).toBe('Não me ligue mais, por favor.');
    });

    // O STT nem sempre devolve acentuação e pontuação; a comparação não pode depender disso.
    it('detecta mesmo sem acento e sem pontuação', () => {
        expect(detectOptOut({ transcript: [{ role: 'user', content: 'nao quero mais receber ligacoes' }] }).optOut)
            .toBe(true);
        expect(detectOptOut({ transcript: [{ role: 'user', content: 'ME TIRE DA LISTA!!!' }] }).optOut).toBe(true);
    });

    // A IA repete a frase ao confirmar o pedido ("entendi, não ligamos mais"). Se o turno dela
    // contasse, toda ligação em que o assunto aparece viraria bloqueio — inclusive a do lead que
    // acabou de dizer que tem interesse.
    it('ignora a mesma frase quando quem falou foi a IA', () => {
        const result = detectOptOut({
            transcript: [
                { role: 'assistant', content: 'Certo, não vou ligar mais. Tenha um bom dia.' },
                { role: 'user', content: 'Obrigado, pode me mandar a proposta.' },
            ],
        });

        expect(result.optOut).toBe(false);
    });

    // Hoje o Hub não manda este campo (o outcome dele é só telefônico), mas quando mandar ele tem
    // precedência: é o sinal explícito, não uma inferência sobre texto.
    it('respeita a marcação explícita do Hub, mesmo sem transcrição', () => {
        const result = detectOptOut({ optOut: true, transcript: [] });

        expect(result.optOut).toBe(true);
        expect(result.source).toBe('hub-flag');
    });

    it('não quebra quando a ligação não teve transcrição', () => {
        expect(detectOptOut({ outcome: 'Não atendida' }).optOut).toBe(false);
    });
});

describe('pickCallablePhone', () => {
    it('prefere o telefone do contato ao da empresa', () => {
        const result = pickCallablePhone(
            { phone: '(11) 98765-4321' },
            { phones: ['(11) 3216-5498'] },
        );
        expect(result).toBe('+5511987654321');
    });

    it('cai para o telefone da empresa quando o contato não tem número discável', () => {
        const result = pickCallablePhone({ phone: '123' }, { phones: ['(11) 3216-5498'] });
        expect(result).toBe('+551132165498');
    });

    it('devolve null quando nenhum número é discável, em vez de inventar um', () => {
        expect(pickCallablePhone({ phone: 'ramal 22' }, { phones: ['n/d'] })).toBeNull();
        expect(pickCallablePhone(null, null)).toBeNull();
    });
});
