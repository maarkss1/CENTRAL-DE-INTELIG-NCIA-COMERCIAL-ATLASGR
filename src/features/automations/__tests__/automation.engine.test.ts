import { describe, it, expect } from 'vitest';
import { renderTemplate, matchesConditions } from '../automation.engine';

describe('renderTemplate', () => {
    it('substitui o placeholder pelo valor do evento', () => {
        expect(renderTemplate('Lead {{status}} atualizado', { status: 'Proposta' }))
            .toBe('Lead Proposta atualizado');
    });

    it('tolera espaços dentro das chaves', () => {
        expect(renderTemplate('{{ owner }} assumiu', { owner: 'Marcelo' })).toBe('Marcelo assumiu');
    });

    it('remove placeholder sem valor em vez de vazar a sintaxe crua', () => {
        expect(renderTemplate('Lead {{inexistente}} movido', {})).toBe('Lead movido');
    });

    it('trata null e undefined como ausentes', () => {
        expect(renderTemplate('a {{x}} b', { x: null })).toBe('a b');
        expect(renderTemplate('a {{x}} b', { x: undefined })).toBe('a b');
    });

    it('converte números e booleanos para texto', () => {
        expect(renderTemplate('score {{score}}', { score: 87 })).toBe('score 87');
    });

    it('substitui todas as ocorrências', () => {
        expect(renderTemplate('{{n}} e {{n}}', { n: 'x' })).toBe('x e x');
    });
});

describe('matchesConditions', () => {
    const data = { status: 'Proposta', owner: 'Marcelo', score: 80 };

    it('sem condições, dispara sempre', () => {
        expect(matchesConditions(null, data)).toBe(true);
        expect(matchesConditions(undefined, data)).toBe(true);
    });

    it('objeto vazio significa sem filtro, não "nunca casa"', () => {
        expect(matchesConditions({}, data)).toBe(true);
    });

    it('casa quando todos os campos batem', () => {
        expect(matchesConditions({ status: 'Proposta', owner: 'Marcelo' }, data)).toBe(true);
    });

    it('não casa se qualquer campo diverge', () => {
        expect(matchesConditions({ status: 'Proposta', owner: 'Outro' }, data)).toBe(false);
    });

    it('não casa quando o campo exigido não existe no evento', () => {
        expect(matchesConditions({ temperature: 'Quente' }, data)).toBe(false);
    });

    it('compara como texto, para o JSON do banco não divergir de números e enums', () => {
        expect(matchesConditions({ score: '80' }, data)).toBe(true);
    });

    it('ignora condição de valor vazio, tratando-a como "qualquer"', () => {
        expect(matchesConditions({ status: '', owner: 'Marcelo' }, data)).toBe(true);
    });

    it('ignora condições que não são objeto', () => {
        expect(matchesConditions('lixo', data)).toBe(true);
        expect(matchesConditions([1, 2], data)).toBe(true);
    });
});

describe('matchesConditions — operador numérico (regras de estagnação)', () => {
    it('gte: casa quando o valor real é maior ou igual ao limiar', () => {
        expect(matchesConditions({ daysSinceLastInteraction: { gte: 3 } }, { daysSinceLastInteraction: 3 })).toBe(true);
        expect(matchesConditions({ daysSinceLastInteraction: { gte: 3 } }, { daysSinceLastInteraction: 10 })).toBe(true);
        expect(matchesConditions({ daysSinceLastInteraction: { gte: 3 } }, { daysSinceLastInteraction: 2 })).toBe(false);
    });

    it('lte/gt/lt também são suportados', () => {
        expect(matchesConditions({ score: { lte: 50 } }, { score: 40 })).toBe(true);
        expect(matchesConditions({ score: { lte: 50 } }, { score: 60 })).toBe(false);
        expect(matchesConditions({ score: { gt: 50 } }, { score: 51 })).toBe(true);
        expect(matchesConditions({ score: { gt: 50 } }, { score: 50 })).toBe(false);
        expect(matchesConditions({ score: { lt: 50 } }, { score: 49 })).toBe(true);
        expect(matchesConditions({ score: { lt: 50 } }, { score: 50 })).toBe(false);
    });

    it('não casa quando o campo derivado não está presente no evento — impede que um evento em tempo real dispare uma regra de estagnação por engano', () => {
        // Uma transição real de status nunca preenche `daysSinceLastInteraction` — só o scanner
        // periódico (stagnation-scanner.service.ts) preenche esse campo.
        expect(matchesConditions({ daysSinceLastInteraction: { gte: 3 } }, { status: 'Proposta Enviada' })).toBe(false);
    });

    it('não casa quando o valor real não é numérico', () => {
        expect(matchesConditions({ score: { gte: 3 } }, { score: 'muito' })).toBe(false);
    });

    it('combina operador numérico com igualdade simples no mesmo objeto de condições (AND)', () => {
        const conditions = { status: 'Proposta Enviada', daysSinceLastInteraction: { gte: 3 } };
        expect(matchesConditions(conditions, { status: 'Proposta Enviada', daysSinceLastInteraction: 5 })).toBe(true);
        expect(matchesConditions(conditions, { status: 'Outra Etapa', daysSinceLastInteraction: 5 })).toBe(false);
    });

    it('um objeto com mais de uma chave, ou uma chave desconhecida, não é tratado como operador (permanece igualdade estrita e nunca casa)', () => {
        expect(matchesConditions({ score: { gte: 1, lte: 2 } }, { score: 1 })).toBe(false);
        expect(matchesConditions({ score: { unknown: 1 } }, { score: 1 })).toBe(false);
    });
});
