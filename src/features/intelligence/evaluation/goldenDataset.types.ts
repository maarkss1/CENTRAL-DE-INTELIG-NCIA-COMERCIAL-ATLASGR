import { z } from 'zod';

/**
 * AI-005 (onda 36): schema do Golden Dataset — conjunto real e versionado de casos de teste para
 * as 8 capacidades de IA listadas em `SPRINT-07-IA-ENXAME-EVALUATION.md`. Cada categoria tem seu
 * próprio `input`/`expected` ancorado no tipo real que a capacidade correspondente já usa em
 * produção (não um formato genérico inventado) — ver `docs/AI-SWARM-GOVERNANCE-AUDIT.md`, seção
 * "AI-005 — Golden Dataset real e versionado (onda 36)", para a tabela categoria → serviço real.
 *
 * O scoring automático vive em `goldenDataset.scoring.ts`: checks determinísticos por categoria,
 * thresholds por caso/categoria/geral e um SemanticJudge opcional para factualidade, aderência ao
 * playbook e risco de alucinação. O gate determinístico roda sempre no CI; o live runner usa as
 * capacidades reais e pode acoplar o LLM judge quando um provedor de IA está configurado.
 * Este arquivo continua garantindo que cada caso é ESTRUTURALMENTE válido: os campos `expected` usam os
 * mesmos enums/tipos reais que os serviços de produção aceitam, verificado em runtime por
 * `goldenDataset.service.ts` (inclusive contra os schemas Zod reais das 9 ferramentas do enxame,
 * para a categoria `tool_use`).
 */

export const GOLDEN_CASE_CATEGORIES = [
    'lead_qualification',
    'cold_email',
    'objection_handling',
    'roleplay',
    'next_best_action',
    'summary',
    'rag',
    'tool_use',
] as const;

export type GoldenCaseCategory = (typeof GOLDEN_CASE_CATEGORIES)[number];

const baseCaseFields = {
    id: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
};

/** `AIService.qualifyLead(leadId, companyInfo)` — src/features/intelligence/services/ai.service.ts */
const leadQualificationCaseSchema = z.object({
    ...baseCaseFields,
    category: z.literal('lead_qualification'),
    input: z.object({
        leadId: z.string().min(1),
        companyInfo: z.string().min(1),
    }),
    expected: z.object({
        // Faixa de score, não um valor exato — a análise é gerada por LLM, não determinística.
        status: z.enum(['QUALIFIED', 'UNQUALIFIED']),
        minScore: z.number().min(0).max(100),
        maxScore: z.number().min(0).max(100),
    }),
});

/** `generateEmailDraft(context, goal)` — src/lib/ai/features.ts (pura, sem dependência de Lead real) */
const coldEmailCaseSchema = z.object({
    ...baseCaseFields,
    category: z.literal('cold_email'),
    input: z.object({
        context: z.string().min(1),
        goal: z.string().min(1),
    }),
    expected: z.object({
        mustMentionKeywords: z.array(z.string().min(1)).min(1),
        /** Exemplo de boa resposta — referência para um futuro juiz semântico, não comparação automática hoje. */
        referenceAnswer: z.string().min(1),
    }),
});

/** `generateObjectionHandling(objection)` — src/lib/ai/features.ts */
const objectionHandlingCaseSchema = z.object({
    ...baseCaseFields,
    category: z.literal('objection_handling'),
    input: z.object({
        objection: z.string().min(1),
    }),
    expected: z.object({
        // O próprio prompt de produção pede exatamente estas 3 estratégias — enum real, não inventado.
        mustAddressStrategies: z.array(z.enum(['Reframe', 'Pivot', 'Case Study'])).min(1),
        referenceAnswer: z.string().min(1),
    }),
});

/** `generateRoleplay(request: Extract<StudioGenerationRequest,{kind:'roleplay'}>)` — src/features/intelligence/services/studio/generators/roleplay.ts (motor real usado pela tela /roleplay) */
const roleplayCaseSchema = z.object({
    ...baseCaseFields,
    category: z.literal('roleplay'),
    input: z.object({
        brand: z.object({ name: z.string().min(1), description: z.string().min(1) }),
        inputs: z.object({
            persona: z.enum(['skeptical_cfo', 'strict_buyer', 'tech_director']),
            message: z.string().min(1),
            transcript: z.array(z.object({ sender: z.enum(['sdr', 'buyer']), text: z.string() })),
            playbookContext: z.string().optional(),
        }),
    }),
    expected: z.object({
        minClarity: z.number().min(0).max(100),
        maxClarity: z.number().min(0).max(100),
        minObjectionHandling: z.number().min(0).max(100),
        maxObjectionHandling: z.number().min(0).max(100),
    }),
});

/** `NextBestActionService.determineNextAction(input: MeetingOrCallNote)` */
const nextBestActionCaseSchema = z.object({
    ...baseCaseFields,
    category: z.literal('next_best_action'),
    input: z.object({
        leadOrClientName: z.string().min(1),
        stage: z.string().min(1),
        rawNote: z.string().min(1),
        salesRepName: z.string().optional(),
    }),
    expected: z.object({
        // Enum real de NextBestActionResult.actionType — não inventado.
        actionType: z.enum(['task', 'meeting', 'email', 'whatsapp', 'proposal_revision', 'escalation']),
        priorityOneOf: z.array(z.enum(['Alta', 'Média', 'Baixa'])).min(1),
    }),
});

/** `MeetingSynthesisService.synthesizeMeeting(input: MeetingTranscriptInput)` */
const summaryCaseSchema = z.object({
    ...baseCaseFields,
    category: z.literal('summary'),
    input: z.object({
        meetingTitle: z.string().min(1),
        participants: z.array(z.string().min(1)).min(1),
        rawTranscript: z.string().min(1),
        dealName: z.string().optional(),
    }),
    expected: z.object({
        // Enum real de MeetingSynthesisOutput.sentimentScore.
        sentimentOneOf: z.array(z.enum(['Muito Positivo', 'Positivo', 'Neutro / Cauteloso', 'Negativo'])).min(1),
        minActionItems: z.number().min(0),
    }),
});

/** `SearchHit` — src/features/knowledge/search.service.ts (formato real do resultado de hybridSearch) */
const searchHitFixtureSchema = z.object({
    chunkId: z.string().min(1),
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
    content: z.string().min(1),
    chunkIndex: z.number().int().min(0),
    matchedBy: z.array(z.enum(['semantic', 'keyword'])),
    similarity: z.number().min(0).max(1).nullable(),
    score: z.number(),
});

/** `KnowledgeCopilotService.answerTechnicalQuestion({question, hits})` — src/features/knowledge/services/knowledge-copilot.service.ts */
const ragCaseSchema = z.object({
    ...baseCaseFields,
    category: z.literal('rag'),
    input: z.object({
        question: z.string().min(1),
        // Hits fornecidos diretamente (não busca real) — o caso testa o copiloto, não o retrieval.
        hits: z.array(searchHitFixtureSchema),
    }),
    expected: z.object({
        // Array vazio é um caso legítimo: "nenhum hit relevante, não deveria citar nada".
        expectedCitedChunkIds: z.array(z.string().min(1)),
    }),
});

/**
 * As 9 ferramentas reais do enxame (classificação completa em
 * `.agents/completion/02-mapa-plataforma.md`) — `expectedTool` só aceita um nome que existe de
 * verdade, e `goldenDataset.service.ts` valida `expectedArgs` contra o schema Zod REAL de cada
 * ferramenta (importado de `src/features/intelligence/tools/*.ts`), não uma cópia solta.
 */
export const GOLDEN_TOOL_NAMES = [
    'search_leads',
    'get_lead_context',
    'update_lead_qualification',
    'create_follow_up_task',
    'notify_team',
    'market_research',
    'search_playbook',
    'summarize_lead_history',
    'generate_cold_email_copy',
] as const;

const toolUseCaseSchema = z.object({
    ...baseCaseFields,
    category: z.literal('tool_use'),
    input: z.object({
        scenario: z.string().min(1),
    }),
    expected: z.object({
        expectedTool: z.enum(GOLDEN_TOOL_NAMES),
        // Validado em runtime contra o schema Zod real da ferramenta (não checado aqui — z.record
        // não sabe qual ferramenta é até o discriminated union já ter resolvido `expectedTool`).
        expectedArgs: z.record(z.string(), z.unknown()),
    }),
});

export const goldenCaseSchema = z.discriminatedUnion('category', [
    leadQualificationCaseSchema,
    coldEmailCaseSchema,
    objectionHandlingCaseSchema,
    roleplayCaseSchema,
    nextBestActionCaseSchema,
    summaryCaseSchema,
    ragCaseSchema,
    toolUseCaseSchema,
]);

export type GoldenCase = z.infer<typeof goldenCaseSchema>;
export type LeadQualificationGoldenCase = z.infer<typeof leadQualificationCaseSchema>;
export type ColdEmailGoldenCase = z.infer<typeof coldEmailCaseSchema>;
export type ObjectionHandlingGoldenCase = z.infer<typeof objectionHandlingCaseSchema>;
export type RoleplayGoldenCase = z.infer<typeof roleplayCaseSchema>;
export type NextBestActionGoldenCase = z.infer<typeof nextBestActionCaseSchema>;
export type SummaryGoldenCase = z.infer<typeof summaryCaseSchema>;
export type RagGoldenCase = z.infer<typeof ragCaseSchema>;
export type ToolUseGoldenCase = z.infer<typeof toolUseCaseSchema>;

export const goldenDatasetFileSchema = z.object({
    version: z.string().min(1),
    generatedAt: z.string().min(1),
    cases: z.array(goldenCaseSchema).min(1),
});

export type GoldenDatasetFile = z.infer<typeof goldenDatasetFileSchema>;
