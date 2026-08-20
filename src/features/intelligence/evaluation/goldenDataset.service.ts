import { z } from 'zod';
import goldenDatasetRaw from './golden-dataset.json';
import {
    goldenDatasetFileSchema,
    GOLDEN_CASE_CATEGORIES,
    type GoldenCase,
    type GoldenCaseCategory,
    type GoldenDatasetFile,
    type ToolUseGoldenCase,
} from './goldenDataset.types.js';

/**
 * AI-005 (onda 36): ponto único de leitura do Golden Dataset. Importa o JSON como módulo (não
 * `readFileSync`) de propósito — o build de produção (`Dockerfile`) só empacota `dist/`, nunca
 * `src/`, então um caminho de arquivo relativo ao código-fonte quebraria em produção; importar
 * como módulo faz o esbuild inlinar o conteúdo dentro de `dist/server.cjs` no build, o mesmo
 * artefato que de fato roda.
 *
 * Valida o arquivo inteiro contra `goldenDatasetFileSchema` no primeiro uso (memoizado) — um caso
 * malformado quebra alto e cedo, nunca silenciosamente vira `undefined` em algum consumidor.
 */

let cached: GoldenDatasetFile | null = null;

export function loadGoldenDataset(): GoldenDatasetFile {
    if (cached) return cached;
    cached = goldenDatasetFileSchema.parse(goldenDatasetRaw);
    return cached;
}

/** Só para testes: força a próxima chamada a revalidar o JSON do zero. */
export function __resetGoldenDatasetCacheForTests(): void {
    cached = null;
}

export function getCasesByCategory<C extends GoldenCaseCategory>(category: C): Extract<GoldenCase, { category: C }>[] {
    const dataset = loadGoldenDataset();
    return dataset.cases.filter((c): c is Extract<GoldenCase, { category: C }> => c.category === category);
}

export interface GoldenDatasetSummary {
    version: string;
    generatedAt: string;
    totalCases: number;
    countByCategory: Record<GoldenCaseCategory, number>;
}

export function getDatasetSummary(): GoldenDatasetSummary {
    const dataset = loadGoldenDataset();
    const countByCategory = Object.fromEntries(
        GOLDEN_CASE_CATEGORIES.map((category) => [category, 0]),
    ) as Record<GoldenCaseCategory, number>;
    for (const goldenCase of dataset.cases) {
        countByCategory[goldenCase.category] += 1;
    }
    return {
        version: dataset.version,
        generatedAt: dataset.generatedAt,
        totalCases: dataset.cases.length,
        countByCategory,
    };
}

export interface ToolUseValidationResult {
    caseId: string;
    valid: boolean;
    /** Presente só quando `valid` é `false` — o erro real do Zod da ferramenta, não uma mensagem genérica. */
    error?: string;
}

/**
 * Valida `expected.expectedArgs` de cada caso `tool_use` contra o schema Zod REAL da ferramenta
 * correspondente (importado de `src/features/intelligence/tools/*.ts`, o mesmo schema que o
 * LangGraph usa para validar uma chamada de ferramenta de verdade) — não uma cópia solta do
 * formato. Um caso cujo `expectedArgs` não bateria com o que a ferramenta de produção aceitaria é
 * um caso quebrado do dataset, não um caso "difícil" — este é o tipo de erro que este validador
 * existe para pegar antes que o dataset seja usado por um harness de scoring futuro.
 *
 * Import dinâmico de propósito: os módulos de ferramenta importam `prisma`/`getTenantId`/etc.
 * (dependências pesadas de runtime) que não fazem sentido carregar em todo lugar que só lê o
 * dataset (`getCasesByCategory`/`getDatasetSummary`) — só quem precisa validar tool_use paga esse
 * custo de import.
 */
export async function validateToolUseCases(): Promise<ToolUseValidationResult[]> {
    const cases = getCasesByCategory('tool_use') as ToolUseGoldenCase[];
    const schemasByTool = await loadToolSchemas();

    return cases.map((goldenCase) => {
        const schema = schemasByTool[goldenCase.expected.expectedTool];
        const result = schema.safeParse(goldenCase.expected.expectedArgs);
        if (result.success) return { caseId: goldenCase.id, valid: true };
        return { caseId: goldenCase.id, valid: false, error: z.prettifyError(result.error) };
    });
}

async function loadToolSchemas(): Promise<Record<ToolUseGoldenCase['expected']['expectedTool'], z.ZodTypeAny>> {
    const [crmTools, opsTools, marketResearchTool, playbookTool, summarizeLeadTool, copywriterTool] = await Promise.all([
        import('../tools/crmTools.js'),
        import('../tools/opsTools.js'),
        import('../tools/marketResearchTool.js'),
        import('../tools/playbookTool.js'),
        import('../tools/summarizeLeadTool.js'),
        import('../tools/copywriterTool.js'),
    ]);

    return {
        search_leads: crmTools.searchLeadsTool.schema,
        get_lead_context: crmTools.getLeadContextTool.schema,
        update_lead_qualification: crmTools.updateLeadQualificationTool.schema,
        create_follow_up_task: opsTools.createFollowUpTaskTool.schema,
        notify_team: opsTools.notifyTeamTool.schema,
        market_research: marketResearchTool.marketResearchTool.schema,
        search_playbook: playbookTool.searchPlaybookTool.schema,
        summarize_lead_history: summarizeLeadTool.summarizeLeadTool.schema,
        generate_cold_email_copy: copywriterTool.copywriterTool.schema,
    };
}
