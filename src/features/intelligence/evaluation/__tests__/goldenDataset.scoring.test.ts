import { describe, expect, it } from 'vitest';
import { loadGoldenDataset } from '../goldenDataset.service.js';
import { evaluateGoldenDataset, scoreGoldenCase } from '../goldenDataset.scoring.js';

function idealOutput(goldenCase: any): unknown {
    switch (goldenCase.category) {
        case 'lead_qualification':
            return {
                status: goldenCase.expected.status,
                qualificationScore: Math.ceil(
                    (goldenCase.expected.minScore + goldenCase.expected.maxScore) / 2,
                ),
            };
        case 'cold_email':
        case 'objection_handling':
            return goldenCase.expected.referenceAnswer;
        case 'roleplay':
            return {
                clarity: (goldenCase.expected.minClarity + goldenCase.expected.maxClarity) / 2,
                objectionHandling: (goldenCase.expected.minObjectionHandling + goldenCase.expected.maxObjectionHandling) / 2,
            };
        case 'next_best_action':
            return {
                actionType: goldenCase.expected.actionType,
                priority: goldenCase.expected.priorityOneOf[0],
            };
        case 'summary':
            return {
                sentimentScore: goldenCase.expected.sentimentOneOf[0],
                actionItems: Array.from({ length: goldenCase.expected.minActionItems }, () => ({})),
            };
        case 'rag':
            return {
                sourceReferences: goldenCase.expected.expectedCitedChunkIds
                    .map((chunkId: string) => ({ chunkId })),
            };
        case 'tool_use':
            return {
                tool: goldenCase.expected.expectedTool,
                args: goldenCase.expected.expectedArgs,
            };
        default:
            throw new Error(`Categoria desconhecida: ${goldenCase.category}`);
    }
}

describe('Golden Dataset automatic scoring gate', () => {
    it('pontua os 24 casos e aprova uma baseline aderente', async () => {
        const dataset = loadGoldenDataset();
        const outputs = Object.fromEntries(
            dataset.cases.map((goldenCase) => [goldenCase.id, idealOutput(goldenCase)]),
        );
        const report = await evaluateGoldenDataset(outputs);

        expect(report.cases).toHaveLength(24);
        expect(report.passed).toBe(true);
        expect(report.overallScore).toBeGreaterThanOrEqual(report.thresholds.overallMinimum);
    });

    it('falha fechado quando resultados estão ausentes', async () => {
        const report = await evaluateGoldenDataset({});
        expect(report.passed).toBe(false);
        expect(report.cases.some((row) => !row.passed)).toBe(true);
    });

    it('usa juiz semântico e bloqueia risco alto de alucinação', async () => {
        const goldenCase = loadGoldenDataset().cases
            .find((row) => row.category === 'cold_email')!;
        const result = await scoreGoldenCase(
            goldenCase,
            idealOutput(goldenCase),
            {
                judge: async () => ({
                    semanticScore: 1,
                    factualityScore: 1,
                    playbookAdherenceScore: 1,
                    hallucinationRisk: 0.9,
                }),
            },
        );

        expect(result.passed).toBe(false);
        expect(result.reasons).toContain('risco de alucinação acima do limite');
    });

    it('mantém casos QUALIFIED coerentes com o threshold real do graph (>=70)', () => {
        const qualified = loadGoldenDataset().cases.filter(
            (row: any) => row.category === 'lead_qualification'
                && row.expected.status === 'QUALIFIED',
        ) as any[];
        expect(qualified.every((row) => row.expected.minScore >= 70)).toBe(true);
    });
});
