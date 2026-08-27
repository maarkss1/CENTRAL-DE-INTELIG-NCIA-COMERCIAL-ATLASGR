/**
 * Validação/normalização de CNPJ — base da resolução determinística de identidade de empresa
 * (dossiê CPI, DEC-16, opção A) em `companyIdentity.service.ts::resolveCompanyIdentity` e
 * `prospecting.service.ts::findExistingCompany`. Um CNPJ mal validado ou mal normalizado (com/sem
 * pontuação) faz a mesma empresa entrar duplicada no CRM, ou pior: faz duas empresas diferentes
 * serem tratadas como a mesma.
 */
import { describe, it, expect } from 'vitest';
import { isValidCnpj, sanitizeCnpj, formatCnpj, toDeterministicCnpj } from '../../../../../src/features/prospecting/services/cnpj.util.js';

describe('isValidCnpj', () => {
    // Base + dígitos verificadores calculados pelo algoritmo oficial de checksum (pesos
    // 5,4,3,2,9,8,7,6,5,4,3,2 para o 1º DV e 6,5,4,3,2,9,8,7,6,5,4,3,2 para o 2º, módulo 11) —
    // não são CNPJs de empresas reais específicas, mas passam pela mesma validação matemática
    // real que um CNPJ genuíno da Receita Federal precisa satisfazer.
    it('aceita CNPJs com dígitos verificadores matematicamente corretos', () => {
        expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
        expect(isValidCnpj('11444777000161')).toBe(true);
        expect(isValidCnpj('61.234.567/0001-17')).toBe(true);
        expect(isValidCnpj('04722060000179')).toBe(true);
        expect(isValidCnpj('12.345.678/0001-95')).toBe(true);
        expect(isValidCnpj('09090909000152')).toBe(true);
    });

    it('rejeita CNPJ com o primeiro dígito verificador incorreto', () => {
        expect(isValidCnpj('11.222.333/0001-71')).toBe(false); // correto termina em 81
    });

    it('rejeita CNPJ com o segundo dígito verificador incorreto', () => {
        expect(isValidCnpj('11.222.333/0001-82')).toBe(false); // correto termina em 81
    });

    it('rejeita CNPJ com um dígito trocado no meio (não é só checagem de tamanho)', () => {
        // '11222333000181' com o 5º dígito trocado (2->9) — mesmo tamanho, DV não bate mais.
        expect(isValidCnpj('11292333000181')).toBe(false);
    });

    it('rejeita CNPJ com todos os dígitos iguais (formato inválido conhecido, mesmo se "passasse" no módulo 11)', () => {
        expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
        expect(isValidCnpj('00000000000000')).toBe(false);
        expect(isValidCnpj('99999999999999')).toBe(false);
    });

    it('rejeita string com tamanho errado (curto, longo, ou vazio)', () => {
        expect(isValidCnpj('123')).toBe(false);
        expect(isValidCnpj('')).toBe(false);
        expect(isValidCnpj('112223330001811')).toBe(false); // 15 dígitos
        expect(isValidCnpj('1122233300018')).toBe(false); // 13 dígitos
    });

    it('rejeita entrada não numérica / lixo', () => {
        expect(isValidCnpj('abcdefghijklmn')).toBe(false);
        expect(isValidCnpj('CNPJ INVALIDO')).toBe(false);
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

describe('toDeterministicCnpj — chave de identidade determinística', () => {
    it('devolve os 14 dígitos normalizados quando o CNPJ (com pontuação) é válido', () => {
        expect(toDeterministicCnpj('11.222.333/0001-81')).toBe('11222333000181');
    });

    it('devolve os 14 dígitos normalizados quando o CNPJ (só dígitos) é válido', () => {
        expect(toDeterministicCnpj('11222333000181')).toBe('11222333000181');
    });

    it('formato com ou sem pontuação do mesmo CNPJ produz a mesma chave (é isso que torna a busca determinística)', () => {
        expect(toDeterministicCnpj('11.222.333/0001-81')).toBe(toDeterministicCnpj('11222333000181'));
    });

    it('devolve null quando o CNPJ é inválido (dígito verificador não bate) — nunca usa como identidade', () => {
        expect(toDeterministicCnpj('11.222.333/0001-82')).toBeNull();
    });

    it('devolve null quando o CNPJ está ausente/vazio/undefined', () => {
        expect(toDeterministicCnpj(null)).toBeNull();
        expect(toDeterministicCnpj(undefined)).toBeNull();
        expect(toDeterministicCnpj('')).toBeNull();
    });

    it('devolve null para lixo/placeholder que não é um CNPJ real', () => {
        expect(toDeterministicCnpj('não informado')).toBeNull();
        expect(toDeterministicCnpj('00000000000000')).toBeNull();
    });
});
