import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { logger } from '../../../lib/logger.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { synthesizeSpeech } from '../services/voicebox.service.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

const ttsRequestSchema = z.object({
    text: z.string().trim().min(1, 'Texto vazio').max(2_000),
});

router.post('/tts', validateRequest(ttsRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { text } = req.body as z.infer<typeof ttsRequestSchema>;
        const audio = await synthesizeSpeech(text);
        res.setHeader('Content-Type', 'audio/wav');
        res.send(audio);
    } catch (error) {
        logger.error({ err: error }, 'Voicebox TTS request failed');
        next(error);
    }
});

// --- SWARM & CONTINUOUS LEARNING ENDPOINTS ---
import { SwarmOrchestrator } from '../agents/supervisor.agent.js';
import { LearningAgent } from '../agents/learning.agent.js';
import { getSwarmSloSnapshot } from '../services/swarmScheduler.service.js';
import { getEvaluationMetricsSnapshot } from '../services/evaluationMetrics.service.js';
import { getDatasetSummary, validateToolUseCases } from '../evaluation/goldenDataset.service.js';

const swarmMissionSchema = z.object({
    mission: z.string().trim().min(1, 'A missão é obrigatória.').max(4_000),
    sessionId: z.string().trim().min(1).max(200).optional(),
    // Opcional: quando presente, permite ao Agente SDR do enxame buscar o contexto real do lead no
    // CRM em vez de tentar (e sempre falhar) usar o texto da missão como se fosse um ID — ver
    // sdrNode em supervisor.agent.ts (IA-003).
    leadId: z.string().trim().min(1).max(200).optional(),
});

router.post('/swarm/mission', writeRoles, validateRequest(swarmMissionSchema), async (req, res, next) => {
    try {
        const { mission, sessionId, leadId } = req.body as z.infer<typeof swarmMissionSchema>;
        const swarm = new SwarmOrchestrator();
        const result = await swarm.executeMission(mission, sessionId, leadId);
        // Retorna a última mensagem ou todo o contexto no formato esperado pelo api.ts (data envelope)
        res.json({ success: true, data: { messages: result.map(m => m.content) } });
    } catch (err) {
        next(err);
    }
});

router.post('/swarm/stream', writeRoles, validateRequest(swarmMissionSchema), async (req, res, next) => {
    try {
        const { mission, sessionId, leadId } = req.body as z.infer<typeof swarmMissionSchema>;
        const sid = sessionId || `swarm-mission-${Date.now()}`;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const swarm = new SwarmOrchestrator();

        await swarm.executeMissionStream(mission, sid, (event) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }, leadId);

        res.write('event: end\ndata: {}\n\n');
        res.end();
    } catch (err) {
        if (!res.headersSent) {
            next(err);
        } else {
            res.write(`event: error\ndata: ${JSON.stringify((err as Error).message)}\n\n`);
            res.end();
        }
    }
});

// AI-009 (Sprint 07/onda-20): fonte de dados e UI (SwarmDashboard.tsx, aba "SLO por agente") já
// existiam desde a onda 7 — só faltava esta rota, nunca registrada (ver
// .agents/handoffs/onda-7/13-para-07-rota-slo-swarm.md). `validateRequest` só valida `req.body`
// hoje (não `query`), então o parse de querystring é manual aqui.
const sloQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(90).optional(),
});

router.get('/swarm/slo', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = sloQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ success: false, error: parsed.error.flatten() });
            return;
        }
        const { organizationId } = (req as AuthRequest).user;
        const snapshot = await getSwarmSloSnapshot(organizationId, parsed.data.days ?? 30);
        res.json(snapshot);
    } catch (err) {
        next(err);
    }
});

// AI-006 (onda 35): harness real das 9 dimensões de avaliação do enxame — ver
// evaluationMetrics.service.ts. Mesma validação de querystring do /swarm/slo acima.
router.get('/evaluation-metrics', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = sloQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ success: false, error: parsed.error.flatten() });
            return;
        }
        const { organizationId } = (req as AuthRequest).user;
        const snapshot = await getEvaluationMetricsSnapshot(organizationId, parsed.data.days ?? 30);
        res.json(snapshot);
    } catch (err) {
        next(err);
    }
});

// AI-005 (onda 36): Golden Dataset real e versionado — ver goldenDataset.service.ts. Não é
// escopado por tenant (o dataset é um fixture de QA compartilhado, não dado de produção de uma
// organização) — só reaproveita a autenticação já aplicada em '/api/agent' pelo server.ts.
router.get('/golden-dataset/summary', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const summary = getDatasetSummary();
        const toolUseValidation = await validateToolUseCases();
        res.json({ summary, toolUseValidation });
    } catch (err) {
        next(err);
    }
});

router.post('/swarm/learn', async (req, res, next) => {
    try {
        // userId/organizationId vêm da sessão autenticada, nunca do body — do contrário qualquer
        // usuário logado poderia passar o organizationId de outro tenant e ler o AuditLog dele
        // (vazamento entre tenants), além de contaminar o perfil de estilo aprendido que os outros
        // agentes daquele tenant herdam depois.
        const { id: userId, organizationId } = (req as AuthRequest).user;
        const learningAgent = new LearningAgent();
        const guidelines = await learningAgent.reflectAndLearn(userId, organizationId);
        res.json({ success: true, learnedGuidelines: guidelines || 'Sem ações recentes suficientes para aprender.' });
    } catch (err) {
        next(err);
    }
});

export const agentRoutes = router;
