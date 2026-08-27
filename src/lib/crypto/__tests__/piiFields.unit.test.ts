import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
    NODE_ENV: 'test' as string,
    CREDENTIALS_ENCRYPTION_KEY: undefined as string | undefined,
}));

vi.mock('@/config/env', () => ({ env: mockEnv }));

import {
    ENCRYPTED_MODEL_FIELDS,
    encryptSensitiveFields,
    decryptSensitiveRecord,
    decryptSensitiveResult,
} from '@/lib/crypto/piiFields';
import { _resetKeyCacheForTests } from '@/lib/crypto/secretFields';

beforeEach(() => {
    mockEnv.NODE_ENV = 'test';
    mockEnv.CREDENTIALS_ENCRYPTION_KEY = undefined;
    _resetKeyCacheForTests();
});

describe('piiFields — cifra em repouso de credenciais de integração', () => {
    it('não regride as credenciais de integração já cifradas', () => {
        expect(ENCRYPTED_MODEL_FIELDS.GoogleWorkspaceConnection).toEqual(['accessToken', 'refreshToken']);
        expect(ENCRYPTED_MODEL_FIELDS.BitrixConnection).toEqual(['webhookUrl', 'webhookSecret']);
        expect(ENCRYPTED_MODEL_FIELDS.ThreeCXConnection).toEqual(['apiKey', 'apiSecret']);
        expect(ENCRYPTED_MODEL_FIELDS.Account).toEqual(['accessToken', 'refreshToken', 'idToken']);
    });

    // Guard de regressão intencional: `Contact` chegou a entrar neste mapa nesta mesma rodada e
    // foi revertido porque quebrou (confirmado contra Postgres real em CI, não só suposição) a
    // busca/leitura por e-mail/telefone em pelo menos 4 fluxos reais (ver comentário em
    // piiFields.ts e o handoff onda-39/01-para-00-pii-contact-revertida-quebra-integration.md).
    // Não readicionar sem antes resolver busca por igualdade sobre coluna cifrada.
    it('Contact permanece FORA do mapa até existir solução de busca compatível com ciphertext não-determinístico', () => {
        expect(ENCRYPTED_MODEL_FIELDS.Contact).toBeUndefined();
    });

    it('encryptSensitiveFields cifra só os campos listados do model, e decryptSensitiveRecord devolve o roundtrip exato (write→read)', () => {
        const plaintext = {
            id: 'conn-1',
            webhookUrl: 'https://example.bitrix24.com.br/rest/1/abc123/',
            webhookSecret: 'super-secret-value',
            organizationId: 'org-1', // não cifrado — não está na lista de campos deste model
        };

        const encrypted = encryptSensitiveFields('BitrixConnection', plaintext);

        for (const field of ENCRYPTED_MODEL_FIELDS.BitrixConnection) {
            expect(encrypted[field]).not.toBe((plaintext as Record<string, unknown>)[field]);
            expect(String(encrypted[field])).toMatch(/^enc:v1:/);
        }
        // Campos fora da lista permanecem intocados.
        expect(encrypted.organizationId).toBe(plaintext.organizationId);
        expect(encrypted.id).toBe(plaintext.id);

        const decrypted = decryptSensitiveRecord('BitrixConnection', encrypted);
        expect(decrypted).toEqual(plaintext);
    });

    it('duas cifragens do mesmo valor produzem ciphertexts diferentes (IV aleatório por valor) — ambas decifram para o mesmo texto', () => {
        const a = encryptSensitiveFields('BitrixConnection', { webhookSecret: 'mesmo-segredo' });
        const b = encryptSensitiveFields('BitrixConnection', { webhookSecret: 'mesmo-segredo' });

        expect(a.webhookSecret).not.toBe(b.webhookSecret);
        expect(decryptSensitiveRecord('BitrixConnection', a).webhookSecret).toBe('mesmo-segredo');
        expect(decryptSensitiveRecord('BitrixConnection', b).webhookSecret).toBe('mesmo-segredo');
    });

    it('campos vazios/undefined não quebram e não viram ciphertext (evita cifrar string vazia ou tentar decifrar null)', () => {
        const encrypted = encryptSensitiveFields('BitrixConnection', { webhookUrl: 'https://x', webhookSecret: '' });
        expect(encrypted.webhookSecret).toBe('');

        const decrypted = decryptSensitiveRecord('BitrixConnection', { webhookUrl: encrypted.webhookUrl, webhookSecret: '' });
        expect(decrypted.webhookSecret).toBe('');
    });

    it('decryptSensitiveResult aplica o roundtrip em array de resultados (findMany) e em objeto único (findFirst)', () => {
        const rows = [
            encryptSensitiveFields('BitrixConnection', { id: '1', webhookSecret: 'a' }),
            encryptSensitiveFields('BitrixConnection', { id: '2', webhookSecret: 'b' }),
        ];

        const decryptedMany = decryptSensitiveResult('BitrixConnection', rows);
        expect(decryptedMany).toEqual([
            { id: '1', webhookSecret: 'a' },
            { id: '2', webhookSecret: 'b' },
        ]);

        const single = encryptSensitiveFields('BitrixConnection', { id: '3', webhookSecret: 'c' });
        expect(decryptSensitiveResult('BitrixConnection', single)).toEqual({ id: '3', webhookSecret: 'c' });
    });

    it('modelos fora do mapa (ex.: Contact, Lead) passam intocados', () => {
        const data = { id: 'contact-1', name: 'Ana Souza', email: 'ana@example.com' };
        expect(encryptSensitiveFields('Contact', data)).toEqual(data);
        expect(decryptSensitiveResult('Contact', data)).toEqual(data);
    });

    it('ciphertext adulterado falha ao decifrar (fail-closed, mesmo comportamento de secretFields)', () => {
        const encrypted = encryptSensitiveFields('BitrixConnection', { webhookSecret: 'abc' });
        const tampered = { webhookSecret: `${String(encrypted.webhookSecret).slice(0, -4)}XXXX` };

        expect(() => decryptSensitiveRecord('BitrixConnection', tampered)).toThrow(/Falha ao decifrar/);
    });
});
