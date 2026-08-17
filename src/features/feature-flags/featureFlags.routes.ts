import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../shared/middlewares/requireRole.js';
import { featureFlagsService } from './featureFlags.service.js';

export const featureFlagsRouter = Router();

// GET /api/feature-flags — lista resolvida (default global + override da própria organização já
// aplicado). Qualquer papel autenticado pode ler: o frontend usa isto para decidir o que mostrar
// (ex.: `useFeatureFlag('bug_report_module')`), e saber que um flag existe não é sensível.
featureFlagsRouter.get('/', (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        const { organizationId } = (req as AuthRequest).user;
        const flags = await featureFlagsService.listResolvedForOrganization(organizationId);
        res.json({ success: true, data: flags });
    })().catch(next);
});

// PUT /api/feature-flags/:key — liga/desliga o flag para a PRÓPRIA organização do usuário
// autenticado. Restrito a ADMIN, mesmo padrão de lgpd.routes.ts para operação sensível
// (aqui, sensível porque muda comportamento visível de toda a organização, não só do autor).
featureFlagsRouter.put('/:key', requireRole(['ADMIN']), (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        const { key } = req.params;
        const { enabled } = req.body as { enabled?: unknown };

        if (typeof enabled !== 'boolean') {
            res.status(400).json({ success: false, error: '"enabled" precisa ser um booleano.' });
            return;
        }

        const result = await featureFlagsService.setOverrideForOrganization(organizationId, key, enabled, userId);
        res.json({ success: true, data: result });
    })().catch(next);
});

// DELETE /api/feature-flags/:key — remove o override da organização, revertendo ao default
// global do catálogo (FEATURE_FLAG_REGISTRY).
featureFlagsRouter.delete('/:key', requireRole(['ADMIN']), (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        const { organizationId } = (req as AuthRequest).user;
        const { key } = req.params;
        const result = await featureFlagsService.clearOverrideForOrganization(organizationId, key);
        res.json({ success: true, data: result });
    })().catch(next);
});
