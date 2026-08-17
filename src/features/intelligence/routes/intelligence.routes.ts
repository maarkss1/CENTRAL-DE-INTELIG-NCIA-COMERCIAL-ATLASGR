import { Router, Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
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
    extractActionItems,
    type PiiValue
} from '../../../lib/ai/features.js';


import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { aiService } from '../services/ai.service.js';
import { leadsQueue } from '../../../lib/queue/index.js';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { listPendingActions, approvePendingAction, discardPendingAction } from '../services/pending-actions.service.js';
import { listAiSettings, saveAiSettings } from '../services/ai-settings.service.js';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { studioGenerationSchema, studioService, type StudioGenerationRequest } from '../services/studio.service.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { aiSuiteRouter } from './ai-suite.routes.js';

const router = Router();

router.use('/suite', aiSuiteRouter);

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
    refinementInstruction: z.string().trim().max(500).optional(),
});

router.post('/', validateRequest(contentGenerationSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { tool, leadId, competitor, tone, objective, personaFallback, brandId, refinementInstruction } = req.body as z.infer<typeof contentGenerationSchema>;
        const authRequest = req as AuthRequest;
        const result = await aiService.generateContent(tool, leadId, {
            competitor,
            tone,
            objective,
            personaFallback,
            brandId,
            organizationId: authRequest.user.organizationId,
            refinementInstruction,
        });
        res.json({ success: true, data: { result }, result });
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

        const organizationId = (req as AuthRequest).user.organizationId;

        // QUEUE-002: organizationId agora viaja no job — sem ele o worker não tinha como escopar a
        // query por tenant (ver createLeadsWorker em src/lib/queue/index.ts), e a atualização final
        // do lead sempre falhava sob RLS. `jobId` determinístico (por tenant+lead) faz um clique
        // duplo, ou um segundo pedido de qualificação antes do primeiro terminar, reaproveitar o job
        // já em fila/execução em vez de gastar uma segunda chamada de IA e correr duas atualizações
        // concorrentes do mesmo lead.
        let job: { id?: string };
        if (leadsQueue) {
            const jobId = `qualify-lead:${organizationId}:${leadId}`;
            const existing = await leadsQueue.getJob(jobId);
            const existingState = existing ? await existing.getState() : null;

            if (existingState && ['waiting', 'active', 'delayed'].includes(existingState)) {
                // Já há uma qualificação em andamento para este lead — reaproveita em vez de
                // duplicar a chamada de IA e correr duas atualizações concorrentes do mesmo lead.
                job = existing!;
            } else {
                // Job anterior com este id já terminou (completed/failed) ou nunca existiu: remove
                // antes de reusar o mesmo jobId — mesmo padrão de debounce-por-id já usado em
                // whatsappSignal.worker.ts, para nunca colidir com um job terminal retido pelo TTL
                // de `removeOnComplete`/`removeOnFail`.
                if (existing) await existing.remove().catch(() => {});
                job = await leadsQueue.add(
                    'qualify-lead',
                    // companyInfo é opcional — quando ausente, o worker busca os dados reais da empresa no CRM.
                    { leadId, companyInfo: companyInfo || '', organizationId },
                    { jobId },
                );
            }
        } else {
            job = { id: 'no-queue' };
        }

        res.status(202).json({
            message: 'Lead qualification started in background',
            jobId: job.id
        });
    } catch (error) {
        logger.error({ err: error }, 'Error queuing lead qualification');
        next(error);
    }
});

import { SDRQualificationAgent } from '../agents/sdr.agent.js';

router.post('/agents/sdr/qualify', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { leadId, sessionId } = req.body as { leadId?: string; sessionId?: string };

        if (!leadId) {
            res.status(400).json({ error: 'Missing leadId' });
            return;
        }

        // Para evitar timeout da requisição HTTP, rodamos o agente assíncronamente sem esperar
        // (Numa infra real, isso também iria pro BullMQ)
        const agent = new SDRQualificationAgent();
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

// A rota acima dispara o SDRQualificationAgent sem aguardar e devolve 202 imediatamente — sem esta
// rota não havia nenhuma forma de buscar o resultado depois (o cliente ficava sem saber quando/se a
// qualificação terminou). O agente persiste seu progresso em AgentMemory a cada rodada do grafo
// (sdr.agent.ts updateMemory), então "ainda não existe registro" é o sinal confiável de "pendente".
router.get('/agents/sdr/status/:sessionId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const authRequest = req as AuthRequest;

        const memory = await prisma.agentMemory.findFirst({
            where: { sessionId, organizationId: authRequest.user.organizationId, agentType: 'SDR' },
        });

        if (!memory) {
            res.status(202).json({ status: 'pending', sessionId });
            return;
        }

        res.json({ status: 'completed', sessionId, messages: memory.messages });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching SDR agent status');
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
        const pendingActions = await listPendingActions(db, authRequest.user.organizationId);
        res.json(pendingActions);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching pending actions');
        next(error);
    }
});

// SEC-011: aprovar uma AIPendingAction dispara efeito real (enviar e-mail, criar nota/atividade —
// ver executeAction em aiPendingAction.service.ts), então é uma confirmação humana de ação de alto
// impacto, não uma leitura. Sem `requireRole` aqui, qualquer papel autenticado do tenant — inclusive
// VISUALIZADOR (só leitura, ROLE_HIERARCHY=10) — podia aprovar/descartar, contornando a hierarquia
// de papéis. Mesmo corte de VISUALIZADOR já aplicado por 01 em agent.routes.ts (`/swarm/mission`).
const pendingActionRoles = requireRole(['ADMIN', 'GESTOR', 'VENDEDOR']);

router.post('/pending/:id/approve', pendingActionRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const authRequest = req as AuthRequest;
        const db = authRequest.db || prisma;
        const result = await approvePendingAction(db, authRequest.user.organizationId, id);
        if (!result) {
            res.status(404).json({ success: false, error: 'Ação pendente não encontrada.' });
            return;
        }

        logger.info({ actionId: id, sent: result.execution.sent, reason: result.execution.reason }, 'AI action approved');

        res.json({ success: true, data: { action: result.action, execution: result.execution } });
    } catch (error) {
        logger.error({ err: error }, 'Error approving action');
        next(error);
    }
});

router.delete('/pending/:id', pendingActionRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authRequest = req as AuthRequest;
        const db = authRequest.db || prisma;
        const discarded = await discardPendingAction(db, authRequest.user.organizationId, req.params.id);
        if (!discarded) {
            res.status(404).json({ success: false, error: 'Ação pendente não encontrada.' });
            return;
        }
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
        const settings = await listAiSettings();
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
            model: z.enum(['local-llama3', 'local-llama3-fast', 'qwen-coder', 'deepseek-coder']),
            temperature: z.number().min(0).max(2),
        }),
    ),
});

// Config global de IA (sem organizationId — afeta todos os tenants), então só ADMIN grava.
router.put('/ai-settings', requireRole(['ADMIN']), validateRequest(putAiSettingsSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { settings } = req.body as {
            settings: { toolKey: string; provider: string; model: string; temperature: number }[];
        };

        const saved = await saveAiSettings(settings);

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

// PC-008: o relatório era devolvido ao frontend e nunca persistido — sumia ao navegar/recarregar
// a tela (ReportsHub mantinha só em estado local). Persiste aqui e expõe GET /report/latest
// abaixo para a tela carregar o último relatório gerado da organização ao montar.
router.get('/report/latest', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const organizationId = (req as AuthRequest).user.organizationId;
        const latest = await prisma.report.findFirst({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: latest });
    } catch (error) {
        next(error);
    }
});

router.post('/report', validateRequest(reportSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const organizationId = (req as AuthRequest).user.organizationId;
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

        const model = getAiModel('local-llama3-fast', 0.4, 'report_interpretation');
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

        const saved = await prisma.report.create({
            data: {
                organizationId,
                brandId,
                content: String(response.content),
                metrics: metrics as Prisma.InputJsonValue,
            },
        });

        res.json({ result: saved.content, reportId: saved.id, createdAt: saved.createdAt });
    } catch (error) {
        logger.error({ err: error }, 'Error generating report interpretation');
        next(error);
    }
});


// AI Toolkit Endpoints (Expose the 20 functionalities to frontend via single proxy or discrete endpoints)
// `any[]` é deliberado aqui (COD-004): as 20 funções abaixo têm aridades e tipos de parâmetro
// diferentes entre si. `unknown[]` faria o TS rejeitar a atribuição de cada função concreta a este
// Record (contravariância de parâmetros — `unknown` não é atribuível a `string`), e não há um tipo
// de união prático que descreva "uma função de N parâmetros de texto, N variando por chave". A
// aridade real de cada uma é validada em runtime contra AI_TOOLKIT_ARITY logo abaixo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aiToolkitFunctions: Record<string, (...args: any[]) => Promise<unknown>> = {
    summarizeLead, generateEmailDraft, predictConversionScore, generateMeetingAgenda,
    draftFollowUp, scoreLeadQuality, suggestNextAction, generateObjectionHandling,
    analyzeCompetitors, generateElevatorPitch, identifyPainPoints, createColdCallScript,
    summarizeMeetingNotes, generateLinkedInMessage, evaluateDealRisk, analyzeSentiment,
    extractKeywords, categorizeLead, translateText, extractActionItems
};

// Todas as funções do toolkit recebem apenas argumentos de texto — o número abaixo é a aridade
// real de cada uma (ver src/lib/ai/features.ts), usado para validar a chamada antes do dispatch.
const AI_TOOLKIT_ARITY: Record<string, number> = {
    summarizeLead: 1, generateEmailDraft: 2, predictConversionScore: 1, generateMeetingAgenda: 2,
    draftFollowUp: 1, scoreLeadQuality: 1, suggestNextAction: 2, generateObjectionHandling: 1,
    analyzeCompetitors: 1, generateElevatorPitch: 1, identifyPainPoints: 1, createColdCallScript: 2,
    summarizeMeetingNotes: 1, generateLinkedInMessage: 2, evaluateDealRisk: 1, analyzeSentiment: 1,
    extractKeywords: 1, categorizeLead: 1, translateText: 2, extractActionItems: 1,
};

// Normaliza o campo opcional `piiValues` do corpo da requisição: descarta silenciosamente
// entradas malformadas (não é um contrato de segurança — só controla o que é minimizado antes de
// ir pro provedor externo, então falhar aberto para "nenhum valor" é seguro e não bloqueia quem
// não sabe/precisa desse recurso).
function normalizePiiValues(raw: unknown): PiiValue[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is PiiValue => (
        typeof entry === 'object' && entry !== null
        && typeof (entry as { token?: unknown }).token === 'string'
        && (typeof (entry as { value?: unknown }).value === 'string' || (entry as { value?: unknown }).value == null)
    ));
}

router.post('/toolkit/execute', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { functionName, args, piiValues } = req.body as { functionName?: unknown; args?: unknown; piiValues?: unknown };

        if (typeof functionName !== 'string' || !aiToolkitFunctions[functionName]) {
            res.status(400).json({ error: 'Function not found in AI Toolkit' });
            return;
        }

        const expectedArity = AI_TOOLKIT_ARITY[functionName];
        const isValidArgs = Array.isArray(args)
            && args.length === expectedArity
            && args.every((arg) => typeof arg === 'string' && arg.trim().length > 0);
        if (!isValidArgs) {
            res.status(400).json({
                error: `A função "${functionName}" espera ${expectedArity} argumento(s) de texto não vazio.`,
            });
            return;
        }

        // piiValues é opcional: quem chama a API e conhece um dado de PII no texto (ex.: nome do
        // contato de um lead) pode informá-lo aqui para que seja minimizado antes de ir ao
        // provedor de IA externo e restaurado na resposta — mesmo padrão de ai.service.ts/crmTools.ts.
        const result = await aiToolkitFunctions[functionName](...(args as string[]), normalizePiiValues(piiValues));
        res.json({ success: true, result });
    } catch (error) {
        logger.error({ err: error }, 'Error executing AI Toolkit function');
        next(error);
    }
});

// ── Win/Loss Analysis ────────────────────────────────────────────────────────
// Roda a análise imediatamente (em vez de aguardar o cron de sexta) e devolve
// o resultado. Útil para o usuário disparar manualmente pela UI.
router.post('/win-loss-analysis', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const organizationId = (req as AuthRequest).user?.organizationId;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const leads = await prisma.lead.findMany({
            where: {
                ...(organizationId ? { organizationId } : {}),
                status: { in: ['Convertido_em_Oportunidade', 'Lead_Desqualificado', 'Negocios_Perdidos', 'Negocios_Ganhos'] },
                updatedAt: { gte: sevenDaysAgo }
            },
            include: {
                whatsAppMessages: {
                    select: { body: true, direction: true },
                    take: 15
                },
                timeline: {
                    select: { description: true },
                    take: 10
                }
            },
            take: 30
        });

        if (leads.length === 0) {
            res.json({ analysis: 'Nenhum lead fechado nos últimos 7 dias para analisar. Aguarde o acúmulo de dados ou expanda o período de busca.' });
            return;
        }

        const dataStr = leads.map(l => {
            const msgs = l.whatsAppMessages.map(m => `${m.direction}: ${m.body || '(sem texto)'}`).join(' | ');
            const tl = l.timeline.map(t => t.description).join(' | ');
            return `Lead ID: ${l.id} | Status: ${l.status}\nInterações: ${msgs || 'Sem mensagens'}\nTimeline: ${tl || 'Sem timeline'}\n---`;
        }).join('\n');

        const model = getAiModel('local-llama3-fast', 0.3, 'win-loss-analysis');
        const response = await model.invoke([
            new SystemMessage(`Você é um analista comercial sênior especialista em RevOps e vendas B2B.
Leia as transcrições e timelines dos leads Fechados (Ganhos e Perdidos) desta semana.
Responda com EXATAMENTE 3 tópicos numerados:

1. **O que os leads ganhos têm em comum**: padrões de comportamento, objeções superadas, sinais de compra
2. **Principais objeções/motivos de perda**: o que fez os leads não comprarem
3. **Recomendação prática para o time**: 1 ação concreta para melhorar a taxa de conversão

Seja específico, use dados dos leads. Evite generalizações vagas.`),
            new HumanMessage(`Dados da semana:\n\n${dataStr}`)
        ]);

        const analysis = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        logger.info(
            { organizationId, leadsAnalyzed: leads.length, tool: 'win-loss-analysis' },
            '[WinLoss] Análise manual disparada com sucesso'
        );

        res.json({ analysis, leadsAnalyzed: leads.length });
    } catch (error) {
        logger.error({ err: error }, 'Falha no Win/Loss Analysis manual');
        next(error);
    }
});

export const intelligenceRoutes = router;

