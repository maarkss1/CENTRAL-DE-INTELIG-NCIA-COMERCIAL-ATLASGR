/**
 * `computeFitScore` é o score de fit da prospecção — a missão da Onda 2 exige que ele seja
 * explicável ("não retornar 95/100 sem fatores rastreáveis") e que os sinais (situação cadastral,
 * porte/capital, aderência de CNAE, playbook comercial) fiquem separados e auditáveis, nunca um
 * número mágico.
 */
import { describe, it, expect } from 'vitest';
import { computeFitScore } from '../../../../../../src/features/prospecting/services/enrichment/fitScore.js';

describe('computeFitScore — explicabilidade', () => {
    it('nunca devolve um score sem breakdown rastreável', () => {
        const result = computeFitScore({});
        expect(result.breakdown).toBeDefined();
        expect(Array.isArray(result.breakdown)).toBe(true);
        // Score base de participação no funil é sempre explicado, mesmo com input vazio.
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('cada item do breakdown tem label, pontos e um detalhe legível — nunca um número solto', () => {
        const result = computeFitScore({
            situacaoCadastral: 'ATIVA',
            capitalSocial: 200_000,
            employeeCountEstimate: 60,
        });

        expect(result.breakdown.length).toBeGreaterThan(0);
        for (const item of result.breakdown) {
            expect(item.label).toEqual(expect.any(String));
            expect(item.label.length).toBeGreaterThan(0);
            expect(item.points).toEqual(expect.any(Number));
            expect(item.detail).toEqual(expect.any(String));
            expect(item.detail.length).toBeGreaterThan(0);
        }
    });

    it('soma dos pontos do breakdown explica a diferença em relação ao score base (25)', () => {
        const result = computeFitScore({
            situacaoCadastral: 'ATIVA',
            capitalSocial: 200_000,
            employeeCountEstimate: 60,
        });

        const breakdownSum = result.breakdown.reduce((acc, item) => acc + item.points, 0);
        expect(result.score).toBe(Math.max(0, Math.min(100, breakdownSum + 25)));
    });
});

describe('computeFitScore — sinais de risco cadastral (qualidade do dado / risco)', () => {
    it('penaliza fortemente CNPJ com situação cadastral diferente de ATIVA', () => {
        const ativo = computeFitScore({ situacaoCadastral: 'ATIVA' });
        const baixado = computeFitScore({ situacaoCadastral: 'BAIXADA' });

        expect(ativo.score).toBeGreaterThan(baixado.score);
        expect(baixado.breakdown.some((i) => i.points < 0)).toBe(true);
    });

    it('temperatura Frio para score baixo, Quente para score alto — nunca arbitrário', () => {
        const frio = computeFitScore({ situacaoCadastral: 'BAIXADA' });
        expect(frio.temperature).toBe('Frio');

        const quente = computeFitScore({
            situacaoCadastral: 'ATIVA',
            capitalSocial: 500_000,
            employeeCountEstimate: 100,
            fleetSizeHint: 'Acima de 50 veículos',
            state: 'RJ',
        });
        expect(quente.temperature).toBe('Quente');
    });
});

describe('computeFitScore — sinais firmográficos (porte/capital)', () => {
    it('dá mais pontos para porte/capital maiores, de forma monotônica', () => {
        const pequena = computeFitScore({ capitalSocial: 5_000, employeeCountEstimate: 3 });
        const media = computeFitScore({ capitalSocial: 50_000, employeeCountEstimate: 20 });
        const grande = computeFitScore({ capitalSocial: 500_000, employeeCountEstimate: 100 });

        expect(media.score).toBeGreaterThan(pequena.score);
        expect(grande.score).toBeGreaterThan(media.score);
    });
});

describe('computeFitScore — sinais de fit com o ICP (aderência de CNAE, playbook)', () => {
    it('bonifica quando o CNAE combina com as keywords do segmento buscado', () => {
        const semAderencia = computeFitScore({
            cnaeDescription: 'Comércio varejista de roupas',
            segmentKeywords: ['transporte rodoviário de carga'],
        });
        const comAderencia = computeFitScore({
            cnaeDescription: 'Transporte rodoviário de carga, exceto produtos perigosos',
            segmentKeywords: ['transporte rodoviário de carga'],
        });

        expect(comAderencia.score).toBeGreaterThan(semAderencia.score);
        expect(comAderencia.breakdown.some((i) => i.label === 'Aderência de CNAE ao ICP' && i.points > 0)).toBe(true);
    });

    it('bonifica frota grande e região de risco conforme o playbook comercial Atlas', () => {
        const base = computeFitScore({});
        const comFrotaERegiao = computeFitScore({ fleetSizeHint: 'Acima de 50 veículos', state: 'RJ' });

        expect(comFrotaERegiao.score).toBeGreaterThan(base.score);
        expect(comFrotaERegiao.breakdown.some((i) => i.label.includes('Frota'))).toBe(true);
        expect(comFrotaERegiao.breakdown.some((i) => i.label.includes('Região de risco'))).toBe(true);
    });
});
