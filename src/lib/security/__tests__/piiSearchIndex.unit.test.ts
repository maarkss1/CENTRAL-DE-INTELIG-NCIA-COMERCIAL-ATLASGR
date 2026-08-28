import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
    NODE_ENV: 'test' as string,
    PII_SEARCH_HMAC_SECRET: undefined as string | undefined,
}));

vi.mock('@/config/env', () => ({ env: mockEnv }));

import {
    hmacForSearchIndex,
    hashEmailForSearchIndex,
    hashPhoneForSearchIndex,
    computeContactHashFields,
    CONTACT_HASHED_FIELDS,
    _resetSecretCacheForTests,
} from '@/lib/security/piiSearchIndex';

beforeEach(() => {
    mockEnv.NODE_ENV = 'test';
    mockEnv.PII_SEARCH_HMAC_SECRET = 'segredo-de-teste-fixo';
    _resetSecretCacheForTests();
});

describe('piiSearchIndex — índice de busca determinístico (HMAC-SHA256) de PII de Contact (DEC-01)', () => {
    describe('hmacForSearchIndex', () => {
        it('é determinístico: a mesma entrada produz sempre o mesmo hash', () => {
            expect(hmacForSearchIndex('11999998888')).toBe(hmacForSearchIndex('11999998888'));
        });

        it('entradas diferentes produzem hashes diferentes', () => {
            expect(hmacForSearchIndex('11999998888')).not.toBe(hmacForSearchIndex('11999998889'));
        });

        it('devolve hex de 64 chars (SHA-256)', () => {
            const hash = hmacForSearchIndex('qualquer-valor');
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('segredos diferentes produzem hashes diferentes para o mesmo valor — não é um hash puro sem chave', () => {
            const withSecretA = hmacForSearchIndex('mesmo-valor');
            mockEnv.PII_SEARCH_HMAC_SECRET = 'outro-segredo';
            _resetSecretCacheForTests();
            const withSecretB = hmacForSearchIndex('mesmo-valor');
            expect(withSecretA).not.toBe(withSecretB);
        });

        it('sem PII_SEARCH_HMAC_SECRET configurada, cai para um segredo fixo de dev/test (não lança) fora de produção', () => {
            mockEnv.PII_SEARCH_HMAC_SECRET = undefined;
            _resetSecretCacheForTests();
            expect(() => hmacForSearchIndex('valor')).not.toThrow();
        });

        it('em produção, sem PII_SEARCH_HMAC_SECRET configurada, lança (fail-closed)', () => {
            mockEnv.NODE_ENV = 'production';
            mockEnv.PII_SEARCH_HMAC_SECRET = undefined;
            _resetSecretCacheForTests();
            expect(() => hmacForSearchIndex('valor')).toThrow(/PII_SEARCH_HMAC_SECRET/);
        });
    });

    describe('hashEmailForSearchIndex — normalização de e-mail (trim + lowercase, mesma definição de contactDedupe.ts)', () => {
        it('duas grafias do mesmo e-mail (case/espaço diferentes) produzem o MESMO hash', () => {
            const a = hashEmailForSearchIndex('Ana@Empresa.com.br');
            const b = hashEmailForSearchIndex('  ana@empresa.com.br  ');
            expect(a).toBe(b);
        });

        it('e-mails logicamente diferentes produzem hashes diferentes', () => {
            expect(hashEmailForSearchIndex('ana@empresa.com')).not.toBe(hashEmailForSearchIndex('bruno@empresa.com'));
        });

        it('null/undefined/string vazia devolvem null — nunca hasheia string vazia', () => {
            expect(hashEmailForSearchIndex(null)).toBeNull();
            expect(hashEmailForSearchIndex(undefined)).toBeNull();
            expect(hashEmailForSearchIndex('')).toBeNull();
            expect(hashEmailForSearchIndex('   ')).toBeNull();
        });
    });

    describe('hashPhoneForSearchIndex — normalização de telefone (só dígitos, mesma definição de contactDedupe.ts)', () => {
        it('duas formatações do mesmo telefone produzem o MESMO hash', () => {
            const a = hashPhoneForSearchIndex('(11) 99999-8888');
            const b = hashPhoneForSearchIndex('11999998888');
            expect(a).toBe(b);
        });

        it('telefones logicamente diferentes produzem hashes diferentes', () => {
            expect(hashPhoneForSearchIndex('11999998888')).not.toBe(hashPhoneForSearchIndex('11999998889'));
        });

        it('telefone curto demais (< 8 dígitos), null ou vazio devolvem null', () => {
            expect(hashPhoneForSearchIndex('1234567')).toBeNull();
            expect(hashPhoneForSearchIndex(null)).toBeNull();
            expect(hashPhoneForSearchIndex(undefined)).toBeNull();
            expect(hashPhoneForSearchIndex('')).toBeNull();
        });
    });

    describe('computeContactHashFields — só calcula hash dos campos presentes no payload de escrita', () => {
        it('create completo: calcula os três hashes', () => {
            const result = computeContactHashFields({
                name: 'Ana',
                email: 'ana@empresa.com',
                phone: '11999998888',
                whatsapp: '11999998888',
            });
            expect(Object.keys(result).sort()).toEqual(['emailHash', 'phoneHash', 'whatsappHash']);
            expect(result.emailHash).toBe(hashEmailForSearchIndex('ana@empresa.com'));
            expect(result.phoneHash).toBe(hashPhoneForSearchIndex('11999998888'));
            expect(result.whatsappHash).toBe(hashPhoneForSearchIndex('11999998888'));
        });

        it('update parcial (só `role`, sem phone/email/whatsapp): não calcula nenhum hash — não apaga hash de campo não tocado', () => {
            const result = computeContactHashFields({ role: 'Diretor Comercial' });
            expect(result).toEqual({});
        });

        it('update que limpa um campo (`phone: null`) também limpa o hash correspondente', () => {
            const result = computeContactHashFields({ phone: null });
            expect(result).toEqual({ phoneHash: null });
        });

        it('update que só toca email não mexe em phoneHash/whatsappHash', () => {
            const result = computeContactHashFields({ email: 'novo@empresa.com' });
            expect(Object.keys(result)).toEqual(['emailHash']);
        });

        it('cobre todos os campos declarados em CONTACT_HASHED_FIELDS — guard de regressão se um campo novo for adicionado sem teste', () => {
            expect(Object.keys(CONTACT_HASHED_FIELDS).sort()).toEqual(['email', 'phone', 'whatsapp']);
        });
    });
});
