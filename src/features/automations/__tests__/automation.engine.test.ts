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
