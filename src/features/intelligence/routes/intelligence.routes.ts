import { Router, Request, Response, NextFunction } from 'express';

import { aiService } from '../services/ai.service.js';
import { leadsQueue } from '../../../lib/queue/index.js';
import { logger } from '../../../lib/logger.js';

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

export const intelligenceRoutes = router;
