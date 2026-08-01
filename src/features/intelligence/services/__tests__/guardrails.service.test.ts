import { describe, expect, it } from 'vitest';
import { minimizePii, rehydratePii, redactSensitiveData } from '../guardrails.service';

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
