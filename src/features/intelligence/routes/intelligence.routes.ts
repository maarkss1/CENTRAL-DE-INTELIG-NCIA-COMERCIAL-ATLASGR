import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';

import { aiService } from '../services/ai.service.js';
import { leadsQueue } from '../../../lib/queue/index.js';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';

const router = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { tool, leadId, competitor } = req.body as { tool: string; leadId?: string; competitor?: string };
        const result = await aiService.generateContent(tool, leadId, { competitor });
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
        const query = req.query.q as string;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;

        if (!query) {
            res.status(400).json({ error: 'Search query (q) is required' });
            return;
        }

        const results = await VectorSearchService.searchChunks(query, limit);
        res.json({ results });
    } catch (error) {
        logger.error({ err: error }, 'Error performing vector search');
        next(error);
    }
});

// Rotas para AIPendingActions
router.get('/pending', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const db = (req as any).db || req.app.locals.prisma;
        const pendingActions = await db.aIPendingAction.findMany({
            where: { approved: false },
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
        const db = (req as any).db || req.app.locals.prisma;
        
        const action = await db.aIPendingAction.update({
            where: { id },
            data: { approved: true }
        });
        
        // Aqui enviaria o e-mail de verdade baseado no payload
        logger.info({ actionId: id }, 'AI Action approved and simulated execution');
        
        res.json({ success: true, action });
    } catch (error) {
        logger.error({ err: error }, 'Error approving action');
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
            provider: z.string().min(1),
            model: z.string().min(1),
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
});

router.post('/report', validateRequest(reportSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { metrics } = req.body as { metrics: Record<string, unknown> };

        const prompt = `Você é um analista de operações comerciais da Atlas (SaaS de inteligência logística e gerenciamento de risco).
Abaixo estão os números atuais da plataforma (CRM, prospecção e pipeline):

${JSON.stringify(metrics, null, 2)}

Escreva um relatório executivo curto em Markdown interpretando esses dados para a liderança comercial:
1. Um resumo de 2-3 frases do estado atual.
2. Os 2 pontos mais fortes e os 2 pontos mais fracos, cada um em uma linha.
3. 3 recomendações de ação concretas e priorizadas para a próxima semana.
Baseie-se SOMENTE nos números fornecidos acima — nunca invente métricas que não estão no JSON.`;

        const model = getAiModel('gemini-flash', 0.4, 'report_interpretation');
        const startTime = Date.now();
        const response = await model.invoke([new HumanMessage(prompt)]);
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

export const intelligenceRoutes = router;
