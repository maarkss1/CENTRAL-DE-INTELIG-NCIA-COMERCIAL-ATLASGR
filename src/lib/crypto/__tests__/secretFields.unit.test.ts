import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
    NODE_ENV: 'test' as string,
    CREDENTIALS_ENCRYPTION_KEY: undefined as string | undefined,
}));

vi.mock('@/config/env', () => ({ env: mockEnv }));

import { encryptField, decryptField, _resetKeyCacheForTests } from '@/lib/crypto/secretFields';

beforeEach(() => {
    mockEnv.NODE_ENV = 'test';
    mockEnv.CREDENTIALS_ENCRYPTION_KEY = undefined;
    _resetKeyCacheForTests();
});

describe('secretFields — criptografia de credenciais de integrações em repouso', () => {
    it('encrypt/decrypt roundtrip devolve o texto original', () => {
        const plaintext = 'https://example.bitrix24.com.br/rest/1/supersecrettoken/';
        const encrypted = encryptField(plaintext);

        expect(encrypted.startsWith('enc:v1:')).toBe(true);
        expect(encrypted).not.toContain(plaintext);
        expect(decryptField(encrypted)).toBe(plaintext);
    });

    it('duas cifragens do mesmo texto produzem ciphertexts diferentes (IV aleatório por valor)', () => {
        const a = encryptField('same-secret');
        const b = encryptField('same-secret');

        expect(a).not.toBe(b);
        expect(decryptField(a)).toBe('same-secret');
        expect(decryptField(b)).toBe('same-secret');
    });

    it('valor legado sem prefixo enc:v1: passa direto (compatibilidade com dados gravados antes desta cifra)', () => {
        expect(decryptField('https://legacy-plaintext.bitrix24.com.br/rest/1/token/')).toBe(
            'https://legacy-plaintext.bitrix24.com.br/rest/1/token/',
        );
    });

    it('ciphertext adulterado falha ao decifrar (fail-closed — nunca devolve lixo/vazio como se fosse válido)', () => {
        const encrypted = encryptField('secret-value');
        const tampered = `${encrypted.slice(0, -4)}XXXX`;

        expect(() => decryptField(tampered)).toThrow(/Falha ao decifrar/);
    });

    it('chave diferente entre cifrar e decifrar falha ao decifrar', () => {
        mockEnv.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
        const encrypted = encryptField('secret-value');

        _resetKeyCacheForTests();
        mockEnv.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');

        expect(() => decryptField(encrypted)).toThrow(/Falha ao decifrar/);
    });

    it('em produção, sem CREDENTIALS_ENCRYPTION_KEY, recusa cifrar em vez de usar um segredo padrão', () => {
        mockEnv.NODE_ENV = 'production';
        mockEnv.CREDENTIALS_ENCRYPTION_KEY = undefined;

        expect(() => encryptField('x')).toThrow(/CREDENTIALS_ENCRYPTION_KEY ausente em produção/);
    });

    it('chave com tamanho inválido (diferente de 32 bytes) é rejeitada', () => {
        mockEnv.CREDENTIALS_ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');

        expect(() => encryptField('x')).toThrow(/32 bytes/);
    });

    it('fora de produção, sem chave configurada, ainda funciona via chave fixa de desenvolvimento', () => {
        mockEnv.NODE_ENV = 'test';
        mockEnv.CREDENTIALS_ENCRYPTION_KEY = undefined;

        const encrypted = encryptField('dev-secret');
        expect(decryptField(encrypted)).toBe('dev-secret');
    });
});
