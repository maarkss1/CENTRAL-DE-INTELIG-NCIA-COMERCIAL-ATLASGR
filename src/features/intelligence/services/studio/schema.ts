import { z } from 'zod';

export const shortText = z.string().trim().min(1).max(300);
export const brandSchema = z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(500),
});

export const studioGenerationSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('email'),
        brand: brandSchema,
        inputs: z.object({
            companyName: shortText,
            contactName: shortText,
            sector: shortText,
            role: shortText,
            technologies: z.array(shortText).max(20),
            companySize: shortText,
            tone: z.enum(['consultative', 'direct', 'roi_focused', 'hyper_personalized']),
        }),
    }),
    z.object({
        kind: z.literal('call_script'),
        brand: brandSchema,
        inputs: z.object({
            companyName: shortText,
            contactName: shortText,
            sector: shortText,
            role: shortText,
            technologies: z.array(shortText).max(20),
            companySize: shortText,
            tone: z.enum(['consultative', 'direct', 'roi_focused', 'hyper_personalized']),
        }),
    }),
    z.object({
        kind: z.literal('message'),
        brand: brandSchema,
        inputs: z.object({
            companyName: shortText,
            contactName: shortText,
            sector: shortText,
            role: shortText,
            technologies: z.array(shortText).max(20),
            companySize: shortText,
            tone: z.enum(['consultative', 'direct', 'roi_focused', 'hyper_personalized']),
        }),
    }),
    z.object({
        kind: z.literal('ocr_extract'),
        brand: brandSchema,
        inputs: z.object({
            rawText: z.string().trim().min(1).max(4_000),
        }),
    }),
    z.object({
        kind: z.literal('b2b_matrix'),
        brand: brandSchema,
        inputs: z.object({
            icp: shortText,
            solution: shortText,
        }),
    }),
    z.object({
        kind: z.literal('training'),
        brand: brandSchema,
        inputs: z.object({
            topic: z.string().trim().min(3).max(500),
        }),
    }),
    z.object({
        kind: z.literal('methodology'),
        brand: brandSchema,
        inputs: z.object({
            framework: z.enum(['spin', 'snap', 'aida', 'meddpicc', 'challenger']),
            targetPersona: shortText,
            companySegment: shortText,
            icpSize: shortText,
            techStack: z.string().trim().max(1_000),
            solutionName: shortText,
            mainPainPoint: z.string().trim().min(5).max(1_000),
            mainBenefit: z.string().trim().min(5).max(1_000),
        }),
    }),
    z.object({
        kind: z.literal('script'),
        brand: brandSchema,
        inputs: z.object({
            language: shortText,
            purpose: shortText,
            framework: shortText,
            complexity: shortText,
            customContext: z.string().trim().max(2_000),
        }),
    }),
    z.object({
        kind: z.literal('automation'),
        brand: brandSchema,
        inputs: z.object({
            triggerId: shortText,
            trigger: shortText,
            actionId: shortText,
            action: shortText,
            toolId: shortText,
            tool: shortText,
            aiLayerId: shortText,
            aiLayer: shortText,
            goal: z.string().trim().min(5).max(1_000),
        }),
    }),
    z.object({
        kind: z.literal('assistant'),
        brand: brandSchema,
        inputs: z.object({
            question: z.string().trim().min(2).max(2_000),
            mode: z.enum(['internal', 'general']),
            localContext: z.string().trim().max(8_000).optional(),
        }),
    }),
    z.object({
        kind: z.literal('roleplay'),
        brand: brandSchema,
        inputs: z.object({
            persona: z.enum(['skeptical_cfo', 'strict_buyer', 'tech_director']),
            message: z.string().trim().min(2).max(2_000),
            transcript: z.array(z.object({
                sender: z.enum(['sdr', 'buyer']),
                text: z.string().trim().min(1).max(2_000),
            })).max(20),
            playbookContext: z.string().trim().max(4_000).optional(),
        }),
    }),
    z.object({
        kind: z.literal('superagent'),
        brand: brandSchema,
        inputs: z.object({
            name: shortText,
            provider: shortText,
            model: shortText,
            role: shortText,
            temperature: z.number().min(0).max(2),
            memory: shortText,
            tools: z.array(shortText).max(20),
        }),
    }),
]);

export type StudioGenerationRequest = z.infer<typeof studioGenerationSchema>;

export const emailResultSchema = z.object({
    subject: z.string().trim().min(3).max(140),
    body: z.string().trim().min(40).max(4_000),
    icpAnalysis: z.string().trim().min(10).max(600),
});

export const callScriptResultSchema = z.object({
    opening: z.string().trim().min(10).max(500),
    discoveryQuestions: z.array(z.string().trim().min(10).max(300)).min(3).max(5),
    objectionTips: z.array(z.object({
        objection: z.string().trim().min(5).max(300),
        response: z.string().trim().min(10).max(500),
    })).min(2).max(4),
    closing: z.string().trim().min(10).max(400),
    icpAnalysis: z.string().trim().min(10).max(600),
});

export const messageResultSchema = z.object({
    body: z.string().trim().min(20).max(700),
    followUpSuggestion: z.string().trim().min(10).max(300),
    icpAnalysis: z.string().trim().min(10).max(600),
});

export const ocrExtractResultSchema = z.object({
    tradeName: z.string().trim().min(1).max(200).nullable(),
    segment: z.string().trim().max(150).nullable(),
    location: z.string().trim().max(150).nullable(),
    phone: z.string().trim().max(40).nullable(),
    email: z.string().trim().max(150).nullable(),
    website: z.string().trim().max(200).nullable(),
    contactName: z.string().trim().max(150).nullable(),
    contactRole: z.string().trim().max(150).nullable(),
    confidence: z.enum(['alta', 'media', 'baixa']),
});

export const b2bResultSchema = z.object({
    pains: z.array(z.string().trim().min(10).max(700)).min(3).max(5),
    questions: z.array(z.string().trim().min(10).max(700)).min(3).max(5),
    objections: z.array(z.object({
        objection: z.string().trim().min(5).max(500),
        rebuttal: z.string().trim().min(10).max(1_000),
    })).min(3).max(5),
});

export const trainingResultSchema = z.object({
    title: z.string().trim().min(5).max(200),
    description: z.string().trim().min(20).max(700),
    steps: z.array(z.object({
        step: z.number().int().positive(),
        title: z.string().trim().min(3).max(180),
        detail: z.string().trim().min(20).max(1_200),
        tip: z.string().trim().min(10).max(600),
    })).min(3).max(5),
});

export const methodologyMetaSchema = z.object({
    persona: shortText,
    icpSize: shortText,
    fitAssessment: z.string().trim().min(10).max(300),
});

export const methodologyResultSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('spin'),
        meta: methodologyMetaSchema,
        situation: z.array(z.string().trim().min(10).max(700)).min(3).max(5),
        problem: z.array(z.string().trim().min(10).max(700)).min(3).max(5),
        implication: z.array(z.string().trim().min(10).max(700)).min(3).max(5),
        needPayoff: z.array(z.string().trim().min(10).max(700)).min(3).max(5),
    }),
    z.object({
        type: z.literal('snap'),
        meta: methodologyMetaSchema,
        simple: z.object({
            description: z.string().trim().min(20).max(1_000),
            checklist: z.array(z.string().trim().min(5).max(300)).min(2).max(5),
        }),
        invaluable: z.object({
            description: z.string().trim().min(20).max(1_000),
            differentiator: z.string().trim().min(10).max(500),
        }),
        align: z.object({
            description: z.string().trim().min(20).max(1_000),
            strategicFit: z.string().trim().min(10).max(500),
        }),
        priorities: z.object({
            description: z.string().trim().min(20).max(1_000),
            urgencyTrigger: z.string().trim().min(10).max(500),
        }),
    }),
    z.object({
        type: z.literal('aida'),
        meta: methodologyMetaSchema,
        attention: z.object({ hook: shortText, opening: z.string().trim().min(20).max(1_000) }),
        interest: z.object({ body: z.string().trim().min(20).max(1_500) }),
        desire: z.object({ proof: z.string().trim().min(20).max(1_500) }),
        action: z.object({ cta: z.string().trim().min(10).max(500) }),
    }),
    z.object({
        type: z.literal('meddpicc'),
        meta: methodologyMetaSchema,
        metrics: z.string().trim().min(10).max(700),
        economicBuyer: z.string().trim().min(10).max(700),
        decisionCriteria: z.string().trim().min(10).max(700),
        decisionProcess: z.string().trim().min(10).max(700),
        paperProcess: z.string().trim().min(10).max(700),
        identifiedPain: z.string().trim().min(10).max(700),
        champion: z.string().trim().min(10).max(700),
        competitors: z.string().trim().min(10).max(700),
    }),
    z.object({
        type: z.literal('challenger'),
        meta: methodologyMetaSchema,
        teach: z.object({ title: shortText, script: z.string().trim().min(20).max(1_500) }),
        tailor: z.object({ title: shortText, script: z.string().trim().min(20).max(1_500) }),
        takeControl: z.object({ title: shortText, script: z.string().trim().min(20).max(1_500) }),
    }),
]);

export const superagentAiResultSchema = z.object({
    summary: z.string().trim().min(20).max(700),
    systemPrompt: z.string().trim().min(200).max(8_000),
});

export const roleplayResultSchema = z.object({
    reply: z.string().trim().min(10).max(1_200),
    feedback: z.string().trim().min(10).max(800),
    clarity: z.number().int().min(0).max(100),
    objectionHandling: z.number().int().min(0).max(100),
});
