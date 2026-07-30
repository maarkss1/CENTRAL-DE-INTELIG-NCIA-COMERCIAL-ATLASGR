import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
    summarizeLead,
    generateEmailDraft,
    predictConversionScore,
    generateMeetingAgenda,
    draftFollowUp,
    scoreLeadQuality,
    suggestNextAction,
    generateObjectionHandling,
    analyzeCompetitors,
    generateElevatorPitch,
    identifyPainPoints,
    createColdCallScript,
    summarizeMeetingNotes,
    generateLinkedInMessage,
    evaluateDealRisk,
    analyzeSentiment,
    extractKeywords,
    categorizeLead,
    translateText,
    extractActionItems
} from '../../../lib/ai/features.js';


import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { aiService } from '../services/ai.service.js';
import { leadsQueue } from '../../../lib/queue/index.js';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { studioGenerationSchema, studioService, type StudioGenerationRequest } from '../services/studio.service.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const router = Router();

router.post('/studio', validateRequest(studioGenerationSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await studioService.generate(req.body as StudioGenerationRequest);
        res.json({ result });
    } catch (error) {
        logger.error({ err: error }, 'Error generating AI studio artifact');
        next(error);
    }
});

const contentGenerationSchema = z.object({
    tool: z.string().min(1).max(80),
    leadId: z.string().min(1).max(100).optional(),
    competitor: z.string().trim().max(200).optional(),
    tone: z.string().trim().max(80).optional(),
    objective: z.string().trim().max(100).optional(),
    personaFallback: z.string().trim().max(200).optional(),
    brandId: z.enum(['atlasgr', 'totaltrac']).default('atlasgr'),
});

router.post('/', validateRequest(contentGenerationSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { tool, leadId, competitor, tone, objective, personaFallback, brandId } = req.body as z.infer<typeof contentGenerationSchema>;
        const authRequest = req as AuthRequest;
        const result = await aiService.generateContent(tool, leadId, {
            competitor,
            tone,
            objective,
            personaFallback,
            brandId,
            organizationId: authRequest.user.organizationId,
        });
        res.json({ result });
    } catch (error: unknown) {
        const err = error as Error;
        if (err.message === 'Invalid tool' || err.message === 'Missing competitor') {
            res.status(400).json({ error: err.message });
            return;
        }
        logger.error({ err: error }, 'Error generating intelligence');
        next(error);
    }
});

router.post('/qualify', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { leadId, companyInfo } = req.body as { leadId?: string; companyInfo?: string };

        if (!leadId) {
            res.status(400).json({ error: 'Missing leadId' });
            return;
        }

        // companyInfo é opcional — quando ausente, o worker busca os dados reais da empresa no CRM.
        const job = await leadsQueue.add('qualify-lead', { leadId, companyInfo: companyInfo || '' });

        res.status(202).json({
            message: 'Lead qualification started in background',
            jobId: job.id
        });
    } catch (error) {
        logger.error({ err: error }, 'Error queuing lead qualification');
        next(error);
    }
});

import { SDRAgent } from '../agents/sdr.agent.js';

router.post('/agents/sdr/qualify', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { leadId, sessionId } = req.body as { leadId?: string; sessionId?: string };

        if (!leadId) {
            res.status(400).json({ error: 'Missing leadId' });
            return;
        }

        // Para evitar timeout da requisição HTTP, rodamos o agente assíncronamente sem esperar
        // (Numa infra real, isso também iria pro BullMQ)
        const agent = new SDRAgent();
        agent.run(leadId, sessionId).catch(err => {
            logger.error({ err, leadId }, 'SDR Agent background execution failed');
        });

        res.status(202).json({
            message: 'SDR Agent qualification started in background',
            leadId
        });
    } catch (error) {
        logger.error({ err: error }, 'Error starting SDR Agent');
        next(error);
    }
});

import { VectorSearchService } from '../services/vector-search.service.js';

router.get('/search', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const requestedLimit = Number.parseInt(String(req.query.limit || '5'), 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(20, requestedLimit))
            : 5;

        if (!query) {
            res.status(400).json({ error: 'Search query (q) is required' });
            return;
        }
        if (query.length > 2_000) {
            res.status(400).json({ error: 'Search query is too long' });
            return;
        }

        const organizationId = (req as AuthRequest).user.organizationId;
        const results = await VectorSearchService.searchChunks(query, organizationId, limit);
        res.json({ results });
    } catch (error) {
        logger.error({ err: error }, 'Error performing vector search');
        next(error);
    }
});

// Rotas para AIPendingActions
router.get('/pending', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authRequest = req as AuthRequest;
        const db = authRequest.db || prisma;
        const pendingActions = await db.AIPendingAction.findMany({
            where: {
                approved: false,
                organizationId: authRequest.user.organizationId,
            },
            orderBy: { id: 'desc' }
        });
        res.json(pendingActions);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching pending actions');
        next(error);
    }
});

router.post('/pending/:id/approve', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const authRequest = req as AuthRequest;
        const db = authRequest.db || prisma;
        const pendingAction = await db.AIPendingAction.findFirst({
            where: { id, organizationId: authRequest.user.organizationId, approved: false },
        });
        if (!pendingAction) {
            res.status(404).json({ success: false, error: 'Ação pendente não encontrada.' });
            return;
        }
        
        const action = await db.AIPendingAction.update({
            where: { id },
            data: { approved: true }
        });
        
        logger.info({ actionId: id }, 'AI action approved for downstream execution');
        
        res.json({ success: true, action });
    } catch (error) {
        logger.error({ err: error }, 'Error approving action');
        next(error);
    }
});

router.delete('/pending/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authRequest = req as AuthRequest;
        const db = authRequest.db || prisma;
        const pendingAction = await db.AIPendingAction.findFirst({
            where: {
                id: req.params.id,
                organizationId: authRequest.user.organizationId,
                approved: false,
            },
        });
        if (!pendingAction) {
            res.status(404).json({ success: false, error: 'Ação pendente não encontrada.' });
            return;
        }
        await db.AIPendingAction.delete({ where: { id: pendingAction.id } });
        res.status(204).send();
    } catch (error) {
        logger.error({ err: error }, 'Error discarding pending AI action');
        next(error);
    }
});

// Configuração de provider/modelo/temperatura por ferramenta de IA (usada pela tela AIConfigCenter).
// Sem registro para uma toolKey, `ai.service.ts` cai no TOOL_CONFIG hardcoded como padrão.
router.get('/ai-settings', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const settings = await prisma.aiEngineSetting.findMany({ orderBy: { toolKey: 'asc' } });
        res.json({ success: true, data: settings });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching AI engine settings');
        next(error);
    }
});

const putAiSettingsSchema = z.object({
    settings: z.array(
        z.object({
            toolKey: z.string().min(1),
            provider: z.literal('Groq'),
            model: z.enum(['gemini-pro', 'gemini-flash']),
            temperature: z.number().min(0).max(2),
        }),
    ),
});

router.put('/ai-settings', validateRequest(putAiSettingsSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { settings } = req.body as {
            settings: { toolKey: string; provider: string; model: string; temperature: number }[];
        };

        const saved = await prisma.$transaction(
            settings.map((s) =>
                prisma.aiEngineSetting.upsert({
                    where: { toolKey: s.toolKey },
                    update: { provider: s.provider, model: s.model, temperature: s.temperature },
                    create: s,
                }),
            ),
        );

        res.json({ success: true, data: saved });
    } catch (error) {
        logger.error({ err: error }, 'Error saving AI engine settings');
        next(error);
    }
});

// Geração e interpretação de relatórios via IA — recebe as métricas já calculadas pelo frontend
// (mesmo /api/analytics/overview usado no LiveStatsWidget) e devolve uma leitura executiva em Markdown.
const reportSchema = z.object({
    metrics: z.record(z.string(), z.unknown()),
    brandId: z.enum(['atlasgr', 'totaltrac']).default('atlasgr'),
});

router.post('/report', validateRequest(reportSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { metrics, brandId } = req.body as z.infer<typeof reportSchema>;
        const brandContext = brandId === 'totaltrac'
            ? 'TotalTrac (tecnologia para telemetria, videotelemetria, jornada e proteção de frotas)'
            : 'AtlasGR (inteligência comercial e gestão de risco logístico)';

        const systemPrompt = `Você é um analista de operações comerciais da ${brandContext}.
Escreva um relatório executivo curto em Markdown interpretando os dados fornecidos para a liderança comercial:
1. Um resumo de 2-3 frases do estado atual.
2. Os 2 pontos mais fortes e os 2 pontos mais fracos, cada um em uma linha.
3. 3 recomendações de ação concretas e priorizadas para a próxima semana.
Baseie-se SOMENTE nos números fornecidos acima — nunca invente métricas que não estão no JSON.`;
        const userPrompt = `Números atuais da plataforma (CRM, prospecção e pipeline):\n${JSON.stringify(metrics, null, 2)}`;

        const model = getAiModel('gemini-flash', 0.4, 'report_interpretation');
        const startTime = Date.now();
        const response = await model.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(userPrompt),
        ]);
        const latencyMs = Date.now() - startTime;

        await logAiUsage({
            model: response.response_metadata.model,
            usage: response.response_metadata.tokenUsage,
            latencyMs,
        });

        res.json({ result: response.content });
    } catch (error) {
        logger.error({ err: error }, 'Error generating report interpretation');
        next(error);
    }
});


// AI Toolkit Endpoints (Expose the 20 functionalities to frontend via single proxy or discrete endpoints)
router.post('/toolkit/execute', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { functionName, args } = req.body as { functionName: string; args: unknown[] };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aiFunctions: Record<string, (...args: any[]) => Promise<unknown>> = {
            summarizeLead, generateEmailDraft, predictConversionScore, generateMeetingAgenda,
            draftFollowUp, scoreLeadQuality, suggestNextAction, generateObjectionHandling,
            analyzeCompetitors, generateElevatorPitch, identifyPainPoints, createColdCallScript,
            summarizeMeetingNotes, generateLinkedInMessage, evaluateDealRisk, analyzeSentiment,
            extractKeywords, categorizeLead, translateText, extractActionItems
        };

        if (!aiFunctions[functionName]) {
            res.status(400).json({ error: 'Function not found in AI Toolkit' });
            return;
        }

        // Execute the function
        const result = await aiFunctions[functionName](...args);
        res.json({ success: true, result });
    } catch (error) {
        logger.error({ err: error }, 'Error executing AI Toolkit function');
        next(error);
    }
});

export const intelligenceRoutes = router;
