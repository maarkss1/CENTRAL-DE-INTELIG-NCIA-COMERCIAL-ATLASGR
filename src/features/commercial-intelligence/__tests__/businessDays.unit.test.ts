import { describe, it, expect } from 'vitest';
import { isBusinessDayUTC, countBusinessDays, countBusinessDaysElapsed } from '../application/businessDays';

// Agosto/2026: dia 1 é sábado, dia 2 é domingo — mês começa "atravessado" (bom caso de teste,
// evita o falso-positivo de um mês que começa numa segunda-feira).
const AUG_START = new Date('2026-08-01T00:00:00Z');
const AUG_END = new Date('2026-09-01T00:00:00Z'); // exclusivo

describe('businessDays — dia útil = segunda a sexta, sem calendário de feriados (seção 17-19)', () => {
    it('isBusinessDayUTC: sábado e domingo não são dias úteis; segunda a sexta são', () => {
        expect(isBusinessDayUTC(new Date('2026-08-01T00:00:00Z'))).toBe(false); // sábado
        expect(isBusinessDayUTC(new Date('2026-08-02T00:00:00Z'))).toBe(false); // domingo
        expect(isBusinessDayUTC(new Date('2026-08-03T00:00:00Z'))).toBe(true); // segunda
        expect(isBusinessDayUTC(new Date('2026-08-07T00:00:00Z'))).toBe(true); // sexta
    });

    it('countBusinessDays: agosto/2026 tem 21 dias úteis (4 semanas cheias de seg-sex + a segunda dia 31)', () => {
        expect(countBusinessDays(AUG_START, AUG_END)).toBe(21);
    });

    it('countBusinessDays: intervalo vazio (start === end) retorna 0', () => {
        expect(countBusinessDays(AUG_START, AUG_START)).toBe(0);
    });

    it('countBusinessDaysElapsed: mês corrente conta os dias úteis até hoje (inclusive), mesmo se hoje for fim de semana', () => {
        const now = new Date('2026-08-15T12:00:00Z'); // sábado — não é dia útil, mas conta os anteriores
        // Dias úteis 1..15/ago: 3,4,5,6,7 (sem1) + 10,11,12,13,14 (sem2) = 10
        expect(countBusinessDaysElapsed(AUG_START, AUG_END, now)).toBe(10);
    });

    it('countBusinessDaysElapsed: "hoje" sendo um dia útil também é contado (mesma semântica de iso <= hojeISO do Cockpit legado)', () => {
        const now = new Date('2026-08-14T09:00:00Z'); // sexta-feira, dia útil
        // Dias úteis 1..14/ago: 3,4,5,6,7,10,11,12,13,14 = 10 (inclui a sexta 14)
        expect(countBusinessDaysElapsed(AUG_START, AUG_END, now)).toBe(10);
    });

    it('countBusinessDaysElapsed: mês inteiramente no futuro retorna 0 (nada decorreu ainda)', () => {
        const now = new Date('2026-06-01T00:00:00Z');
        expect(countBusinessDaysElapsed(AUG_START, AUG_END, now)).toBe(0);
    });

    it('countBusinessDaysElapsed: mês inteiramente no passado retorna o total do mês (mês fechado)', () => {
        const now = new Date('2026-12-31T00:00:00Z');
        expect(countBusinessDaysElapsed(AUG_START, AUG_END, now)).toBe(countBusinessDays(AUG_START, AUG_END));
    });
});
