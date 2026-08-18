import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import type { ZodType } from 'zod';

import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import {
    accountParamsSchema,
    decisionMakerQuerySchema,
    evidenceQuerySchema,
    recommendationQuerySchema,
    relationshipQuerySchema,
    signalQuerySchema,
} from './accountIntelligence.schemas.js';
import {
    AccountIntelligenceService,
    type AccountIntelligenceServiceContract,
} from './accountIntelligence.service.js';

export interface AccountIntelligenceRouterDependencies {
    serviceFactory?: (req: AuthRequest) => AccountIntelligenceServiceContract;
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new AppError('Parâmetros inválidos.', 400, result.error.issues);
    }
    return result.data;
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        handler(req, res).catch(next);
    };
}

function defaultServiceFactory(req: AuthRequest): AccountIntelligenceServiceContract {
    if (!req.db) {
        throw new AppError('Contexto de organização não inicializado.', 500);
    }
    return new AccountIntelligenceService(req.db, req.user.organizationId);
}

export function createAccountIntelligenceRouter(
    dependencies: AccountIntelligenceRouterDependencies = {},
) {
    const router = Router();
    const serviceFactory = dependencies.serviceFactory ?? defaultServiceFactory;

    // Defesa em profundidade. O mount real ainda deve aplicar authenticateToken + requireTenant.
    // VISUALIZADOR é o menor papel canônico, então qualquer papel real pode ler; desconhecidos falham.
    router.use(requireRole(['VISUALIZADOR']));

    router.get('/accounts/:id/intelligence', asyncHandler(async (req, res) => {
        const { id } = parse(accountParamsSchema, req.params);
        const data = await serviceFactory(req as AuthRequest).getIntelligence(id);
        res.json({ success: true, data });
    }));

    router.post(
        '/accounts/:id/refresh',
        requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']),
        asyncHandler(async (req, res) => {
            const { id } = parse(accountParamsSchema, req.params);
            const data = await serviceFactory(req as AuthRequest).refresh(id);
            res.status(data.created ? 201 : 200).json({ success: true, data });
        }),
    );

    router.get('/accounts/:id/signals', asyncHandler(async (req, res) => {
        const { id } = parse(accountParamsSchema, req.params);
        const query = parse(signalQuerySchema, req.query);
        const data = await serviceFactory(req as AuthRequest).listSignals(id, query);
        res.json({ success: true, data });
    }));

    router.get('/accounts/:id/decision-makers', asyncHandler(async (req, res) => {
        const { id } = parse(accountParamsSchema, req.params);
        const query = parse(decisionMakerQuerySchema, req.query);
        const data = await serviceFactory(req as AuthRequest).listDecisionMakers(id, query);
        res.json({ success: true, data });
    }));

    router.get('/accounts/:id/relationships', asyncHandler(async (req, res) => {
        const { id } = parse(accountParamsSchema, req.params);
        const query = parse(relationshipQuerySchema, req.query);
        const data = await serviceFactory(req as AuthRequest).listRelationships(id, query);
        res.json({ success: true, data });
    }));

    router.get('/accounts/:id/recommendations', asyncHandler(async (req, res) => {
        const { id } = parse(accountParamsSchema, req.params);
        const query = parse(recommendationQuerySchema, req.query);
        const data = await serviceFactory(req as AuthRequest).listRecommendations(id, query);
        res.json({ success: true, data });
    }));

    router.get('/accounts/:id/evidence', asyncHandler(async (req, res) => {
        const { id } = parse(accountParamsSchema, req.params);
        const query = parse(evidenceQuerySchema, req.query);
        const data = await serviceFactory(req as AuthRequest).listEvidence(id, query);
        res.json({ success: true, data });
    }));

    return router;
}

export const accountIntelligenceRoutes = createAccountIntelligenceRouter();
