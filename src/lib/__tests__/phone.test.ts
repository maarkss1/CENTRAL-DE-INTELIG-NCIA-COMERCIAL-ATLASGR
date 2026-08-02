import { describe, it, expect } from 'vitest';
import { toE164BR } from '../phone';

describe('toE164BR', () => {
    it('normaliza celular com DDD e máscara', () => {
        expect(toE164BR('(11) 98765-4321')).toBe('+5511987654321');
    });

    it('normaliza fixo de 8 dígitos', () => {
        expect(toE164BR('11 3216-5498')).toBe('+551132165498');
    });

    it('mantém número que já vem com código do país', () => {
        expect(toE164BR('+55 11 98765-4321')).toBe('+5511987654321');
        expect(toE164BR('5511987654321')).toBe('+5511987654321');
    });

    it('descarta o prefixo de discagem interurbana', () => {
        expect(toE164BR('011 98765-4321')).toBe('+5511987654321');
    });

    // DDD 55 (Santa Maria/RS) colide com o código do país. O desempate é o comprimento: 11 dígitos
    // é DDD + celular, não código do país + número.
    it('não confunde o DDD 55 com o código do país', () => {
        expect(toE164BR('55 98765-4321')).toBe('+5555987654321');
        expect(toE164BR('55 3216-5498')).toBe('+555532165498');
    });

    it('devolve null para o que não é telefone discável', () => {
        expect(toE164BR('ramal 22')).toBeNull();
        expect(toE164BR('123')).toBeNull();
        expect(toE164BR('')).toBeNull();
        expect(toE164BR(null)).toBeNull();
        expect(toE164BR(undefined)).toBeNull();
    });
});
