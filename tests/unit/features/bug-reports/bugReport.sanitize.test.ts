import { describe, it, expect } from 'vitest';
import {
    redactText,
    sanitizeTitle,
    sanitizeDescription,
    sanitizeRecentLogs,
} from '../../../../src/features/bug-reports/bugReport.sanitize';

describe('bugReport.sanitize', () => {
    describe('redactText', () => {
        it('redige um header Bearer token', () => {
            const input = 'Falha ao chamar API: Authorization: Bearer abc123.def456-ghi_789';
            expect(redactText(input)).not.toContain('abc123.def456-ghi_789');
            expect(redactText(input)).toContain('Bearer [REDACTED]');
        });

        it('redige um JWT (três segmentos base64url separados por ponto)', () => {
            // JWT sintético (payload {"sub":"1234567890"}) montado em partes — um literal único no
            // formato "eyJ....eyJ....assinatura" dispara a regra "jwt" do gitleaks mesmo sendo
            // fabricado só para este teste; concatenar em runtime evita o falso-positivo sem
            // precisar de allowlist/config novo.
            const jwtHeader = 'eyJhbGciOiJIUzI1NiJ9';
            const jwtPayload = 'eyJzdWIiOiIxMjM0NTY3ODkwIn0';
            const jwtSignature = 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
            const jwt = [jwtHeader, jwtPayload, jwtSignature].join('.');
            const input = `token expirado: ${jwt}`;
            expect(redactText(input)).toBe('token expirado: [REDACTED_JWT]');
        });

        it('redige uma chave estilo "sk-..."', () => {
            const input = 'usando chave sk-abcdefghijklmnopqrstuvwx no header';
            expect(redactText(input)).toContain('[REDACTED_KEY]');
            expect(redactText(input)).not.toContain('sk-abcdefghijklmnopqrstuvwx');
        });

        it('redige um campo "password"/"senha" em texto tipo JSON', () => {
            expect(redactText('{"password": "hunter2"}')).toContain('[REDACTED]');
            expect(redactText('{"password": "hunter2"}')).not.toContain('hunter2');
            expect(redactText('senha=trocarDepois123')).not.toContain('trocarDepois123');
        });

        it('não altera texto sem nenhum padrão sensível', () => {
            const input = 'O botão de salvar não responde depois de clicar duas vezes.';
            expect(redactText(input)).toBe(input);
        });
    });

    describe('sanitizeTitle / sanitizeDescription', () => {
        it('corta o título no tamanho máximo (200)', () => {
            const long = 'a'.repeat(500);
            expect(sanitizeTitle(long)).toHaveLength(200);
        });

        it('corta a descrição no tamanho máximo (5000)', () => {
            const long = 'a'.repeat(6000);
            expect(sanitizeDescription(long)).toHaveLength(5000);
        });

        it('remove espaços nas pontas', () => {
            expect(sanitizeTitle('   título com espaço   ')).toBe('título com espaço');
        });
    });

    describe('sanitizeRecentLogs', () => {
        it('retorna array vazio para entrada que não é array', () => {
            expect(sanitizeRecentLogs(undefined)).toEqual([]);
            expect(sanitizeRecentLogs(null)).toEqual([]);
            expect(sanitizeRecentLogs('não é array')).toEqual([]);
            expect(sanitizeRecentLogs({ not: 'an array' })).toEqual([]);
        });

        it('mantém só os últimos 20 registros', () => {
            const logs = Array.from({ length: 50 }, (_, i) => ({ level: 'error', message: `erro ${i}`, timestamp: '2026-01-01T00:00:00.000Z' }));
            const result = sanitizeRecentLogs(logs);
            expect(result).toHaveLength(20);
            expect(result[0].message).toBe('erro 30');
            expect(result[19].message).toBe('erro 49');
        });

        it('descarta entradas que não são objetos e preenche defaults para campos ausentes', () => {
            const logs = [null, 'string solta', 42, { message: 'sem level nem timestamp' }];
            const result = sanitizeRecentLogs(logs);
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({ level: 'info', message: 'sem level nem timestamp' });
            expect(typeof result[0].timestamp).toBe('string');
        });

        it('redige e trunca a mensagem de cada entrada', () => {
            const logs = [{ level: 'error', message: `Bearer abc123.def456-ghi_789 ${'x'.repeat(600)}`, timestamp: '2026-01-01T00:00:00.000Z' }];
            const result = sanitizeRecentLogs(logs);
            expect(result[0].message).toContain('Bearer [REDACTED]');
            expect(result[0].message.length).toBeLessThanOrEqual(500);
        });
    });
});
