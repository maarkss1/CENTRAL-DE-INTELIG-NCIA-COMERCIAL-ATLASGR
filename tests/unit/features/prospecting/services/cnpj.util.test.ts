/**
 * Validação/normalização de CNPJ — base da deduplicação de empresas por CNPJ em
 * `prospecting.service.ts::findExistingCompany`. Um CNPJ mal validado ou mal normalizado
 * (com/sem pontuação) faz a mesma empresa entrar duplicada no CRM.
 */
import { describe, it, expect } from 'vitest';
import { isValidCnpj, sanitizeCnpj, formatCnpj } from '../../../../../src/features/prospecting/services/cnpj.util.js';

describe('isValidCnpj', () => {
    it('aceita um CNPJ real (dígitos verificadores corretos)', () => {
        expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
        expect(isValidCnpj('11444777000161')).toBe(true);
    });

    it('rejeita CNPJ com dígito verificador incorreto', () => {
        expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
    });

    it('rejeita CNPJ com todos os dígitos iguais (formato inválido conhecido)', () => {
        expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    });

    it('rejeita string com tamanho errado', () => {
        expect(isValidCnpj('123')).toBe(false);
        expect(isValidCnpj('')).toBe(false);
    });
});

describe('sanitizeCnpj / formatCnpj — normalização para dedupe', () => {
    it('o mesmo CNPJ em formatos diferentes normaliza para os mesmos dígitos', () => {
        const withPunctuation = sanitizeCnpj('11.222.333/0001-81');
        const digitsOnly = sanitizeCnpj('11222333000181');
        expect(withPunctuation).toBe(digitsOnly);
        expect(withPunctuation).toBe('11222333000181');
    });

    it('formata dígitos crus no padrão XX.XXX.XXX/XXXX-XX', () => {
        expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    });

    it('devolve a entrada original quando não tem 14 dígitos (não inventa formatação)', () => {
        expect(formatCnpj('123')).toBe('123');
    });
});
