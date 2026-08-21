import { loadGoldenDataset } from './goldenDataset.service.js';
import type { GoldenCase, GoldenCaseCategory } from './goldenDataset.types.js';

export interface SemanticJudgeResult {
    semanticScore: number;
    factualityScore: number;
    playbookAdherenceScore: number;
    hallucinationRisk: number;
    rationale?: string;
}

export interface GoldenSemanticJudge {
    judge(input: { goldenCase: GoldenCase; actual: unknown }): Promise<SemanticJudgeResult>;
}

export interface GoldenEvaluationThresholds {
    caseMinimum: number;
    categoryMinimum: number;
    overallMinimum: number;
    maxHallucinationRisk: number;
}

/** Política inicial explícita e versionada. Não há threshold escondido no prompt do juiz. */
export const DEFAULT_GOLDEN_THRESHOLDS: GoldenEvaluationThresholds = {
    caseMinimum: 0.55,
    categoryMinimum: 0.70,
    overallMinimum: 0.78,
    maxHallucinationRisk: 0.35,
};

export interface GoldenCaseEvaluation {
    caseId: string;
    category: GoldenCaseCategory;
    deterministicScore: number;
    judge?: SemanticJudgeResult;
    finalScore: number;
    passed: boolean;
    reasons: string[];
}

export interface GoldenDatasetEvaluation {
    version: string;
    overallScore: number;
    categoryScores: Record<GoldenCaseCategory, number>;
    cases: GoldenCaseEvaluation[];
    passed: boolean;
    thresholds: GoldenEvaluationThresholds;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const normalize = (value: unknown): string => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const tokens = (value: unknown): Set<string> => new Set(normalize(value).match(/[a-z0-9]{3,}/g) ?? []);

function jaccard(a: unknown, b: unknown): number {
    const left = tokens(a);
    const right = tokens(b);
    if (left.size === 0 && right.size === 0) return 1;
    const intersection = [...left].filter((token) => right.has(token)).length;
    const union = new Set([...left, ...right]).size;
    return union === 0 ? 0 : intersection / union;
}

function textOf(actual: unknown): string {
    if (typeof actual === 'string') return actual;
    if (actual && typeof actual === 'object') {
        const obj = actual as Record<string, unknown>;
        return String(
            obj.text ??
            obj.content ??
            obj.answer ??
            obj.directAnswer ??
            obj.personaReply ??
            obj.executiveSummary ??
            '',
        );
    }
    return '';
}

/** Mede quanto de `expected` está contido em `actual`, sem exigir campos extras idênticos. */
function deepSubset(expected: unknown, actual: unknown): number {
    if (expected === null || typeof expected !== 'object') return Object.is(expected, actual) ? 1 : 0;

    if (Array.isArray(expected)) {
        if (!Array.isArray(actual)) return 0;
        if (expected.length === 0) return 1;
        const matched = expected.filter((item) =>
            actual.some((candidate) => deepSubset(item, candidate) === 1),
        ).length;
        return matched / expected.length;
    }

    if (!actual || typeof actual !== 'object') return 0;
    const entries = Object.entries(expected as Record<string, unknown>);
    if (entries.length === 0) return 1;

    return entries.reduce(
        (sum, [key, value]) => sum + deepSubset(value, (actual as Record<string, unknown>)[key]),
        0,
    ) / entries.length;
}

function deterministicScore(
    goldenCase: GoldenCase,
    actual: unknown,
): { score: number; reasons: string[] } {
    const obj = (actual && typeof actual === 'object' ? actual : {}) as Record<string, any>;
    const reasons: string[] = [];

    switch (goldenCase.category) {
        case 'lead_qualification': {
            const score = Number(obj.qualificationScore ?? obj.score);
            const statusOk = obj.status === goldenCase.expected.status;
            const rangeOk = Number.isFinite(score)
                && score >= goldenCase.expected.minScore
                && score <= goldenCase.expected.maxScore;
            if (!statusOk) reasons.push(`status esperado ${goldenCase.expected.status}`);
            if (!rangeOk) reasons.push(`score fora de ${goldenCase.expected.minScore}-${goldenCase.expected.maxScore}`);
            return { score: (Number(statusOk) + Number(rangeOk)) / 2, reasons };
        }

        case 'cold_email': {
            const text = normalize(textOf(actual));
            const keywordCoverage = goldenCase.expected.mustMentionKeywords
                .filter((keyword) => text.includes(normalize(keyword))).length
                / goldenCase.expected.mustMentionKeywords.length;
            const similarity = jaccard(text, goldenCase.expected.referenceAnswer);
            if (keywordCoverage < 1) reasons.push('palavras-chave obrigatórias ausentes');
            return { score: clamp01(keywordCoverage * 0.7 + similarity * 0.3), reasons };
        }

        case 'objection_handling': {
            const text = normalize(textOf(actual));
            const strategyCoverage = goldenCase.expected.mustAddressStrategies
                .filter((strategy) => text.includes(normalize(strategy))).length
                / goldenCase.expected.mustAddressStrategies.length;
            const similarity = jaccard(text, goldenCase.expected.referenceAnswer);
            if (strategyCoverage < 1) reasons.push('estratégias obrigatórias ausentes');
            return { score: clamp01(strategyCoverage * 0.75 + similarity * 0.25), reasons };
        }

        case 'roleplay': {
            const clarity = Number(obj.clarity);
            const objectionHandling = Number(obj.objectionHandling);
            const clarityOk = Number.isFinite(clarity)
                && clarity >= goldenCase.expected.minClarity
                && clarity <= goldenCase.expected.maxClarity;
            const objectionHandlingOk = Number.isFinite(objectionHandling)
                && objectionHandling >= goldenCase.expected.minObjectionHandling
                && objectionHandling <= goldenCase.expected.maxObjectionHandling;
            if (!clarityOk) reasons.push('clarity fora da faixa aceita');
            if (!objectionHandlingOk) reasons.push('objectionHandling fora da faixa aceita');
            return {
                score: Number(clarityOk) * 0.5 + Number(objectionHandlingOk) * 0.5,
                reasons,
            };
        }

        case 'next_best_action': {
            const actionOk = obj.actionType === goldenCase.expected.actionType;
            const priorityOk = goldenCase.expected.priorityOneOf.includes(obj.priority);
            if (!actionOk) reasons.push('actionType divergente');
            if (!priorityOk) reasons.push('priority fora do conjunto aceito');
            return { score: Number(actionOk) * 0.7 + Number(priorityOk) * 0.3, reasons };
        }

        case 'summary': {
            const sentimentOk = goldenCase.expected.sentimentOneOf.includes(obj.sentimentScore ?? obj.sentiment);
            const actionCount = Array.isArray(obj.actionItems) ? obj.actionItems.length : 0;
            const actionsOk = actionCount >= goldenCase.expected.minActionItems;
            if (!sentimentOk) reasons.push('sentimento divergente');
            if (!actionsOk) reasons.push('actionItems insuficientes');
            return { score: Number(sentimentOk) * 0.6 + Number(actionsOk) * 0.4, reasons };
        }

        case 'rag': {
            const actualIds: string[] = Array.isArray(obj.citedChunkIds)
                ? obj.citedChunkIds
                : Array.isArray(obj.sourceReferences)
                    ? obj.sourceReferences.map((ref: any) => ref?.chunkId).filter(Boolean)
                    : [];
            const expected = new Set(goldenCase.expected.expectedCitedChunkIds);
            const actualSet = new Set(actualIds);

            if (expected.size === 0) {
                return {
                    score: actualSet.size === 0 ? 1 : 0,
                    reasons: actualSet.size > 0 ? ['citação não esperada'] : [],
                };
            }

            const truePositive = [...expected].filter((id) => actualSet.has(id)).length;
            const precision = actualSet.size > 0 ? truePositive / actualSet.size : 0;
            const recall = truePositive / expected.size;
            const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
            if (f1 < 1) reasons.push('citações divergentes');
            return { score: f1, reasons };
        }

        case 'tool_use': {
            const tool = obj.tool ?? obj.toolName ?? obj.name;
            const args = obj.args ?? obj.arguments ?? {};
            const toolOk = tool === goldenCase.expected.expectedTool;
            const argsScore = deepSubset(goldenCase.expected.expectedArgs, args);
            if (!toolOk) reasons.push('ferramenta selecionada divergente');
            if (argsScore < 1) reasons.push('argumentos divergentes');
            return { score: Number(toolOk) * 0.7 + argsScore * 0.3, reasons };
        }
    }
}

export async function scoreGoldenCase(
    goldenCase: GoldenCase,
    actual: unknown,
    judge?: GoldenSemanticJudge,
    thresholds: GoldenEvaluationThresholds = DEFAULT_GOLDEN_THRESHOLDS,
): Promise<GoldenCaseEvaluation> {
    const deterministic = deterministicScore(goldenCase, actual);
    let semantic: SemanticJudgeResult | undefined;

    if (judge && ['cold_email', 'objection_handling', 'summary', 'rag'].includes(goldenCase.category)) {
        semantic = await judge.judge({ goldenCase, actual });
    }

    const judgeQuality = semantic
        ? (
            clamp01(semantic.semanticScore)
            + clamp01(semantic.factualityScore)
            + clamp01(semantic.playbookAdherenceScore)
            + (1 - clamp01(semantic.hallucinationRisk))
        ) / 4
        : null;

    const finalScore = clamp01(
        judgeQuality == null
            ? deterministic.score
            : deterministic.score * 0.6 + judgeQuality * 0.4,
    );
    const hallucinationOk = !semantic || semantic.hallucinationRisk <= thresholds.maxHallucinationRisk;
    const reasons = [...deterministic.reasons];
    if (!hallucinationOk) reasons.push('risco de alucinação acima do limite');

    return {
        caseId: goldenCase.id,
        category: goldenCase.category,
        deterministicScore: deterministic.score,
        judge: semantic,
        finalScore,
        passed: finalScore >= thresholds.caseMinimum && hallucinationOk,
        reasons,
    };
}

export async function evaluateGoldenDataset(
    observedByCaseId: Record<string, unknown>,
    options: { judge?: GoldenSemanticJudge; thresholds?: Partial<GoldenEvaluationThresholds> } = {},
): Promise<GoldenDatasetEvaluation> {
    const dataset = loadGoldenDataset();
    const thresholds = { ...DEFAULT_GOLDEN_THRESHOLDS, ...options.thresholds };
    const cases: GoldenCaseEvaluation[] = [];

    for (const goldenCase of dataset.cases) {
        cases.push(
            await scoreGoldenCase(goldenCase, observedByCaseId[goldenCase.id], options.judge, thresholds),
        );
    }

    const categories = [...new Set(dataset.cases.map((goldenCase) => goldenCase.category))];
    const categoryScores = Object.fromEntries(
        categories.map((category) => {
            const rows = cases.filter((row) => row.category === category);
            const score = rows.reduce((sum, row) => sum + row.finalScore, 0) / rows.length;
            return [category, score];
        }),
    ) as Record<GoldenCaseCategory, number>;

    const overallScore = cases.reduce((sum, row) => sum + row.finalScore, 0) / cases.length;
    const passed = overallScore >= thresholds.overallMinimum
        && Object.values(categoryScores).every((score) => score >= thresholds.categoryMinimum)
        && cases.every((row) => row.passed);

    return {
        version: dataset.version,
        overallScore,
        categoryScores,
        cases,
        passed,
        thresholds,
    };
}
