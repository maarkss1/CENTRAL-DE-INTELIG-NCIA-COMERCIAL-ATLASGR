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

describe('piiFields — cifra em repouso de PII de Contact (CPI item 1)', () => {
    it('lista os campos String de Contact cifrados e mantém birthDate (DateTime) de fora', () => {
        expect(ENCRYPTED_MODEL_FIELDS.Contact).toEqual([
            'name',
            'phone',
            'whatsapp',
            'email',
            'linkedin',
            'observations',
        ]);
        expect(ENCRYPTED_MODEL_FIELDS.Contact).not.toContain('birthDate');
    });

    it('não regride as credenciais de integração já cifradas antes desta mudança', () => {
        expect(ENCRYPTED_MODEL_FIELDS.GoogleWorkspaceConnection).toEqual(['accessToken', 'refreshToken']);
        expect(ENCRYPTED_MODEL_FIELDS.BitrixConnection).toEqual(['webhookUrl', 'webhookSecret']);
        expect(ENCRYPTED_MODEL_FIELDS.ThreeCXConnection).toEqual(['apiKey', 'apiSecret']);
        expect(ENCRYPTED_MODEL_FIELDS.Account).toEqual(['accessToken', 'refreshToken', 'idToken']);
    });

    it('encryptSensitiveFields(Contact) cifra name/phone/whatsapp/email/linkedin/observations, e decryptSensitiveRecord devolve o roundtrip exato (write→read)', () => {
        const plaintext = {
            id: 'contact-1',
            name: 'Ana Souza',
            phone: '+55 11 98888-7777',
            whatsapp: '+55 11 98888-7777',
            email: 'ana.souza@example.com',
            linkedin: 'https://linkedin.com/in/anasouza',
            observations: 'Prefere contato só depois das 14h.',
            role: 'Diretora de Operações', // não cifrado — não está na lista de campos
            companyId: 'company-1',
            birthDate: null,
        };

        const encrypted = encryptSensitiveFields('Contact', plaintext);

        for (const field of ENCRYPTED_MODEL_FIELDS.Contact) {
            expect(encrypted[field]).not.toBe((plaintext as Record<string, unknown>)[field]);
            expect(String(encrypted[field])).toMatch(/^enc:v1:/);
        }
        // Campos fora da lista permanecem intocados.
        expect(encrypted.role).toBe(plaintext.role);
        expect(encrypted.companyId).toBe(plaintext.companyId);
        expect(encrypted.id).toBe(plaintext.id);

        const decrypted = decryptSensitiveRecord('Contact', encrypted);
        expect(decrypted).toEqual(plaintext);
    });

    it('duas cifragens do mesmo e-mail produzem ciphertexts diferentes (IV aleatório por valor) — ambas decifram para o mesmo texto', () => {
        const a = encryptSensitiveFields('Contact', { email: 'mesmo@example.com' });
        const b = encryptSensitiveFields('Contact', { email: 'mesmo@example.com' });

        expect(a.email).not.toBe(b.email);
        expect(decryptSensitiveRecord('Contact', a).email).toBe('mesmo@example.com');
        expect(decryptSensitiveRecord('Contact', b).email).toBe('mesmo@example.com');
    });

    it('campos vazios/undefined não quebram e não viram ciphertext (evita cifrar string vazia ou tentar decifrar null)', () => {
        const encrypted = encryptSensitiveFields('Contact', { name: 'X', email: '', whatsapp: undefined });
        expect(encrypted.email).toBe('');
        expect(encrypted.whatsapp).toBeUndefined();

        const decrypted = decryptSensitiveRecord('Contact', { name: encrypted.name, email: '', phone: null });
        expect(decrypted.email).toBe('');
        expect(decrypted.phone).toBeNull();
    });

    it('decryptSensitiveResult aplica o roundtrip em array de resultados (findMany) e em objeto único (findFirst)', () => {
        const rows = [
            encryptSensitiveFields('Contact', { id: '1', name: 'Ana', email: 'ana@example.com' }),
            encryptSensitiveFields('Contact', { id: '2', name: 'Bruno', email: 'bruno@example.com' }),
        ];

        const decryptedMany = decryptSensitiveResult('Contact', rows);
        expect(decryptedMany).toEqual([
            { id: '1', name: 'Ana', email: 'ana@example.com' },
            { id: '2', name: 'Bruno', email: 'bruno@example.com' },
        ]);

        const single = encryptSensitiveFields('Contact', { id: '3', name: 'Carla', email: 'carla@example.com' });
        expect(decryptSensitiveResult('Contact', single)).toEqual({ id: '3', name: 'Carla', email: 'carla@example.com' });
    });

    it('modelos fora do mapa (ex.: Lead, que não tem PII direta própria — apenas via Contact) passam intocados', () => {
        const data = { id: 'lead-1', title: 'Oportunidade X', status: 'Lead_Recebido' };
        expect(encryptSensitiveFields('Lead', data)).toEqual(data);
        expect(decryptSensitiveResult('Lead', data)).toEqual(data);
    });

    it('ciphertext de Contact adulterado falha ao decifrar (fail-closed, mesmo comportamento de secretFields)', () => {
        const encrypted = encryptSensitiveFields('Contact', { email: 'ana@example.com' });
        const tampered = { email: `${String(encrypted.email).slice(0, -4)}XXXX` };

        expect(() => decryptSensitiveRecord('Contact', tampered)).toThrow(/Falha ao decifrar/);
    });
});
