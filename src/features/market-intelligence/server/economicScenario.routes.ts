import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import {
    economicScenarioListQuerySchema,
    economicScenarioParamsSchema,
    economicScenarioSaveSchema,
} from './economicScenario.schemas.js';
import { economicScenarioService } from './economicScenario.service.js';

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        handler(req, res).catch(next);
    };
}

export const economicScenarioRoutes = Router();

// Custos, margem e política de investimento são dados gerenciais. A trilha econômica não fica
// disponível para CLOSER/SDR/VISUALIZADOR mesmo quando estes papéis conseguem ler outros recortes
// do Market Intelligence.
economicScenarioRoutes.use(requireRole(['ADMIN', 'GESTOR']));

economicScenarioRoutes.get('/', asyncHandler(async (req, res) => {
    const auth = req as AuthRequest;
    const query = economicScenarioListQuerySchema.parse(req.query);
    const data = await economicScenarioService.list(auth.user.organizationId, query);
    res.json({ success: true, data });
}));

economicScenarioRoutes.get('/:id', asyncHandler(async (req, res) => {
    const auth = req as AuthRequest;
    const { id } = economicScenarioParamsSchema.parse(req.params);
    const data = await economicScenarioService.get(auth.user.organizationId, id);
    res.json({ success: true, data });
}));

economicScenarioRoutes.post('/', asyncHandler(async (req, res) => {
    const auth = req as AuthRequest;
    const input = economicScenarioSaveSchema.parse(req.body);
    const data = await economicScenarioService.save(auth.user.organizationId, auth.user.id, input);
    res.status(201).json({ success: true, data });
}));
