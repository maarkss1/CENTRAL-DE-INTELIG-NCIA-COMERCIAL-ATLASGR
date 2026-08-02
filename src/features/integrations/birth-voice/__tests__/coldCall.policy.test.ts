import { describe, it, expect } from 'vitest';
import {
    isWithinCallWindow,
    evaluateLead,
    DEFAULT_CALL_WINDOW,
    type DialPolicy,
} from '../coldCall.policy';

// Todas as datas são UTC de propósito: é assim que o servidor enxerga o tempo, e o ponto destes
// testes é justamente provar que a conversão para o fuso de quem atende acontece.
// 2026-08-03T12:00:00Z = segunda-feira, 09:00 em São Paulo.
const SEGUNDA_9H_SP = new Date('2026-08-03T12:00:00Z');

describe('isWithinCallWindow', () => {
    it('permite ligar no primeiro horário da janela', () => {
        expect(isWithinCallWindow(SEGUNDA_9H_SP)).toBe(true);
    });

    // A armadilha que o uso de getHours() esconderia: em UTC são 11h, dentro da janela 9–18,
    // mas no Brasil ainda são 8h da manhã.
    it('recusa 08:00 no Brasil mesmo com o servidor em UTC marcando 11h', () => {
        expect(isWithinCallWindow(new Date('2026-08-03T11:00:00Z'))).toBe(false);
    });

    it('trata o fim da janela como exclusivo', () => {
        expect(isWithinCallWindow(new Date('2026-08-03T20:00:00Z'))).toBe(true); // 17:00 SP
        expect(isWithinCallWindow(new Date('2026-08-03T21:00:00Z'))).toBe(false); // 18:00 SP
    });

    it('recusa fim de semana dentro do horário comercial', () => {
        // 2026-08-01T12:00:00Z = sábado, 09:00 em São Paulo.
        expect(isWithinCallWindow(new Date('2026-08-01T12:00:00Z'))).toBe(false);
        // 2026-08-02T12:00:00Z = domingo.
        expect(isWithinCallWindow(new Date('2026-08-02T12:00:00Z'))).toBe(false);
    });

    it('permite fim de semana quando a janela dispensa a restrição', () => {
        const window = { ...DEFAULT_CALL_WINDOW, weekdaysOnly: false };
        expect(isWithinCallWindow(new Date('2026-08-01T12:00:00Z'), window)).toBe(true);
    });

    it('respeita outro fuso sem alterar o resto da regra', () => {
        // 09:00 em São Paulo é 13:00 em Lisboa — fora de uma janela que terminasse ao meio-dia.
        const lisboa = { ...DEFAULT_CALL_WINDOW, timeZone: 'Europe/Lisbon', endHour: 12 };
        expect(isWithinCallWindow(SEGUNDA_9H_SP, lisboa)).toBe(false);
    });
});

const policy: DialPolicy = { maxAttemptsPerLead: 3, retryCooldownHours: 48 };

describe('evaluateLead', () => {
    it('libera lead nunca contatado', () => {
        expect(evaluateLead({ id: 'l1', lastInteraction: null, attempts: 0 }, policy, SEGUNDA_9H_SP))
            .toEqual({ eligible: true });
    });

    it('para de insistir depois do limite de tentativas', () => {
        expect(evaluateLead({ id: 'l1', lastInteraction: null, attempts: 3 }, policy, SEGUNDA_9H_SP))
            .toEqual({ eligible: false, reason: 'max-attempts' });
    });

    it('respeita o intervalo mínimo entre tentativas', () => {
        const ontem = new Date(SEGUNDA_9H_SP.getTime() - 24 * 3_600_000);
        expect(evaluateLead({ id: 'l1', lastInteraction: ontem, attempts: 1 }, policy, SEGUNDA_9H_SP))
            .toEqual({ eligible: false, reason: 'cooldown' });
    });

    it('libera de novo depois de cumprido o intervalo', () => {
        const tresDiasAtras = new Date(SEGUNDA_9H_SP.getTime() - 72 * 3_600_000);
        expect(evaluateLead({ id: 'l1', lastInteraction: tresDiasAtras, attempts: 1 }, policy, SEGUNDA_9H_SP))
            .toEqual({ eligible: true });
    });

    // O limite de tentativas vale mesmo com o intervalo cumprido: são travas independentes, e a
    // ordem importa para o log dizer o motivo certo.
    it('prioriza o limite de tentativas sobre o intervalo', () => {
        const tresDiasAtras = new Date(SEGUNDA_9H_SP.getTime() - 72 * 3_600_000);
        expect(evaluateLead({ id: 'l1', lastInteraction: tresDiasAtras, attempts: 5 }, policy, SEGUNDA_9H_SP))
            .toEqual({ eligible: false, reason: 'max-attempts' });
    });
});
