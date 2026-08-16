import { describe, it, expect } from 'vitest';
import { parseMonth, parseOwner } from '../presentation/CommercialIntelligenceController';
import { currentPeriod } from '../application/CommercialIntelligenceUseCases';

describe('CommercialIntelligenceController — parsing de input de query string', () => {
    describe('parseMonth', () => {
        it('aceita um período YYYY-MM válido', () => {
            expect(parseMonth('2026-08')).toBe('2026-08');
            expect(parseMonth('2026-01')).toBe('2026-01');
            expect(parseMonth('2026-12')).toBe('2026-12');
        });

        it('cai para o período atual quando o mês é inválido (não confia em input não sanitizado)', () => {
            expect(parseMonth('2026-13')).toBe(currentPeriod());
            expect(parseMonth('2026-00')).toBe(currentPeriod());
            expect(parseMonth('not-a-month')).toBe(currentPeriod());
            expect(parseMonth('2026-8')).toBe(currentPeriod());
        });

        it('cai para o período atual quando o valor não é string (query array, undefined, objeto)', () => {
            expect(parseMonth(undefined)).toBe(currentPeriod());
            expect(parseMonth(['2026-08', '2026-09'])).toBe(currentPeriod());
            expect(parseMonth({ nested: '2026-08' })).toBe(currentPeriod());
        });
    });

    describe('parseOwner', () => {
        it('preserva um owner não vazio', () => {
            expect(parseOwner('ana@atlasgr.com.br')).toBe('ana@atlasgr.com.br');
        });

        it('faz trim de espaços nas bordas', () => {
            expect(parseOwner('  ana@atlasgr.com.br  ')).toBe('ana@atlasgr.com.br');
        });

        it('retorna undefined para string vazia, só espaços, ou valor não-string — nunca filtra por owner="" (que quebraria applyScope)', () => {
            expect(parseOwner('')).toBeUndefined();
            expect(parseOwner('   ')).toBeUndefined();
            expect(parseOwner(undefined)).toBeUndefined();
            expect(parseOwner(['ana@atlasgr.com.br'])).toBeUndefined();
        });
    });
});
