import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
    NODE_ENV: 'test' as string,
    PII_BLIND_INDEX_KEY: undefined as string | undefined,
}));

vi.mock('@/config/env', () => ({ env: mockEnv }));

import {
    contactEmailIndex,
    contactEmailDomainIndex,
    emailDomainIndexOf,
    contactPhoneIndex,
    contactWhatsappIndex,
    contactPhoneLast8Index,
    contactWhatsappLast8Index,
    contactPhoneLast9Index,
    contactWhatsappLast9Index,
    last8DigitsIndex,
    last9DigitsIndex,
    contactSearchIndexClauses,
    computeContactPiiIndexes,
    _resetIndexKeyCacheForTests,
} from '@/lib/crypto/piiIndex';

beforeEach(() => {
    mockEnv.NODE_ENV = 'test';
    mockEnv.PII_BLIND_INDEX_KEY = undefined;
    _resetIndexKeyCacheForTests();
});

describe('piiIndex — índice cego (HMAC-SHA256) de busca exata sobre PII de Contact', () => {
    it('é determinístico — mesma entrada produz sempre o mesmo índice (ao contrário do ciphertext, que tem IV aleatório)', () => {
        expect(contactEmailIndex('ana@example.com')).toBe(contactEmailIndex('ana@example.com'));
        expect(contactPhoneIndex('+55 11 91234-5678')).toBe(contactPhoneIndex('+55 11 91234-5678'));
    });

    it('e-mail é normalizado (trim + lowercase) — mesma tolerância que mode: insensitive dava antes', () => {
        expect(contactEmailIndex('Ana@Example.com')).toBe(contactEmailIndex('ana@example.com'));
        expect(contactEmailIndex('  ana@example.com  ')).toBe(contactEmailIndex('ana@example.com'));
        expect(contactEmailIndex('outro@example.com')).not.toBe(contactEmailIndex('ana@example.com'));
    });

    it('índice de domínio bate entre e-mails diferentes do mesmo domínio, e com o domínio isolado (emailDomainIndexOf)', () => {
        expect(contactEmailDomainIndex('ana@example.com')).toBe(contactEmailDomainIndex('joao@EXAMPLE.com'));
        expect(contactEmailDomainIndex('ana@example.com')).toBe(emailDomainIndexOf('example.com'));
        expect(contactEmailDomainIndex('ana@outro.com')).not.toBe(contactEmailDomainIndex('ana@example.com'));
    });

    it('telefone/whatsapp usam igualdade EXATA sobre o valor bruto (sem normalizar dígitos) — replica o `{ phone: contact.phone }` que existia antes', () => {
        expect(contactPhoneIndex('11912345678')).not.toBe(contactPhoneIndex('+55 11 91234-5678'));
        expect(contactWhatsappIndex('11912345678')).toBe(contactWhatsappIndex('11912345678'));
    });

    it('last8/last9 recortam só dígitos, e usam TODOS os dígitos quando o valor tem menos que o corte (nunca menos)', () => {
        const long = '+55 11 91234-5678'; // 13 dígitos
        expect(contactPhoneLast8Index(long)).toBe(last8DigitsIndex('91234-5678')); // últimos 8 batem
        expect(contactPhoneLast9Index(long)).toBe(last9DigitsIndex('91234-5678'));

        const short = '1234567'; // 7 dígitos — menor que 8
        expect(contactPhoneLast8Index(short)).toBe(contactPhoneLast9Index(short)); // ambos usam os 7 dígitos inteiros
        expect(last8DigitsIndex(short)).toBe(contactPhoneLast8Index(short));
    });

    it('last8 e last9 do MESMO telefone são índices diferentes — um 8-dígitos não casa contra a coluna Last9Index e vice-versa', () => {
        const phone = '5511912345678';
        expect(contactPhoneLast8Index(phone)).not.toBe(contactPhoneLast9Index(phone));
        expect(contactWhatsappLast8Index(phone)).not.toBe(contactWhatsappLast9Index(phone));
    });

    it('valores vazios/nulos/indefinidos sempre devolvem null — nunca um índice "vazio" que poderia casar em massa', () => {
        expect(contactEmailIndex(null)).toBeNull();
        expect(contactEmailIndex(undefined)).toBeNull();
        expect(contactEmailIndex('')).toBeNull();
        expect(contactEmailDomainIndex('sem-arroba')).toBeNull();
        expect(contactPhoneIndex(null)).toBeNull();
        expect(last8DigitsIndex('sem dígito nenhum')).toBeNull();
        expect(last9DigitsIndex(null)).toBeNull();
    });

    it('computeContactPiiIndexes preserva null por campo ausente, sem vazar índice de um campo pro outro', () => {
        const indexes = computeContactPiiIndexes({ email: 'ana@example.com', phone: null, whatsapp: undefined });
        expect(indexes.emailIndex).not.toBeNull();
        expect(indexes.emailDomainIndex).not.toBeNull();
        expect(indexes.phoneIndex).toBeNull();
        expect(indexes.phoneLast8Index).toBeNull();
        expect(indexes.phoneLast9Index).toBeNull();
        expect(indexes.whatsappIndex).toBeNull();
        expect(indexes.whatsappLast8Index).toBeNull();
        expect(indexes.whatsappLast9Index).toBeNull();
    });

    describe('contactSearchIndexClauses — augmenta a busca livre de ContactService.findAll', () => {
        it('query com "@" gera cláusula de emailIndex', () => {
            const clauses = contactSearchIndexClauses('ana@example.com');
            expect(clauses).toContainEqual({ emailIndex: contactEmailIndex('ana@example.com') });
        });

        it('query com 4+ dígitos gera cláusulas de phoneLast8Index/whatsappLast8Index', () => {
            const clauses = contactSearchIndexClauses('(11) 91234-5678');
            const idx = last8DigitsIndex('(11) 91234-5678');
            expect(clauses).toContainEqual({ phoneLast8Index: idx });
            expect(clauses).toContainEqual({ whatsappLast8Index: idx });
        });

        it('query puramente textual (nome) não gera nenhuma cláusula de índice', () => {
            expect(contactSearchIndexClauses('Ana Souza')).toEqual([]);
        });
    });

    describe('chave (PII_BLIND_INDEX_KEY)', () => {
        it('em produção sem a chave configurada, falha fail-closed em vez de usar um padrão inseguro', () => {
            mockEnv.NODE_ENV = 'production';
            expect(() => contactEmailIndex('ana@example.com')).toThrow(/PII_BLIND_INDEX_KEY ausente em produção/);
        });

        it('chave inválida (tamanho errado) falha explicitamente', () => {
            mockEnv.PII_BLIND_INDEX_KEY = Buffer.from('chave-curta-demais').toString('base64');
            expect(() => contactEmailIndex('ana@example.com')).toThrow(/PII_BLIND_INDEX_KEY inválida/);
        });

        it('chaves diferentes produzem índices diferentes para o mesmo valor', () => {
            const withoutKey = contactEmailIndex('ana@example.com');
            mockEnv.PII_BLIND_INDEX_KEY = Buffer.alloc(32, 7).toString('base64');
            _resetIndexKeyCacheForTests();
            const withKey = contactEmailIndex('ana@example.com');
            expect(withKey).not.toBe(withoutKey);
        });
    });
});
