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

    // Guard de regressão intencional (o inverso do que este teste checava numa rodada anterior,
    // quando Contact tinha acabado de ser revertido do mapa por quebrar busca exata — ver
    // handoff onda-39/01-para-00-pii-contact-revertida-quebra-integration.md): agora que a busca
    // exata tem um índice cego compatível (src/lib/crypto/piiIndex.ts), Contact volta ao mapa, mas
    // SÓ com os três campos que têm esse índice construído. `name`/`linkedin`/`observations`
    // continuam de fora de propósito (sustentam a busca livre por substring de
    // `ContactService.findAll`) — expandir esta lista sem also construir o índice/reescrever os
    // call sites de busca correspondentes reintroduziria exatamente a quebra da rodada anterior.
    it('Contact cifra só email/phone/whatsapp — ampliar exige índice de busca compatível primeiro', () => {
        expect(ENCRYPTED_MODEL_FIELDS.Contact).toEqual(['email', 'phone', 'whatsapp']);
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

    it('modelos fora do mapa (ex.: Lead, Company) passam intocados', () => {
        const data = { id: 'lead-1', title: 'Negócio X' };
        expect(encryptSensitiveFields('Lead', data)).toEqual(data);
        expect(decryptSensitiveResult('Lead', data)).toEqual(data);
    });

    it('Contact cifra email/phone/whatsapp e devolve o roundtrip exato — name/role/observations continuam em texto puro', () => {
        const plaintext = {
            id: 'contact-1',
            name: 'Ana Souza',
            role: 'Diretora',
            observations: 'Prefere contato por e-mail.',
            email: 'ana@example.com',
            phone: '+55 11 91234-5678',
            whatsapp: '+55 11 91234-5678',
        };

        const encrypted = encryptSensitiveFields('Contact', plaintext);
        expect(String(encrypted.email)).toMatch(/^enc:v1:/);
        expect(String(encrypted.phone)).toMatch(/^enc:v1:/);
        expect(String(encrypted.whatsapp)).toMatch(/^enc:v1:/);
        expect(encrypted.name).toBe(plaintext.name);
        expect(encrypted.role).toBe(plaintext.role);
        expect(encrypted.observations).toBe(plaintext.observations);

        expect(decryptSensitiveRecord('Contact', encrypted)).toEqual(plaintext);
    });

    it('ciphertext adulterado falha ao decifrar (fail-closed, mesmo comportamento de secretFields)', () => {
        const encrypted = encryptSensitiveFields('BitrixConnection', { webhookSecret: 'abc' });
        const tampered = { webhookSecret: `${String(encrypted.webhookSecret).slice(0, -4)}XXXX` };

        expect(() => decryptSensitiveRecord('BitrixConnection', tampered)).toThrow(/Falha ao decifrar/);
    });
});
