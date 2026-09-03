import type { Request, Response, NextFunction } from 'express';
import {
  type AutomationUseCases,
  AUTOMATION_TRIGGERS,
  AUTOMATION_ACTIONS,
} from '../application/AutomationUseCases';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken';
import { routeParam } from '../../../shared/http/routeParams';

export class AutomationController {
  constructor(private automationUseCases: AutomationUseCases) {}

  getOptions = (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: { triggers: AUTOMATION_TRIGGERS, actions: AUTOMATION_ACTIONS },
    });
  };

  getAutomations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      res.json({
        success: true,
        data: await this.automationUseCases.listAutomations(organizationId),
      });
    } catch (error) {
      next(error);
    }
  };

  createAutomation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const created = await this.automationUseCases.createAutomation(organizationId, req.body);
      res.status(201).json({ success: true, data: created });
    } catch (error) {
      next(error);
    }
  };

  updateAutomation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId, email } = (req as AuthRequest).user;
      const updated = await this.automationUseCases.updateAutomation(
        organizationId,
        routeParam(req.params.id, 'id'),
        req.body,
        { userId, email },
      );
      if (!updated) {
        res.status(404).json({ success: false, error: 'Automação não encontrada.' });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };

  deleteAutomation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId, email } = (req as AuthRequest).user;
      const ok = await this.automationUseCases.removeAutomation(
        organizationId,
        routeParam(req.params.id, 'id'),
        {
          userId,
          email,
        },
      );
      if (!ok) {
        res.status(404).json({ success: false, error: 'Automação não encontrada.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/automations/:id/versions — histórico de versões da regra (Onda 42). */
  getVersions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const timeline = await this.automationUseCases.listVersions(
        organizationId,
        routeParam(req.params.id, 'id'),
      );
      if (!timeline) {
        res.status(404).json({ success: false, error: 'Automação não encontrada.' });
        return;
      }
      res.json({ success: true, data: timeline });
    } catch (error) {
      next(error);
    }
  };

  /** POST /api/automations/:id/dry-run — simula a regra contra o dado atual, sem executar a ação (Onda 42). */
  dryRunAutomation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const limit = Number(req.body?.limit ?? req.query?.limit);
      const result = await this.automationUseCases.dryRun(
        organizationId,
        routeParam(req.params.id, 'id'),
        {
          limit: Number.isFinite(limit) ? limit : undefined,
        },
      );
      if (!result) {
        res.status(404).json({ success: false, error: 'Automação não encontrada.' });
        return;
      }
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}
