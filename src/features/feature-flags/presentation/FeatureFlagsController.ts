import type { Request, Response, NextFunction } from 'express';
import type { FeatureFlagsUseCases } from '../application/FeatureFlagsUseCases.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { routeParam } from '../../../shared/http/routeParams.js';

export class FeatureFlagsController {
  constructor(private featureFlagsUseCases: FeatureFlagsUseCases) {}

  // GET /api/feature-flags — lista resolvida (default global + override da própria organização já
  // aplicado). Qualquer papel autenticado pode ler: o frontend usa isto para decidir o que mostrar
  // (ex.: `useFeatureFlag('bug_report_module')`), e saber que um flag existe não é sensível.
  listResolved = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const flags = await this.featureFlagsUseCases.listResolvedForOrganization(organizationId);
      res.json({ success: true, data: flags });
    } catch (error) {
      next(error);
    }
  };

  // PUT /api/feature-flags/:key — liga/desliga o flag para a PRÓPRIA organização do usuário
  // autenticado. Restrito a ADMIN, mesmo padrão de lgpd.routes.ts para operação sensível
  // (aqui, sensível porque muda comportamento visível de toda a organização, não só do autor).
  setOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const key = routeParam(req.params.key, 'key');
      const { enabled } = req.body as { enabled?: unknown };

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: '"enabled" precisa ser um booleano.' });
        return;
      }

      const result = await this.featureFlagsUseCases.setOverrideForOrganization(
        organizationId,
        key,
        enabled,
        userId,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/feature-flags/:key — remove o override da organização, revertendo ao default
  // global do catálogo (FEATURE_FLAG_REGISTRY).
  clearOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const key = routeParam(req.params.key, 'key');
      const result = await this.featureFlagsUseCases.clearOverrideForOrganization(
        organizationId,
        key,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}
