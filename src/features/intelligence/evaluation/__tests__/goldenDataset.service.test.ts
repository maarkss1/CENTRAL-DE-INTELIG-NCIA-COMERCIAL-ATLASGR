import { afterEach, describe, expect, it } from 'vitest';
import {
    loadGoldenDataset,
    getCasesByCategory,
    getDatasetSummary,
    validateToolUseCases,
    __resetGoldenDatasetCacheForTests,
} from '../goldenDataset.service.js';
import { GOLDEN_CASE_CATEGORIES, goldenDatasetFileSchema } from '../goldenDataset.types.js';
import { updateLeadQualificationTool } from '../../tools/crmTools.js';

/**
 * AI-005 (onda 36): prova que o Golden Dataset real (`golden-dataset.json`) é estruturalmente
 * válido — schema correto, todas as 8 categorias cobertas, e (o teste mais forte) cada caso
 * `tool_use` bate com o schema Zod REAL da ferramenta de produção correspondente, não uma cópia
 * solta do formato.
 */
afterEach(() => {
    __resetGoldenDatasetCacheForTests();
});

describe('loadGoldenDataset', () => {
    it('carrega e valida o dataset real sem lançar', () => {
        const dataset = loadGoldenDataset();
        expect(dataset.version).toBeTruthy();
        expect(dataset.cases.length).toBeGreaterThan(0);
    });

    it('memoiza — chamadas repetidas devolvem a mesma referência sem revalidar', () => {
        const first = loadGoldenDataset();
        const second = loadGoldenDataset();
        expect(second).toBe(first);
    });
});

describe('getCasesByCategory', () => {
    it('devolve só os casos da categoria pedida, com todas as 8 categorias cobertas por pelo menos 1 caso', () => {
        for (const category of GOLDEN_CASE_CATEGORIES) {
            const cases = getCasesByCategory(category);
            expect(cases.length).toBeGreaterThan(0);
            expect(cases.every((c) => c.category === category)).toBe(true);
        }
    });

    it('o discriminated union narrowing funciona — casos tool_use têm expected.expectedTool', () => {
        const cases = getCasesByCategory('tool_use');
        for (const c of cases) {
            expect(typeof c.expected.expectedTool).toBe('string');
        }
    });
});

describe('getDatasetSummary', () => {
    it('countByCategory soma exatamente totalCases, com as 8 categorias presentes', () => {
        const summary = getDatasetSummary();
        const sum = Object.values(summary.countByCategory).reduce((total, count) => total + count, 0);

        expect(sum).toBe(summary.totalCases);
        expect(Object.keys(summary.countByCategory).sort()).toEqual([...GOLDEN_CASE_CATEGORIES].sort());
        for (const category of GOLDEN_CASE_CATEGORIES) {
            expect(summary.countByCategory[category]).toBeGreaterThan(0);
        }
    });
});

describe('validateToolUseCases — cada caso bate com o schema Zod REAL da ferramenta de produção', () => {
    it('todos os casos tool_use do dataset real validam contra o schema real da ferramenta correspondente', async () => {
        const results = await validateToolUseCases();

        expect(results.length).toBeGreaterThan(0);
        for (const result of results) {
            expect(result.valid, `${result.caseId}: ${result.error}`).toBe(true);
        }
    });
});

describe('goldenDatasetFileSchema — rejeita arquivo malformado (prova que a validação é real, não decorativa)', () => {
    it('rejeita quando falta a versão', () => {
        const result = goldenDatasetFileSchema.safeParse({ generatedAt: '2026-01-01', cases: [] });
        expect(result.success).toBe(false);
    });

    it('rejeita um caso com category inexistente', () => {
        const result = goldenDatasetFileSchema.safeParse({
            version: '1', generatedAt: '2026-01-01',
            cases: [{ id: 'x', description: 'x', category: 'categoria_que_nao_existe', input: {}, expected: {} }],
        });
        expect(result.success).toBe(false);
    });

    it('rejeita um caso tool_use com expectedTool fora da lista real de ferramentas', () => {
        const result = goldenDatasetFileSchema.safeParse({
            version: '1', generatedAt: '2026-01-01',
            cases: [{
                id: 'x', description: 'x', category: 'tool_use',
                input: { scenario: 'x' },
                expected: { expectedTool: 'ferramenta_inventada', expectedArgs: {} },
            }],
        });
        expect(result.success).toBe(false);
    });
});

describe('schema real da ferramenta rejeita args inválidos (prova que a validação não é cosmética)', () => {
    it('update_lead_qualification.schema rejeita um status fora do enum real', () => {
        const result = updateLeadQualificationTool.schema.safeParse({
            leadId: 'lead-1', score: 50, summary: 'x', status: 'Status_Que_Nao_Existe',
        });
        expect(result.success).toBe(false);
    });

    it('update_lead_qualification.schema aceita um status real', () => {
        const result = updateLeadQualificationTool.schema.safeParse({
            leadId: 'lead-1', score: 50, summary: 'x', status: 'Qualificacao_SDR',
        });
        expect(result.success).toBe(true);
    });
});
