import { describe, it, expect } from 'vitest';
import { shiftMonth, monthLabelPt, countBusinessDays } from '../application/executiveCalendar';

describe('executiveCalendar', () => {
    it('shiftMonth: avança meses dentro do mesmo ano', () => {
        expect(shiftMonth('2026-08', 1)).toBe('2026-09');
        expect(shiftMonth('2026-08', 3)).toBe('2026-11');
    });

    it('shiftMonth: vira o ano corretamente para frente e para trás', () => {
        expect(shiftMonth('2026-11', 3)).toBe('2027-02');
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    });

    it('shiftMonth: delta 0 retorna o mesmo período', () => {
        expect(shiftMonth('2026-08', 0)).toBe('2026-08');
    });

    it('monthLabelPt: formata "MÊS/ANO" em pt-BR', () => {
        expect(monthLabelPt('2026-08')).toBe('AGO/2026');
        expect(monthLabelPt('2026-01')).toBe('JAN/2026');
        expect(monthLabelPt('2026-12')).toBe('DEZ/2026');
    });

    it('countBusinessDays: conta só dias úteis (seg-sex) no intervalo [start, end)', () => {
        // 2026-08-01 é sábado; 2026-08-01..2026-08-08 (exclusivo) = 1 semana completa = 5 dias úteis
        const start = new Date('2026-08-01T00:00:00Z');
        const end = new Date('2026-08-08T00:00:00Z');
        expect(countBusinessDays(start, end)).toBe(5);
    });

    it('countBusinessDays: intervalo vazio ou invertido retorna 0', () => {
        const a = new Date('2026-08-10T00:00:00Z');
        const b = new Date('2026-08-05T00:00:00Z');
        expect(countBusinessDays(a, a)).toBe(0);
        expect(countBusinessDays(a, b)).toBe(0);
    });

    it('countBusinessDays: mês inteiro de agosto/2026 (21 dias úteis)', () => {
        const start = new Date('2026-08-01T00:00:00Z');
        const end = new Date('2026-09-01T00:00:00Z');
        expect(countBusinessDays(start, end)).toBe(21);
    });
});
