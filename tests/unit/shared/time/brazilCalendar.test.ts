import { describe, expect, it } from 'vitest';
import {
    brazilEndOfDayUtc,
    brazilMonthKey,
    brazilMonthRange,
    shiftBrazilMonth,
} from '../../../../src/shared/time/brazilCalendar.js';

describe('brazilCalendar', () => {
    it('mantém 23:30 de Brasília no mês brasileiro, mesmo já sendo o mês seguinte em UTC', () => {
        expect(brazilMonthKey(new Date('2026-09-01T02:30:00.000Z'))).toBe('2026-08');
    });

    it('cria fronteiras mensais em 00:00 BRT, não 00:00 UTC', () => {
        const range = brazilMonthRange('2026-08');
        expect(range.start.toISOString()).toBe('2026-08-01T03:00:00.000Z');
        expect(range.end.toISOString()).toBe('2026-09-01T03:00:00.000Z');
        expect(range.daysInMonth).toBe(31);
    });

    it('atravessa ano e preserva fim inclusivo de dia em Brasília', () => {
        expect(shiftBrazilMonth('2026-01', -1)).toBe('2025-12');
        expect(brazilEndOfDayUtc(2026, 7, 20).toISOString()).toBe('2026-08-21T02:59:59.999Z');
    });
});
