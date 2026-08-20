import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

const aiGuardrailEventCreate = vi.fn().mockResolvedValue({});
vi.mock('../../../../lib/prisma.js', () => ({
    prisma: { aIGuardrailEvent: { create: (...args: unknown[]) => aiGuardrailEventCreate(...args) } },
}));

const getTenantIdMock = vi.fn();
vi.mock('../../../../lib/async-context.js', () => ({
    getTenantId: () => getTenantIdMock(),
}));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { minimizePii, rehydratePii, redactSensitiveData, redactAndTrackPiiLeak, hasPiiExternalConsent, assertPiiExternalConsent, PiiConsentRequiredError } = await import('../guardrails.service');

describe('minimizePii / rehydratePii', () => {
    it('substitui o valor de PII pelo token antes de sair para o provedor de IA', () => {
        const { text, applied } = minimizePii(
            'Contato/decisor: Maria Silva, cargo: Diretora de Operações',
            [{ token: '[NOME_DO_CONTATO]', value: 'Maria Silva' }],
        );

        expect(text).toBe('Contato/decisor: [NOME_DO_CONTATO], cargo: Diretora de Operações');
        expect(applied).toEqual([{ token: '[NOME_DO_CONTATO]', value: 'Maria Silva' }]);
    });

    it('substitui todas as ocorrências do valor, não só a primeira', () => {
        const { text } = minimizePii(
            'Maria Silva confirmou a reunião. Avise Maria Silva por e-mail.',
            [{ token: '[NOME_DO_CONTATO]', value: 'Maria Silva' }],
        );

        expect(text).toBe('[NOME_DO_CONTATO] confirmou a reunião. Avise [NOME_DO_CONTATO] por e-mail.');
    });

    it('rehydratePii restaura o valor real no texto gerado pela IA', () => {
        const applied = [{ token: '[NOME_DO_CONTATO]', value: 'Maria Silva' }];
        const aiOutput = 'Olá [NOME_DO_CONTATO], tudo bem? Podemos marcar uma call?';

        expect(rehydratePii(aiOutput, applied)).toBe('Olá Maria Silva, tudo bem? Podemos marcar uma call?');
    });

    it('faz o ciclo completo minimizar -> (simulação de IA) -> reidratar sem vazar o valor original ao "provedor"', () => {
        const original = 'Contato/decisor: João Pereira, cargo: Gerente de Compras';
        const { text: sentToProvider, applied } = minimizePii(original, [
            { token: '[NOME_DO_CONTATO]', value: 'João Pereira' },
        ]);

        // O texto que "sairia" para o provedor externo nunca contém o nome real.
        expect(sentToProvider).not.toContain('João Pereira');

        // Simula uma resposta da IA que reaproveitou o token no corpo do e-mail gerado.
        const simulatedAiResponse = `Prezado ${applied[0].token},\n\nSegue nossa proposta...`;
        const finalText = rehydratePii(simulatedAiResponse, applied);

        expect(finalText).toBe('Prezado João Pereira,\n\nSegue nossa proposta...');
    });

    it('ignora valores ausentes ou vazios', () => {
        const { text, applied } = minimizePii('Sem contato definido.', [
            { token: '[NOME_DO_CONTATO]', value: undefined },
            { token: '[NOME_DO_CONTATO]', value: null },
            { token: '[NOME_DO_CONTATO]', value: '' },
        ]);

        expect(text).toBe('Sem contato definido.');
        expect(applied).toEqual([]);
    });

    it('ignora valores curtos demais (< 3 caracteres) para evitar substituições indevidas', () => {
        const { text, applied } = minimizePii('Ok, combinado.', [{ token: '[X]', value: 'Ok' }]);

        expect(text).toBe('Ok, combinado.');
        expect(applied).toEqual([]);
    });

    it('não aplica o token se o valor não aparece no texto', () => {
        const { text, applied } = minimizePii('Nenhuma menção ao contato aqui.', [
            { token: '[NOME_DO_CONTATO]', value: 'Alguém Que Não Está No Texto' },
        ]);

        expect(text).toBe('Nenhuma menção ao contato aqui.');
        expect(applied).toEqual([]);
    });
});

describe('redactSensitiveData (comportamento existente, não deve regredir)', () => {
    it('continua mascarando CPF na saída', () => {
        const { text, redacted } = redactSensitiveData('CPF do titular: 123.456.789-00');
        expect(redacted).toBe(true);
        expect(text).toBe('CPF do titular: [CPF OCULTADO]');
    });
});

describe('redactAndTrackPiiLeak (AI-006, onda 35: sinal real de PII leakage rate)', () => {
    afterEach(() => {
        aiGuardrailEventCreate.mockClear();
        getTenantIdMock.mockReset();
    });

    it('sem PII no texto, não grava nenhum evento de guardrail', async () => {
        getTenantIdMock.mockReturnValue('org-1');

        const result = await redactAndTrackPiiLeak('Texto qualquer sem dado sensível.', 'ai.service');

        expect(result).toBe('Texto qualquer sem dado sensível.');
        expect(aiGuardrailEventCreate).not.toHaveBeenCalled();
    });

    it('com CPF no texto, mascara E grava o evento com o organizationId do contexto e a fonte informada', async () => {
        getTenantIdMock.mockReturnValue('org-1');

        const result = await redactAndTrackPiiLeak('CPF do titular: 123.456.789-00', 'studio');

        expect(result).toBe('CPF do titular: [CPF OCULTADO]');
        expect(aiGuardrailEventCreate).toHaveBeenCalledWith({
            data: { type: 'pii_redacted', source: 'studio', organizationId: 'org-1' },
        });
    });

    it('PII detectada fora de um contexto de tenant conhecido: mascara mas não grava (sem dono para atribuir)', async () => {
        getTenantIdMock.mockReturnValue(null);

        const result = await redactAndTrackPiiLeak('CPF do titular: 123.456.789-00', 'agent.chat');

        expect(result).toBe('CPF do titular: [CPF OCULTADO]');
        expect(aiGuardrailEventCreate).not.toHaveBeenCalled();
    });

    it('a redação já aconteceu mesmo se a gravação do evento falhar (best-effort, não derruba a resposta)', async () => {
        getTenantIdMock.mockReturnValue('org-1');
        aiGuardrailEventCreate.mockRejectedValueOnce(new Error('DB indisponível'));

        const result = await redactAndTrackPiiLeak('CPF do titular: 123.456.789-00', 'commercial-intelligence');

        expect(result).toBe('CPF do titular: [CPF OCULTADO]');
    });
});

describe('hasPiiExternalConsent / assertPiiExternalConsent (base legal LGPD antes de enviar PII a provedor externo)', () => {
    afterEach(() => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
    });

    it('fail-closed: nenhuma organização tem consentimento por padrão (variável não configurada)', () => {
        expect(hasPiiExternalConsent('org-1')).toBe(false);
    });

    it('fail-closed: lista vazia não libera ninguém', () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '';
        expect(hasPiiExternalConsent('org-1')).toBe(false);
    });

    it('sem organizationId nunca tem consentimento, mesmo com "*"', () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '*';
        expect(hasPiiExternalConsent(null)).toBe(false);
        expect(hasPiiExternalConsent(undefined)).toBe(false);
    });

    it('libera apenas as organizações explicitamente listadas', () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1, org-2 ,, org-3';
        expect(hasPiiExternalConsent('org-1')).toBe(true);
        expect(hasPiiExternalConsent('org-2')).toBe(true);
        expect(hasPiiExternalConsent('org-4')).toBe(false);
    });

    it('"*" e "all" liberam qualquer organização', () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '*';
        expect(hasPiiExternalConsent('qualquer-org')).toBe(true);
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'all';
        expect(hasPiiExternalConsent('outra-org')).toBe(true);
    });

    it('assertPiiExternalConsent lança PiiConsentRequiredError quando não há base legal', () => {
        expect(() => assertPiiExternalConsent('org-sem-consentimento')).toThrow(PiiConsentRequiredError);
    });

    it('assertPiiExternalConsent não lança quando a organização está autorizada', () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        expect(() => assertPiiExternalConsent('org-1')).not.toThrow();
    });
});
