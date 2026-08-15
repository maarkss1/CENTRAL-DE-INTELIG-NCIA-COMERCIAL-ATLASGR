import { describe, expect, it } from 'vitest';

import { filterNewContacts, normalizeEmailForDedupe, normalizePhoneForDedupe } from '../contactDedupe';

describe('normalizeEmailForDedupe', () => {
    it('normaliza para minúsculas e remove espaços', () => {
        expect(normalizeEmailForDedupe('  Joao@Empresa.COM.BR ')).toBe('joao@empresa.com.br');
    });

    it('devolve null para e-mail vazio/ausente', () => {
        expect(normalizeEmailForDedupe(null)).toBeNull();
        expect(normalizeEmailForDedupe(undefined)).toBeNull();
        expect(normalizeEmailForDedupe('')).toBeNull();
        expect(normalizeEmailForDedupe('   ')).toBeNull();
    });
});

describe('normalizePhoneForDedupe', () => {
    it('mantém só os dígitos', () => {
        expect(normalizePhoneForDedupe('(21) 99999-0000')).toBe('21999990000');
    });

    it('descarta números curtos demais para serem reais (< 8 dígitos)', () => {
        expect(normalizePhoneForDedupe('1234567')).toBeNull();
    });

    it('devolve null para telefone vazio/ausente', () => {
        expect(normalizePhoneForDedupe(null)).toBeNull();
        expect(normalizePhoneForDedupe(undefined)).toBeNull();
        expect(normalizePhoneForDedupe('')).toBeNull();
    });
});

describe('filterNewContacts', () => {
    it('remove candidato cujo e-mail já existe (case/whitespace-insensitive)', () => {
        const existing = [{ email: 'joao@empresa.com.br', phone: null }];
        const candidates = [
            { name: 'João Silva', email: ' JOAO@EMPRESA.COM.BR ', phone: null },
            { name: 'Maria Souza', email: 'maria@empresa.com.br', phone: null },
        ];

        expect(filterNewContacts(candidates, existing)).toEqual([candidates[1]]);
    });

    it('remove candidato cujo telefone já existe, mesmo com formatação diferente', () => {
        const existing = [{ email: null, phone: '(21) 99999-0000' }];
        const candidates = [
            { name: 'João Silva', email: null, phone: '21999990000' },
            { name: 'Maria Souza', email: null, phone: '21988887777' },
        ];

        expect(filterNewContacts(candidates, existing)).toEqual([candidates[1]]);
    });

    it('mantém candidatos sem e-mail/telefone em comum com nenhum existente', () => {
        const existing = [{ email: 'outro@empresa.com.br', phone: '21911112222' }];
        const candidates = [{ name: 'Maria Souza', email: 'maria@empresa.com.br', phone: '21988887777' }];

        expect(filterNewContacts(candidates, existing)).toEqual(candidates);
    });

    it('nunca trata dois contatos sem e-mail/telefone como duplicados entre si', () => {
        const existing = [{ email: null, phone: null }];
        const candidates = [{ name: 'Sem Contato Direto', email: null, phone: null }];

        expect(filterNewContacts(candidates, existing)).toEqual(candidates);
    });

    it('devolve lista vazia quando não há candidatos', () => {
        expect(filterNewContacts([], [{ email: 'a@b.com', phone: null }])).toEqual([]);
    });
});
