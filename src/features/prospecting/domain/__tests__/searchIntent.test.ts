/**
 * CPI DEC-12 (opção A) — cobre `buildSearchIntent`: normaliza um `ProspectCriteria` bruto (o shape
 * livre-texto do formulário/rota) num `SearchIntent` tipado, sem depender de nenhum provider real.
 * Cada teste aqui espelha uma regra que já existia implícita em `prospecting.service.ts`/
 * `organizationSearch.ts` antes desta camada — a intenção é que a extração NÃO mude nenhum
 * comportamento observável, só nomeie e teste o que já era verdade.
 */
import { describe, it, expect } from 'vitest';
import { buildSearchIntent, MAX_LEADS_PER_SEARCH } from '../searchIntent.js';
import type { ProspectCriteriaLike } from '../searchIntent.js';

const baseCriteria: ProspectCriteriaLike = {
    segmento: 'Transportadora',
    localizacao: 'Rio de Janeiro e Região',
    quantidade: 20,
};

describe('buildSearchIntent — localização', () => {
    it('usa "Cidade, Estado" e marca isCitySpecific quando os dois foram informados', () => {
        const intent = buildSearchIntent({ ...baseCriteria, cidade: 'Niterói', estado: 'RJ' });
        expect(intent.location.label).toBe('Niterói, RJ');
        expect(intent.location.isCitySpecific).toBe(true);
    });

    it('usa só o estado (sem cidade específica) quando só o estado foi informado', () => {
        const intent = buildSearchIntent({ ...baseCriteria, estado: 'São Paulo' });
        expect(intent.location.label).toBe('São Paulo');
        expect(intent.location.isCitySpecific).toBe(false);
    });

    it('cai para a região ampla do playbook (localizacao) quando nem cidade nem estado foram informados', () => {
        const intent = buildSearchIntent(baseCriteria);
        expect(intent.location.label).toBe('Rio de Janeiro e Região');
        expect(intent.location.isCitySpecific).toBe(false);
    });

    it('normaliza localizacaoExcluir em lista (trim, sem vazios)', () => {
        const intent = buildSearchIntent({ ...baseCriteria, localizacaoExcluir: ' São Paulo ,, Minas Gerais ' });
        expect(intent.location.excluded).toEqual(['São Paulo', 'Minas Gerais']);
    });

    it('excluded fica vazio quando localizacaoExcluir não foi informado', () => {
        expect(buildSearchIntent(baseCriteria).location.excluded).toEqual([]);
    });
});

describe('buildSearchIntent — needsFirmographicFiltering', () => {
    it('true quando porte foi informado', () => {
        expect(buildSearchIntent({ ...baseCriteria, porte: '11,50' }).needsFirmographicFiltering).toBe(true);
    });

    it('true quando faturamento (anual ou mensal, min ou max) foi informado', () => {
        expect(buildSearchIntent({ ...baseCriteria, faturamentoMin: 100_000 }).needsFirmographicFiltering).toBe(true);
        expect(buildSearchIntent({ ...baseCriteria, faturamentoMax: 100_000 }).needsFirmographicFiltering).toBe(true);
        expect(buildSearchIntent({ ...baseCriteria, faturamentoMensalMin: 10_000 }).needsFirmographicFiltering).toBe(true);
        expect(buildSearchIntent({ ...baseCriteria, faturamentoMensalMax: 10_000 }).needsFirmographicFiltering).toBe(true);
    });

    it('true quando ano de fundação, tecnologia (incluir/excluir) ou capital aberto foram informados', () => {
        expect(buildSearchIntent({ ...baseCriteria, anoFundacaoMin: 2000 }).needsFirmographicFiltering).toBe(true);
        expect(buildSearchIntent({ ...baseCriteria, anoFundacaoMax: 2020 }).needsFirmographicFiltering).toBe(true);
        expect(buildSearchIntent({ ...baseCriteria, tecnologias: 'salesforce' }).needsFirmographicFiltering).toBe(true);
        expect(buildSearchIntent({ ...baseCriteria, tecnologiasExcluir: 'sap' }).needsFirmographicFiltering).toBe(true);
        expect(buildSearchIntent({ ...baseCriteria, apenasCapitalAberto: true }).needsFirmographicFiltering).toBe(true);
    });

    it('false quando nenhum filtro firmográfico estruturado foi informado', () => {
        expect(buildSearchIntent(baseCriteria).needsFirmographicFiltering).toBe(false);
    });

    it('technologiesInclude/technologiesExclude normalizadas em lista (trim, sem vazios)', () => {
        const intent = buildSearchIntent({ ...baseCriteria, tecnologias: ' salesforce ,aws,, ', tecnologiasExcluir: 'sap' });
        expect(intent.firmographics.technologiesInclude).toEqual(['salesforce', 'aws']);
        expect(intent.firmographics.technologiesExclude).toEqual(['sap']);
    });
});

describe('buildSearchIntent — decisorCargos / needsDecisionMakerContacts', () => {
    it('true quando ao menos um cargo-alvo de decisor foi informado', () => {
        const intent = buildSearchIntent({ ...baseCriteria, decisorCargos: ['Diretor de Logística'] });
        expect(intent.needsDecisionMakerContacts).toBe(true);
        expect(intent.decisionMakerTitles).toEqual(['Diretor de Logística']);
    });

    it('false quando decisorCargos está ausente ou vazio', () => {
        expect(buildSearchIntent(baseCriteria).needsDecisionMakerContacts).toBe(false);
        expect(buildSearchIntent({ ...baseCriteria, decisorCargos: [] }).needsDecisionMakerContacts).toBe(false);
    });
});

describe('buildSearchIntent — freeTextTerms', () => {
    it('combina icp, volume, palavrasChave (split por vírgula) e decisorCargos, sem entradas vazias', () => {
        const intent = buildSearchIntent({
            ...baseCriteria,
            icp: 'Embarcadores de e-commerce',
            volume: '50 cargas/mês',
            palavrasChave: 'refrigerado, frota própria,',
            decisorCargos: ['CEO', ' '],
        });
        expect(intent.freeTextTerms).toEqual([
            'Embarcadores de e-commerce',
            '50 cargas/mês',
            'refrigerado',
            'frota própria',
            'CEO',
        ]);
    });

    it('fica vazio quando nenhum termo livre foi informado', () => {
        expect(buildSearchIntent(baseCriteria).freeTextTerms).toEqual([]);
    });
});

describe('buildSearchIntent — quantityRequested', () => {
    it(`usa MAX_LEADS_PER_SEARCH (${MAX_LEADS_PER_SEARCH}) como default quando quantidade não foi informada`, () => {
        expect(buildSearchIntent({ ...baseCriteria, quantidade: undefined as unknown as number }).quantityRequested).toBe(
            MAX_LEADS_PER_SEARCH
        );
    });

    it('quantidade=0 é falsy — cai no mesmo default de "não informado" (MAX_LEADS_PER_SEARCH), igual ao `||` que já existia em prospecting.service.ts', () => {
        expect(buildSearchIntent({ ...baseCriteria, quantidade: 0 }).quantityRequested).toBe(MAX_LEADS_PER_SEARCH);
    });

    it('nunca fica abaixo de 1, mesmo com um valor negativo (defesa contra dado inválido — o schema Zod já barra isso antes, mas a função não deve confiar só nisso)', () => {
        expect(buildSearchIntent({ ...baseCriteria, quantidade: -5 }).quantityRequested).toBe(1);
    });

    it(`nunca ultrapassa MAX_LEADS_PER_SEARCH (${MAX_LEADS_PER_SEARCH}), mesmo com quantidade maior`, () => {
        expect(buildSearchIntent({ ...baseCriteria, quantidade: 999 }).quantityRequested).toBe(MAX_LEADS_PER_SEARCH);
    });

    it('preserva um valor válido dentro da faixa', () => {
        expect(buildSearchIntent({ ...baseCriteria, quantidade: 7 }).quantityRequested).toBe(7);
    });
});

describe('buildSearchIntent — demais campos', () => {
    it('companyName vem de nomeEmpresa (trim) ou undefined', () => {
        expect(buildSearchIntent({ ...baseCriteria, nomeEmpresa: '  Atlas Log  ' }).companyName).toBe('Atlas Log');
        expect(buildSearchIntent(baseCriteria).companyName).toBeUndefined();
    });

    it('excludeNames é repassado (ou lista vazia por padrão)', () => {
        expect(buildSearchIntent({ ...baseCriteria, excludeNames: ['Já Visto Ltda'] }).excludeNames).toEqual(['Já Visto Ltda']);
        expect(buildSearchIntent(baseCriteria).excludeNames).toEqual([]);
    });

    it('page é repassado como está (paginação do ranking Apollo)', () => {
        expect(buildSearchIntent({ ...baseCriteria, pagina: 3 }).page).toBe(3);
        expect(buildSearchIntent(baseCriteria).page).toBeUndefined();
    });
});
